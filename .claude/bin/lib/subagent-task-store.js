'use strict';

/**
 * subagent-task-store.js — Correlaciona la tarea original de un subagente
 * (capturada en PreToolUse) con su evento SubagentStop correspondiente.
 *
 * Confirmado empiricamente (2026-07-22, lanzando un subagente real): el
 * tool_use_id de PreToolUse(Agent) y el agent_id de SubagentStop son valores
 * DISTINTOS -- no correlacionan entre si. session_id + prompt_id si son
 * identicos en ambos eventos del mismo subagente.
 *
 * PreToolUse(Agent) guarda tool_input.prompt aqui; SubagentStop lo recupera
 * por la misma clave (session_id + prompt_id) y lo consume (borra la
 * entrada al leerla). TTL de 10 min como red de seguridad ante un
 * SubagentStop que nunca llega (ej. subagente cancelado) -- evita que el
 * store crezca indefinidamente.
 */

const fs   = require('fs');
const path = require('path');

const STORE_PATH = path.join(require('os').tmpdir(), 'ai-core-subagent-tasks.json');
const TTL_MS = 10 * 60 * 1000;

function clave(sessionId, promptId) {
  return `${sessionId}::${promptId}`;
}

function leerStore() {
  if (!fs.existsSync(STORE_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); }
  catch { return {}; }
}

function escribirStore(store) {
  try { fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8'); }
  catch { /* best-effort, nunca bloquear el hook por esto */ }
}

/**
 * Guarda el prompt original de un subagente, indexado por session_id+prompt_id.
 *
 * @param {string} sessionId
 * @param {string} promptId
 * @param {string} prompt - tarea original con la que se lanzo el subagente
 */
function guardarTarea(sessionId, promptId, prompt) {
  if (!sessionId || !promptId || !prompt) return;
  const store = leerStore();
  store[clave(sessionId, promptId)] = { prompt, ts: new Date().toISOString() };
  escribirStore(store);
}

/**
 * Recupera y CONSUME (borra) la tarea original correspondiente a un
 * session_id+prompt_id. Retorna null si no existe o si supero el TTL.
 *
 * @param {string} sessionId
 * @param {string} promptId
 * @returns {string|null}
 */
function recuperarTarea(sessionId, promptId) {
  if (!sessionId || !promptId) return null;
  const store = leerStore();
  const k = clave(sessionId, promptId);
  const entrada = store[k];
  if (!entrada) return null;

  delete store[k];
  escribirStore(store);

  const vencida = (Date.now() - new Date(entrada.ts).getTime()) > TTL_MS;
  return vencida ? null : entrada.prompt;
}

module.exports = { guardarTarea, recuperarTarea, STORE_PATH };
