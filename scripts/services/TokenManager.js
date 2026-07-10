'use strict';

/**
 * TokenManager — Conteo y truncado de tokens para el canal Gemini y el
 * historial de mensajes de Anthropic.
 *
 * Extraido de anthropic-bridge.js (SRP): el ensamblador de prompts no debe
 * conocer la aritmetica de limites de token, solo invocarla. Sin dependencias
 * de fs/path ni de otros servicios del bridge — funciones puras sobre texto.
 */

// Limites para el canal Gemini — protegen la cuota diaria gratuita en ambas direcciones.
// Input:  texto que enviamos a Gemini (cuota de request)
// Output: respuesta de Gemini que metemos al historial de Claude (tokens pagados en Claude)
const MAX_TOKENS_GEMINI_INPUT  = 8_000;   // ~32k chars — suficiente para analizar un archivo grande
const MAX_CHARS_GEMINI_INPUT   = MAX_TOKENS_GEMINI_INPUT * 4;
const MAX_TOKENS_GEMINI_OUTPUT = 1_500;   // ~6k chars — resumen conciso, no el archivo completo
const MAX_CHARS_GEMINI_OUTPUT  = MAX_TOKENS_GEMINI_OUTPUT * 4;

/**
 * Estima tokens aproximados de un array de mensajes (heuristica: 1 token ~ 4 chars).
 *
 * @param {Array<{content: string}>} mensajes
 * @returns {number}
 */
function estimarTokensMensajes(mensajes) {
  return mensajes.reduce((acc, m) => {
    const texto = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return acc + Math.ceil(texto.length / 4);
  }, 0);
}

/**
 * Trunca el contenido que se va a enviar a Gemini como input.
 * Protege la cuota diaria gratuita de Gemini evitando requests gigantes.
 * Si supera el limite, conserva inicio + fin (cabecera y cola del archivo).
 *
 * @param {string} contenido - texto a enviar a Gemini
 * @returns {string} texto truncado
 */
function truncarInputGemini(contenido) {
  if (!contenido || typeof contenido !== 'string') return '';
  if (contenido.length <= MAX_CHARS_GEMINI_INPUT) return contenido;

  const mitad     = Math.floor(MAX_CHARS_GEMINI_INPUT / 2);
  const inicio    = contenido.slice(0, mitad);
  const fin       = contenido.slice(-mitad);
  const tokensOrig = Math.ceil(contenido.length / 4);
  return `${inicio}\n\n[... CONTENIDO CENTRAL OMITIDO — ${tokensOrig} tokens originales, se muestran inicio y fin ...]\n\n${fin}`;
}

/**
 * Trunca el output de Gemini para que no envenene el historial de Claude.
 * Un output largo de Gemini en el historial = tokens pagados en cada turno siguiente de Claude.
 * Si supera el limite, conserva el inicio (el resumen suele estar al principio).
 *
 * @param {string} outputGemini - respuesta cruda del MCP gemini-bridge
 * @returns {string} texto truncado listo para insertar en el historial
 */
function truncarOutputGemini(outputGemini) {
  if (!outputGemini || typeof outputGemini !== 'string') return '';
  if (outputGemini.length <= MAX_CHARS_GEMINI_OUTPUT) return outputGemini;

  const truncado = outputGemini.slice(0, MAX_CHARS_GEMINI_OUTPUT);
  const tokensOriginal = Math.ceil(outputGemini.length / 4);
  return `${truncado}\n\n[OUTPUT GEMINI TRUNCADO — ${tokensOriginal} tokens originales, mostrados primeros ${MAX_TOKENS_GEMINI_OUTPUT}. Si necesitas mas detalle, pide un resumen especifico.]`;
}

module.exports = {
  estimarTokensMensajes,
  truncarInputGemini,
  truncarOutputGemini,
  MAX_TOKENS_GEMINI_INPUT,
  MAX_TOKENS_GEMINI_OUTPUT,
};
