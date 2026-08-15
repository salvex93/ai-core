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

module.exports = { ALTA_CONFIANZA, buscarCredenciales };
