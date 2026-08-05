#!/usr/bin/env node
'use strict';
/**
 * subagent-guard.js — Enforcement real de concurrencia y anti-recursion de subagentes.
 *
 * Hasta ahora "Maximo 3 subagentes paralelos" y "prohibido spawn recursivo del
 * mismo tipo" eran solo prosa en CLAUDE.md, sin verificacion en PreToolUse.
 * Este guard corre ANTES de que el Agent tool lance el subagente (matcher
 * "Agent" en PreToolUse) y bloquea (exit 2) si:
 *   1. Ya hay MAX_PARALLEL subagentes activos (lock vivo, no stale).
 *   2. El subagente que se intenta lanzar es del mismo tipo que el que lo
 *      esta lanzando (recursion directa — el padre esta corriendo AGENT_TYPE
 *      y pide lanzar otro AGENT_TYPE).
 *
 * Un lock por subagente se crea aqui, indexado por session_id+prompt_id
 * (misma clave que subagent-task-store.js usa para correlacionar
 * PreToolUse(Agent) con su SubagentStop -- confirmado que tool_use_id y
 * agent_id NO correlacionan entre si, pero session_id+prompt_id si). El
 * companero subagent-guard-release.js corre en SubagentStop y borra el
 * lock exacto por esa clave. El TTL de TIMEOUT_MS sigue como red de
 * seguridad si el release nunca llega (subagente cancelado, proceso
 * matado), igual que las categorias de process-guard.js.
 *
 * Uso: node subagent-guard.js (recibe el evento PreToolUse por stdin)
 *
 * CLAUDE_TOOL_INPUT_subagent_type y CLAUDE_SUBAGENT_TYPE nunca existieron
 * como variables de entorno reales -- el dato real llega por stdin como
 * tool_input.subagent_type. Confirmado empiricamente (2026-07-22) capturando
 * el JSON real de un evento PreToolUse(Agent) en esta misma instalacion:
 * tool_input trae { description, prompt, subagent_type, model,
 * run_in_background } -- subagent_type es exactamente el nombre esperado.
 *
 * Tambien persiste tool_input.prompt (la tarea original) indexado por
 * session_id+prompt_id via lib/subagent-task-store.js, para que
 * subagent-grader.js (SubagentStop) pueda evaluar si el subagente cumplio
 * la tarea, no solo la calidad general del output. Confirmado empiricamente
 * que tool_use_id (este evento) y agent_id (SubagentStop) NO correlacionan
 * entre si -- session_id+prompt_id si son identicos en ambos eventos.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { leerEventoDeStdin } = require('./lib/hook-stdin');
const { guardarTarea } = require('./lib/subagent-task-store');

const MAX_PARALLEL = 3;        // alineado con la regla de CLAUDE.md; ajustar ahi tambien si cambia
const TIMEOUT_MS   = 2 * 60 * 1000; // 2 min — ventana de "lanzados recientemente", no timeout de ejecucion

// AI_CORE_SUBAGENT_LOCK_DIR permite operar sobre un directorio de locks
// temporal en tests -- sin ella, el directorio real es compartido a nivel
// de sistema operativo a proposito (asi el limite de MAX_PARALLEL cuenta
// subagentes lanzados por cualquier proceso, no solo por sesion).
const LOCK_DIR = process.env.AI_CORE_SUBAGENT_LOCK_DIR || path.join(require('os').tmpdir(), 'ai-core-locks', 'subagents');

const evento = leerEventoDeStdin();

// El tipo que se esta a punto de lanzar (parametro de la tool call entrante)
const nuevoTipo = process.env.CLAUDE_TOOL_INPUT_subagent_type
  || evento.tool_input?.subagent_type
  || '';
// El tipo del subagente actual, si quien pide el spawn ES a su vez un subagente
const tipoActual = process.env.CLAUDE_SUBAGENT_TYPE || evento.agent_type || '';

function ensureDir() {
  try { fs.mkdirSync(LOCK_DIR, { recursive: true }); } catch { /* ya existe */ }
}

