#!/usr/bin/env node
'use strict';
/**
 * tool-repeat-guard.js — Deteccion de loop de tool calls identicas dentro
 * de un mismo agente (hilo principal o subagente).
 *
 * Gap real identificado en auditoria comparativa contra el estado del arte
 * de arneses de agentes 2026 (LangGraph/recursion_limit, practicas de
 * deteccion de loop de terceros): subagent-guard.js ya cubre fan-out
 * descontrolado (MAX_PARALLEL) y recursion de spawn (A->B->A), pero NINGUN
 * guard existente detecta si un unico agente repite la MISMA tool call con
 * los MISMOS argumentos varias veces seguidas sin avanzar -- el patron real
 * de "agente atascado reintentando ciegamente" que corresponde a la
 * necesidad declarada de "ejecucion confiable, cero desvarios".
 *
 * Bloquea (exit 2) cuando la combinacion (session_id, agent_type o "main",
 * tool_name, hash de tool_input) se repite mas de UMBRAL veces dentro de la
 * ventana TTL_MS. Deliberadamente NO bloquea en la primera ni segunda
 * repeticion -- un reintento legitimo tras corregir un error es normal
 * (ej. Edit fallido por old_string no unico, corregido y reintentado con
 * mas contexto ya seria un tool_input DISTINTO, no cuenta aqui). Solo la
 * repeticion EXACTA e ininterrumpida de argumentos identicos indica que el
 * agente no esta aprendiendo del fallo anterior.
 *
 * Excluye deliberadamente tools de solo lectura de bajo riesgo (Read, Grep,
 * Glob) del conteo estricto: releer el mismo archivo o repetir la misma
 * busqueda no es un loop peligroso, es un patron comun y barato. El foco es
 * en tools mutantes o de alto costo (Bash, Write, Edit, Agent, mcp__*) donde
 * un loop real desperdicia tokens y puede repetir una accion no idempotente.
 *
 * Uso: node tool-repeat-guard.js (recibe el evento PreToolUse por stdin)
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const UMBRAL  = 3; // permite 1a, 2a y 3a repeticion identica, bloquea la 4ta
const TTL_MS  = 5 * 60 * 1000; // ventana de "misma tarea en curso" -- mas larga que subagent-guard.js (2 min) porque un agente puede tardar en reintentar

// Tools de solo lectura de bajo riesgo: repetirlas no es un loop peligroso.
const TOOLS_EXCLUIDAS = new Set(['Read', 'Grep', 'Glob']);

const STATE_DIR = process.env.AI_CORE_TOOL_REPEAT_DIR
  || path.join(require('os').tmpdir(), 'ai-core-locks', 'tool-repeat');

const evento = leerEventoDeStdin();
const toolName = evento.tool_name || '';

if (!toolName || TOOLS_EXCLUIDAS.has(toolName)) {
  process.exit(0);
}

const sessionId = evento.session_id || 'sin-sesion';
const agentType = evento.agent_type || 'main';

function ensureDir() {
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); } catch { /* ya existe */ }
}

function hashInput(toolInput) {
  const serializado = JSON.stringify(toolInput || {}, Object.keys(toolInput || {}).sort());
  return crypto.createHash('sha256').update(serializado).digest('hex').slice(0, 16);
}

const clave = `${sessionId}__${agentType}__${toolName}__${hashInput(evento.tool_input)}`;
const archivoEstado = path.join(STATE_DIR, `${crypto.createHash('sha256').update(clave).digest('hex')}.json`);

ensureDir();

let estado = { count: 0, ts: Date.now() };
try {
  const previo = JSON.parse(fs.readFileSync(archivoEstado, 'utf8'));
  if ((Date.now() - previo.ts) <= TTL_MS) {
    estado = previo;
  }
} catch { /* sin estado previo o vencido, arranca en 0 */ }

estado.count += 1;
estado.ts = Date.now();

if (estado.count > UMBRAL) {
  process.stderr.write(
    `[TOOL-REPEAT-GUARD] BLOQUEADO: la tool "${toolName}" se repitio ${estado.count} veces con argumentos identicos ` +
    `en la misma sesion/agente (${agentType}) sin exito aparente -- patron de loop, no reintento legitimo.\n` +
    'Si el reintento es intencional (ej. esperar un recurso externo), cambia algo real en los argumentos o ' +
    'reporta el bloqueo explicito al usuario en vez de seguir reintentando identico.\n'
  );
  process.exit(2);
}

try {
  fs.writeFileSync(archivoEstado, JSON.stringify(estado), 'utf8');
} catch { /* no bloquear la tool call si el estado no se pudo escribir */ }

process.exit(0);
