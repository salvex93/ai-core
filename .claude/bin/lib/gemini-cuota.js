'use strict';

/**
 * gemini-cuota.js — Marcador con TTL de cuota agotada del bridge de Gemini.
 *
 * Sin esto, web-search-guard y guard-read siguen denegando la tool nativa
 * mientras el bridge responde 429: Claude queda sin ninguna via de busqueda
 * ni de lectura. El bridge escribe el marcador al recibir el error y los
 * guards lo consultan para degradar a la tool nativa hasta que venza.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TTL_MS = 10 * 60 * 1000;
const ARCHIVO = 'estado.json';

function directorio() {
  return process.env.AI_CORE_GEMINI_CUOTA_DIR
    || path.join(os.tmpdir(), 'ai-core-locks', 'gemini-cuota');
}

/**
 * @param {number} ahora - epoch ms del evento de agotamiento
 * @param {string} dir - directorio del marcador (por defecto el del proceso)
 */
function marcarCuotaAgotada(ahora = Date.now(), dir = directorio()) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ARCHIVO), JSON.stringify({ hasta: ahora + TTL_MS }), 'utf8');
  } catch (err) {
    process.stderr.write(`[gemini-cuota] no se pudo escribir el marcador: ${err.message}\n`);
  }
}

/**
 * @returns {boolean} true solo con marcador legible y vigente; ante cualquier
 * duda (ausente, corrupto, vencido) es false para no bloquear de mas.
 */
function cuotaAgotada(ahora = Date.now(), dir = directorio()) {
  try {
    const { hasta } = JSON.parse(fs.readFileSync(path.join(dir, ARCHIVO), 'utf8'));
    return typeof hasta === 'number' && hasta > ahora;
  } catch {
    return false;
  }
}

function esErrorDeCuota(err) {
  if (!err) return false;
  if ((err.status || err.statusCode) === 429) return true;
  return /RESOURCE_EXHAUSTED|\b429\b/.test(String(err.message || ''));
}

module.exports = { marcarCuotaAgotada, cuotaAgotada, esErrorDeCuota, TTL_MS };
