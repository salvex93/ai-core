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
 * Un lock por subagente se crea aqui. No hay release explicito en
 * SubagentStop (el pid del hook no correlaciona 1:1 con el agentId real
 * del subagente) — el lock expira solo via TTL, igual que las categorias
 * de process-guard.js. MAX_PARALLEL debe leerse como "hasta N subagentes
 * lanzados en los ultimos TIMEOUT_MS", no como contador exacto en vivo.
 *
 * Uso: node subagent-guard.js (recibe el evento PreToolUse por stdin)
 *
 * CLAUDE_TOOL_INPUT_subagent_type y CLAUDE_SUBAGENT_TYPE nunca existieron
 * como variables de entorno reales (confirmado contra
 * code.claude.com/docs/en/hooks para PreToolUse general: el dato real llega
 * por stdin como tool_input.<param>). El parametro subagent_type es el que
 * la propia tool Agent/Task documenta para su invocacion -- se lee de
 * tool_input.subagent_type por analogia directa con tool_input.command ya
 * confirmado para Bash. NOTA: el nombre exacto de este campo especifico para
 * el Agent tool no se re-verifico contra la doc oficial en esta sesion
 * (limite de uso de API alcanzado a mitad de la investigacion) -- si un test
 * de integracion real muestra que el campo tiene otro nombre, corregir aqui.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const MAX_PARALLEL = 3;        // alineado con la regla de CLAUDE.md; ajustar ahi tambien si cambia
const TIMEOUT_MS   = 2 * 60 * 1000; // 2 min — ventana de "lanzados recientemente", no timeout de ejecucion

const LOCK_DIR = path.join(require('os').tmpdir(), 'ai-core-locks', 'subagents');

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

// Anti-recursion: el subagente actual no puede lanzar otro de su mismo tipo
// sin que exista una condicion de parada explicita (esto bloquea el caso
// generico; un agente que necesite excepcion la declara en su propio prompt
// y usa SendMessage para continuar el mismo agente en vez de spawnear otro).
if (tipoActual && nuevoTipo && tipoActual === nuevoTipo) {
  process.stderr.write(
    `[SUBAGENT-GUARD] BLOQUEADO: el subagente "${tipoActual}" intento lanzar otro "${nuevoTipo}" (recursion del mismo tipo).\n` +
    'Si es intencional, usa SendMessage para continuar el agente existente en vez de spawnear uno nuevo.\n'
  );
  process.exit(2);
}

const activos = locksActivos();
if (activos.length >= MAX_PARALLEL) {
  process.stderr.write(
    `[SUBAGENT-GUARD] BLOQUEADO: ${activos.length}/${MAX_PARALLEL} subagentes activos. ` +
    'Espera a que termine alguno antes de lanzar otro.\n'
  );
  process.exit(2);
}

// Registrar el lock del nuevo subagente. El id es best-effort (timestamp+pid)
// porque el subagente real aun no tiene su propio agentId en este punto.
ensureDir();
const lockId   = crypto.randomBytes(6).toString('hex');
const lockFile = path.join(LOCK_DIR, `${Date.now()}-${lockId}.lock`);
try {
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, ts: Date.now(), tipo: nuevoTipo }), 'utf8');
} catch { /* no bloquear el spawn si el lock no se pudo escribir */ }

process.exit(0);
