'use strict';

/**
 * lib/deteccion-resolucion-previa.js — cierra la segunda causa raiz
 * confirmada por red-team 2026-08-15: ningun guard evaluaba lo que un
 * comando PRODUCE al ejecutarse (decodificar base64/hex, reconstruir un
 * comando fragmentado en variables de shell adyacentes) -- solo el string
 * literal tal como llega. Un comando puede evadir cualquier regex de
 * contenido peligroso si ese contenido solo existe codificado o partido en
 * fragmentos, materializandose recien en tiempo de ejecucion del shell.
 *
 * Esta funcion NO decodifica ni interpreta el shell (fuera de alcance de un
 * guard quirurgico -- requeriria un parser de shell completo). Detecta la
 * INTENCION de resolucion previa: presencia de un mecanismo de
 * decodificacion (base64/hex/Buffer.from/atob) o de fragmentacion en
 * variables adyacentes, COMBINADA con una via de ejecucion del resultado
 * (pipe a bash/sh, eval, bash -c). Con eso presente, el guard que la use
 * debe tratar el comando como potencialmente peligroso por defecto (negar
 * salvo que el patron literal ya lo bloquee de todos modos), en vez de
 * exigir que el patron destructivo aparezca decodificado en el string.
 */

// Mecanismo de decodificacion presente en el comando.
const PATRON_DECODIFICACION = /\bbase64\s+(-d\b|--decode\b)|Buffer\.from\([^)]*['"]base64['"]\)|\batob\s*\(|\bxxd\s+-r\b|\bfrom-?hex\b/i;

// Via de ejecucion del contenido resultante (lo que hace que la
// decodificacion sea peligrosa, no solo informativa).
const PATRON_EJECUCION = /\|\s*(bash|sh|zsh|node|python3?)\b|\beval\s*\(|\beval\s+["']/i;

// Fragmentacion: 2+ asignaciones de variable de shell seguidas de una
// referencia que las combina dentro de bash -c o eval. Heuristica
// deliberadamente acotada a este patron especifico (no cualquier uso de
// variables, que es normal) -- exige la combinacion literal de 2+
// variables ($A$B, "$A $B", etc.) dentro de la via de ejecucion.
const PATRON_FRAGMENTACION_EJECUTADA = /(\w+)="[^"]*"\s*;\s*(\w+)="[^"]*"\s*;\s*(?:bash\s+-c|eval)\s+["'][^"']*\$\2?[^"']*\$\1[^"']*["']|(\w+)="[^"]*"\s*;\s*(\w+)="[^"]*"\s*;\s*(?:bash\s+-c|eval)\s+["'][^"']*\$\3[^"']*\$\4[^"']*["']/;

/**
 * @param {unknown} cmd
 * @returns {boolean} true si el comando muestra indicios de decodificacion
 *   o fragmentacion combinados con una via de ejecucion del resultado.
 */
function tieneIndicioDeResolucionPrevia(cmd) {
  if (typeof cmd !== 'string') return false;

  if (PATRON_DECODIFICACION.test(cmd) && PATRON_EJECUCION.test(cmd)) return true;
  if (PATRON_FRAGMENTACION_EJECUTADA.test(cmd)) return true;

  return false;
}

module.exports = { tieneIndicioDeResolucionPrevia };
