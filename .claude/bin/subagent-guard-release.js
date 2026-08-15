#!/usr/bin/env node
'use strict';
/**
 * subagent-guard-release.js — Libera el lock de subagent-guard.js cuando el
 * subagente termina (hook SubagentStop).
 *
 * subagent-guard.js escribe un lock indexado por session_id+prompt_id al
 * lanzar un subagente (PreToolUse(Agent)). Sin release, MAX_PARALLEL contaba
 * lanzamientos en una ventana de TIMEOUT_MS sin importar si el subagente ya
 * habia terminado, bloqueando falsamente un spawn nuevo aunque los previos
 * ya hubieran finalizado. Este script borra exactamente ese lock por su
 * clave real -- si no existe (ya expiro por TTL, o nunca se creo con esos
 * campos), termina en silencio sin error.
 *
 * Uso: node subagent-guard-release.js (recibe el evento SubagentStop por stdin)
 *
 * Limitacion conocida (red-team 2026-08-15, sin fix estructural disponible
 * hoy): Claude Code no expone ningun mecanismo para probar que el proceso
 * que dispara SubagentStop es realmente el subagente dueño de session_id y
 * prompt_id -- cualquier valor en el evento se acepta como si fuera propio.
 * Un subagente que declarara valores ajenos podria liberar el cupo de otro
 * subagente activo antes de tiempo. El TTL de TIMEOUT_MS en subagent-guard.js
 * ya limita el impacto (2 min como cota maxima aun sin release), y el efecto
 * de un release prematuro es solo permitir un spawn adicional antes de lo
 * debido -- no una violacion de datos ni ejecucion de codigo.
 */

const fs   = require('fs');
const path = require('path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const LOCK_DIR = path.resolve(process.env.AI_CORE_SUBAGENT_LOCK_DIR || path.join(require('os').tmpdir(), 'ai-core-locks', 'subagents'));

const evento = leerEventoDeStdin();
const sessionId = evento.session_id || '';
const promptId  = evento.prompt_id || '';

if (sessionId && promptId) {
  const lockFile = path.resolve(path.join(LOCK_DIR, `${sessionId}__${promptId}.lock`));
  // Path traversal (red-team 2026-08-15): session_id/prompt_id con '/' o '..'
  // real podian escapar LOCK_DIR y borrar un archivo .lock arbitrario fuera
  // de el. La ruta resuelta debe permanecer dentro de LOCK_DIR.
  const dentroDeLockDir = lockFile === LOCK_DIR || lockFile.startsWith(LOCK_DIR + path.sep);
  if (dentroDeLockDir) {
    try { fs.unlinkSync(lockFile); } catch { /* ya expirado o nunca existio con esta clave */ }
  }
}

process.exit(0);
