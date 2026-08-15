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

// Mismo criterio que standards-guard.js (bug real corregido en red-team
// 2026-08-15: filePath.includes('test') eximia archivos de produccion como
// "latest-config.json"). Exige que "test"/"spec" aparezcan como segmento
// real (separado por / \ - _ . o limite de string), o dentro de una
// carpeta "test(s)/" -- los fixtures de credenciales dentro de los propios
// tests de seguridad (ej. secrets-guard-js.test.js) no son secretos reales.
function esArchivoDeTest(filePath) {
  if (!filePath) return false;
  const nombreArchivo = filePath.split(/[\\/]/).pop() || '';
  return /(^|[-_.])tests?([-_.]|$)/i.test(nombreArchivo)
    || /(^|[-_.])spec([-_.]|$)/i.test(nombreArchivo)
    || /(^|[\\/])tests?[\\/]/i.test(filePath);
}

/**
 * Parsea el texto completo de `git log -p --format=COMMIT:%H` y devuelve
 * los hallazgos de credenciales, agrupados por el commit que las introdujo.
 * Solo evalua lineas AÑADIDAS del diff (prefijo '+', sin contar '+++'
 * encabezado de archivo) -- una credencial que solo aparece en una linea
 * eliminada ('-') ya fue removida por ese mismo commit, se cuenta en el
 * commit que la introdujo, no en el que la borra. Excluye archivos de test
 * (fixtures de credenciales con formato real, usados para probar los
 * propios guards de seguridad no son secretos reales).
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
  let archivoActual = null;

  for (const linea of lineas) {
    const matchCommit = linea.match(/^COMMIT:(\S+)/);
    if (matchCommit) {
      commitActual = matchCommit[1];
      archivoActual = null;
      continue;
    }
    if (!commitActual) continue;

    const matchArchivo = linea.match(/^\+\+\+ b\/(.+)$/);
    if (matchArchivo) {
      archivoActual = matchArchivo[1];
      continue;
    }

    if (!linea.startsWith('+') || linea.startsWith('+++')) continue;
    if (esArchivoDeTest(archivoActual)) continue;

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
