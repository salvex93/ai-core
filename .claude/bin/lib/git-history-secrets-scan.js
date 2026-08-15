'use strict';

/**
 * lib/git-history-secrets-scan.js — escanea el HISTORIAL de git (no el
 * working tree actual) en busca de credenciales de alta confianza que hayan
 * sido commiteadas alguna vez, incluso si luego se borraron del archivo --
 * siguen vivas en el historial hasta que se reescribe (git filter-repo /
 * BFG). Patron estandar de mercado (gitleaks, trufflehog): escanear
 * `git log -p`, no solo `git ls-files`/grep del estado actual.
 */

const { buscarCredenciales } = require('./patrones-secretos');

/**
 * Parsea el texto completo de `git log -p --format=COMMIT:%H` y devuelve
 * los hallazgos de credenciales, agrupados por el commit que las introdujo.
 * Solo evalua lineas AÑADIDAS del diff (prefijo '+', sin contar '+++'
 * encabezado de archivo) -- una credencial que solo aparece en una linea
 * eliminada ('-') ya fue removida por ese mismo commit, se cuenta en el
 * commit que la introdujo, no en el que la borra.
 *
 * @param {string} logText salida cruda de `git log -p --format=COMMIT:%H`
 * @returns {Array<{commit: string, etiqueta: string}>}
 */
function parsearLogParaSecretos(logText) {
  if (typeof logText !== 'string' || !logText) return [];

  const lineas = logText.split('\n');
  const hallazgos = [];
  const vistos = new Set();
  let commitActual = null;

  for (const linea of lineas) {
    const matchCommit = linea.match(/^COMMIT:(\S+)/);
    if (matchCommit) {
      commitActual = matchCommit[1];
      continue;
    }
    if (!commitActual) continue;
    if (!linea.startsWith('+') || linea.startsWith('+++')) continue;

    const contenido = linea.slice(1);
    for (const { etiqueta } of buscarCredenciales(contenido)) {
      const clave = `${commitActual}::${etiqueta}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      hallazgos.push({ commit: commitActual, etiqueta });
    }
  }

  return hallazgos;
}

module.exports = { parsearLogParaSecretos };
