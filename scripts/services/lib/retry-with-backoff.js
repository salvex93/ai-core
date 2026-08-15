'use strict';

/**
 * retry-with-backoff.js — Retry generico con backoff exponencial para
 * errores transitorios de API (rate limit, 5xx, timeout de conexion).
 *
 * El SDK de Anthropic (@anthropic-ai/sdk) ya reintenta automaticamente por
 * defecto (maxRetries=2 sin configuracion explicita) -- este modulo cubre
 * los proveedores sin ese mecanismo incorporado: GeminiAdapter.js
 * (@google/genai no expone ninguna API de retry) y OpenAICompatAdapter.js
 * (https.request crudo, sin retry alguno).
 */

const CODIGOS_TRANSITORIOS = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN']);

/**
 * Decide si un error de llamada a un proveedor de IA es transitorio (vale
 * la pena reintentar) o definitivo (fallo del cliente, no reintentar).
 * @param {Error|{status?: number, code?: string}} err
 * @returns {boolean}
 */
function esErrorReintentable(err) {
  if (!err) return false;
  const status = err.status || err.statusCode;
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  if (status) return false; // 4xx distinto de 429: error del cliente, no reintentar
  if (err.code && CODIGOS_TRANSITORIOS.has(err.code)) return true;
  return false;
}

/**
 * Calcula el tiempo de espera antes del siguiente intento.
 * @param {number} intento indice de intento (0 = primer reintento)
 * @param {object} opts { base, maxMs, jitter, retryAfterMs }
 * @returns {number} milisegundos a esperar
 */
function calcularBackoffMs(intento, opts = {}) {
  const base = opts.base ?? 500;
  const maxMs = opts.maxMs ?? 8000;
  const jitter = opts.jitter ?? true;

  if (opts.retryAfterMs != null) return Math.min(opts.retryAfterMs, maxMs * 4);

  const exponencial = base * (2 ** intento);
  const conTope = Math.min(exponencial, maxMs);
  if (!jitter) return conTope;
  return Math.round(conTope * (0.5 + Math.random() * 0.5));
}

/**
 * Ejecuta fn() reintentando con backoff exponencial si el error es
 * transitorio (esErrorReintentable), hasta maxReintentos veces. Propaga el
 * ultimo error si se agota el limite o si el error no es reintentable.
 *
 * @param {() => Promise<any>} fn
 * @param {object} opts { maxReintentos, base, maxMs, jitter }
 * @returns {Promise<any>}
 */
async function reintentarConBackoff(fn, opts = {}) {
  const maxReintentos = opts.maxReintentos ?? 2;

  let ultimoError;
  for (let intento = 0; intento <= maxReintentos; intento++) {
    try {
      return await fn();
    } catch (err) {
      ultimoError = err;
      const esUltimoIntento = intento === maxReintentos;
      if (!esErrorReintentable(err) || esUltimoIntento) throw err;

      const retryAfterMs = typeof err.retryAfterMs === 'number' ? err.retryAfterMs : undefined;
      const espera = calcularBackoffMs(intento, { ...opts, retryAfterMs });
      await new Promise(resolve => setTimeout(resolve, espera));
    }
  }
  throw ultimoError;
}

module.exports = { esErrorReintentable, calcularBackoffMs, reintentarConBackoff };
