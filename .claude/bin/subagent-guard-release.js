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
 */

const fs   = require('fs');
const path = require('path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const LOCK_DIR = process.env.AI_CORE_SUBAGENT_LOCK_DIR || path.join(require('os').tmpdir(), 'ai-core-locks', 'subagents');

const evento = leerEventoDeStdin();
const sessionId = evento.session_id || '';
const promptId  = evento.prompt_id || '';

if (sessionId && promptId) {
  const lockFile = path.join(LOCK_DIR, `${sessionId}__${promptId}.lock`);
  try { fs.unlinkSync(lockFile); } catch { /* ya expirado o nunca existio con esta clave */ }
}

process.exit(0);