// A diferencia de process-guard.js (que envuelve un proceso de larga duracion
// con spawnSync), este hook termina en milisegundos — "proceso vivo" no es
// señal util. El unico criterio de vigencia es la ventana de tiempo.
function isStale(lock) {
  if (!lock) return true;
  return (Date.now() - lock.ts) > TIMEOUT_MS;
}

function locksActivos() {
  ensureDir();
  let entradas = [];
  try { entradas = fs.readdirSync(LOCK_DIR); } catch { return []; }

  const activos = [];
  for (const f of entradas) {
    const p = path.join(LOCK_DIR, f);
    let lock;
    try { lock = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    if (isStale(lock)) {
      try { fs.unlinkSync(p); } catch { /* ya limpiado por otro proceso */ }
      continue;
    }
    activos.push(lock);
  }
  return activos;
}

const activos = locksActivos();

// Anti-recursion: bloquea tanto la recursion directa (A lanza A) como el
// ciclo indirecto (A lanza B, B lanza A). La cadena de ancestros de este
// spawn es la del lock activo cuyo tipo coincide con tipoActual (heredada)
// mas tipoActual mismo. Heuristica por tipo, no un id de linaje real (Claude
// Code no expone hoy un identificador estable de "bajo que lock corro este
// subagente") -- cubre el caso comun de un subagente por tipo activo a la
// vez; con 2+ subagentes del mismo tipo en paralelo podria heredar la
// cadena de cualquiera de ellos indistintamente.
const lockPadre = tipoActual ? activos.find((l) => l.tipo === tipoActual) : null;
const cadenaHeredada = lockPadre?.cadena || [];
const cadenaAncestros = tipoActual ? [...cadenaHeredada, tipoActual] : cadenaHeredada;

if (nuevoTipo && cadenaAncestros.includes(nuevoTipo)) {
  process.stderr.write(
    `[SUBAGENT-GUARD] BLOQUEADO: el subagente "${tipoActual}" intento lanzar "${nuevoTipo}", que ya aparece en la cadena de ancestros [${cadenaAncestros.join(' -> ')}] (recursion directa o ciclo indirecto).\n` +
    'Si es intencional, usa SendMessage para continuar el agente existente en vez de spawnear uno nuevo.\n'
  );
  process.exit(2);
}

if (activos.length >= MAX_PARALLEL) {
  process.stderr.write(
    `[SUBAGENT-GUARD] BLOQUEADO: ${activos.length}/${MAX_PARALLEL} subagentes activos. ` +
    'Espera a que termine alguno antes de lanzar otro.\n'
  );
  process.exit(2);
}

// Registrar el lock del nuevo subagente, incluida su cadena de ancestros
// (para que si este subagente a su vez lanza otro, pueda heredarla). Si hay
// session_id+prompt_id (caso real), el nombre del lock los codifica para que
// subagent-guard-release.js pueda borrarlo por clave exacta en SubagentStop.
// Sin esos campos (tests legacy, llamada sin contexto de sesion) cae a
// timestamp+random y depende solo del TTL, igual que antes.
ensureDir();
const lockId = evento.session_id && evento.prompt_id
  ? `${evento.session_id}__${evento.prompt_id}`
  : `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
const lockFile = path.join(LOCK_DIR, `${lockId}.lock`);
try {
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, ts: Date.now(), tipo: nuevoTipo, cadena: cadenaAncestros }), 'utf8');
} catch { /* no bloquear el spawn si el lock no se pudo escribir */ }

// Persistir la tarea original para que subagent-grader.js pueda evaluar
// cumplimiento de tarea en SubagentStop, no solo calidad general.
try {
  guardarTarea(evento.session_id, evento.prompt_id, evento.tool_input?.prompt || '');
} catch { /* best-effort, nunca bloquear el spawn por esto */ }

process.exit(0);
