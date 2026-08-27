'use strict';

/**
 * lib/patrones-secretos.js — fuente unica de patrones de credenciales de
 * alta confianza (formato inequivoco, sin lectura plausible como codigo de
 * ejemplo). Usada por secrets-guard.js (prompt del usuario) y
 * git-history-secrets-scan.js (historial de git).
 */

const ALTA_CONFIANZA = [
  { re: /sk-[A-Za-z0-9]{20,}/i,             etiqueta: 'OpenAI API key' },
  { re: /ghp_[A-Za-z0-9]{36}/i,             etiqueta: 'GitHub Personal Access Token' },
  { re: /AKIA[A-Z0-9]{16}/i,                etiqueta: 'AWS Access Key ID' },
  { re: /xox[baprs]-[A-Za-z0-9\-]{10,}/i,   etiqueta: 'Slack token' },
  { re: /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY/i, etiqueta: 'Clave privada' },
  { re: /AIza[A-Za-z0-9_\-]{35}/i,          etiqueta: 'Google API key' },
];

/**
 * Busca todos los patrones de ALTA_CONFIANZA en un texto.
 * @param {string} texto
 * @returns {Array<{etiqueta: string}>} patrones que hicieron match
 */
function buscarCredenciales(texto) {
  if (typeof texto !== 'string' || !texto) return [];
  return ALTA_CONFIANZA.filter(({ re }) => re.test(texto));
}

// Patron generico para REDACCION (no para bloqueo -- por eso no vive en
// ALTA_CONFIANZA, que exige formato inequivoco). Cubre asignaciones de
// variable con nombre sensible (token/key/secret/password/auth) seguidas de
// un valor largo alfanumerico, sin importar el proveedor. Caso real que
// origino esta funcion (issue #252): un TOKEN="<hex de 64 chars>" filtrado en
// texto plano a un issue publico de GitHub porque ningun patron de
// ALTA_CONFIANZA (formato especifico de proveedor) lo cubria. El riesgo de
// falso positivo (redactar algo que no era secreto) es aceptable aqui porque
// el uso es sanitizar ANTES de publicar, no bloquear una accion del usuario.
const VARIABLE_SENSIBLE = /((?:token|api[_-]?key|secret|password|passwd|auth)\s*[:=]\s*["']?)([A-Za-z0-9_\-./+=]{16,})(["']?)/gi;

/**
 * Reemplaza en el texto cualquier credencial de ALTA_CONFIANZA y cualquier
 * asignacion de variable con nombre sensible + valor largo, preservando el
 * resto del contenido. Pensado para sanitizar texto ANTES de persistirlo o
 * publicarlo (ej. EVENTS_QUEUE.json / issues de GitHub), no para bloquear.
 * @param {unknown} texto
 * @returns {string} texto con los secretos reemplazados, cadena vacia si el input no es string
 */
function redactarSecretos(texto) {
  if (typeof texto !== 'string' || !texto) return '';

  let resultado = texto;
  for (const { re } of ALTA_CONFIANZA) {
    resultado = resultado.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), '[REDACTADO]');
  }
  resultado = resultado.replace(VARIABLE_SENSIBLE, (_, prefijo, _valor, sufijo) => `${prefijo}[REDACTADO]${sufijo}`);

  return resultado;
}

module.exports = { ALTA_CONFIANZA, buscarCredenciales, redactarSecretos };
