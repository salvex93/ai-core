'use strict';

/**
 * injection-quarantine.js — Estado compartido de cuarentena por sesion entre
 * injection-guard.js (SubagentStop, detecta y marca) e
 * injection-quarantine-guard.js (PreToolUse, lee y bloquea).
 *
 * injection-guard.js no puede vetar el output de un subagente ya generado
 * (SubagentStop no lo permite -- ver su propia cabecera). Esta cuarentena es
 * el mecanismo que si veta: bloquea la PROXIMA accion real del agente padre
 * (Bash/Write/Edit) hasta que el humano la confirme, con el mismo patron de
 * bypass de un solo uso que jailbreak-guard.js (id no adivinable, generado
 * en el momento del hallazgo, TTL corto).
 */

const fs     = require('node:fs');
const path   = require('node:path');
const os     = require('node:os');
const crypto = require('node:crypto');

const TTL_MS = 10 * 60 * 1000; // 10 min -- ventana de cuarentena activa

// AI_CORE_INJECTION_QUARANTINE_DIR permite aislar en tests.
const sessionId = process.env.CLAUDE_CODE_SESSION_ID || 'unknown';
const QUARANTINE_DIR = process.env.AI_CORE_INJECTION_QUARANTINE_DIR
  || path.join(os.tmpdir(), 'ai-core-locks', 'injection-quarantine', sessionId);

function ensureDir() {
  try { fs.mkdirSync(QUARANTINE_DIR, { recursive: true }); } catch { /* ya existe */ }
}

/**
 * Registra un hallazgo de alta confianza y devuelve el id de cuarentena.
 * @param {{subagentName: string, hallazgos: string[]}} datos
 * @returns {string} id de 8 hex chars
 */
function marcarCuarentena({ subagentName, hallazgos }) {
  ensureDir();
  const id = crypto.randomBytes(4).toString('hex');
  const archivo = path.join(QUARANTINE_DIR, `${id}.json`);
  fs.writeFileSync(archivo, JSON.stringify({ ts: Date.now(), subagentName, hallazgos }), 'utf8');
  return id;
}

/**
 * Lista las cuarentenas activas (no vencidas), purgando las vencidas del
 * disco de paso.
 * @returns {Array<{id: string, ts: number, subagentName: string, hallazgos: string[]}>}
 */
function cuarentenasActivas() {
  ensureDir();
  let entradas = [];
  try { entradas = fs.readdirSync(QUARANTINE_DIR); } catch { return []; }

  const activas = [];
  for (const f of entradas) {
    const p = path.join(QUARANTINE_DIR, f);
    let datos;
    try { datos = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    if ((Date.now() - datos.ts) > TTL_MS) {
      try { fs.unlinkSync(p); } catch { /* ya limpiado por otro proceso */ }
      continue;
    }
    activas.push({ id: path.basename(f, '.json'), ...datos });
  }
  return activas;
}

/**
 * Consume (borra) una cuarentena por id exacto -- un solo uso. Retorna true
 * si existia y no habia vencido.
 * @param {string} id
 * @returns {boolean}
 */
function confirmarCuarentena(id) {
  ensureDir();
  const archivo = path.join(QUARANTINE_DIR, `${id}.json`);
  let datos;
  try { datos = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { return false; }
  try { fs.unlinkSync(archivo); } catch { /* best-effort */ }
  return (Date.now() - datos.ts) <= TTL_MS;
}

module.exports = { marcarCuarentena, cuarentenasActivas, confirmarCuarentena, QUARANTINE_DIR };
