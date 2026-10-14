'use strict';

/**
 * commit-attribution.js — Deteccion de rastro de IA en mensajes de commit.
 * Fuente unica para el guard de Claude (destructive-op-guard.js) y para el
 * hook git commit-msg, de modo que ambas capas apliquen el mismo criterio.
 */

// Trailer de formato inequivoco (Nombre <email>): no necesita distincion de contexto.
const TRAILER_CO_AUTHORED = /^co-authored-by:\s*.+<.+>/im;

// Atribucion de autoria real a una IA; mas estricto que una mencion neutra para
// no bloquear un commit que habla DE la regla ("prohibir menciones a Claude").
const ATRIBUCION_IA = /(generated (with|by)|written (with|by)|co-authored|sugerido(s)? por|generado(s)? (con|por)|escrito(s)? (con|por))\s+(claude|anthropic|chatgpt|openai|gemini|copilot|gpt-\d)/i;

/**
 * @param {string} mensaje - mensaje de commit ya sin lineas de comentario
 * @returns {boolean} true si contiene trailer Co-Authored-By o atribucion a una IA
 */
function tieneRastroDeIA(mensaje) {
  if (typeof mensaje !== 'string' || !mensaje) return false;
  return TRAILER_CO_AUTHORED.test(mensaje) || ATRIBUCION_IA.test(mensaje);
}

module.exports = { tieneRastroDeIA };
