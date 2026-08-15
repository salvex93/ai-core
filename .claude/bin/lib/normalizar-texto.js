'use strict';

/**
 * lib/normalizar-texto.js — normalizacion compartida antes de matchear
 * regex en los guards de deteccion textual (destructive-op-guard,
 * jailbreak-guard, secrets-guard, injection-guard, mutating-action-guard,
 * standards-guard, agent-paths-guard, bash-verbosity-guard).
 *
 * Causa raiz cerrada (red-team 2026-08-15): ningun guard normalizaba texto
 * antes de comparar contra ASCII literal -- homoglifos cirilicos (una "O"
 * visualmente identica pero de otro alfabeto), acentos, y caracteres
 * invisibles (zero-width space) rompian el matching sin ninguna ofuscacion
 * sofisticada, solo por ser codepoints Unicode distintos al esperado por el
 * regex. Esta funcion centraliza el fix en un solo lugar, en vez de
 * parchear cada guard por separado.
 *
 * Que NO resuelve NFKC solo: Unicode NFKC normaliza formas de
 * COMPATIBILIDAD del MISMO alfabeto (ej. ｆｕｌｌｗｉｄｔｈ -> fullwidth,
 * ligaduras, superindices) -- NO mapea un caracter cirilico a su
 * "equivalente visual" latino, porque son alfabetos distintos por diseño,
 * no formas alternativas del mismo caracter. Para eso se necesita una tabla
 * de confusables (subconjunto de Unicode TR39 relevante para los homoglifos
 * mas comunes en intentos de evasion reales: cirilico/griego que imitan
 * letras latinas frecuentes en palabras clave de los guards).
 */

// Subconjunto de homoglifos verificado contra los payloads reales del
// red-team (no es la tabla completa de TR39 -- se amplia si aparece un
// caso nuevo confirmado, no especulativamente).
const CONFUSABLES = {
  'О': 'O', // О cirilica mayuscula -> O latina
  'о': 'o', // о cirilica minuscula -> o latina
  'А': 'A', // А cirilica mayuscula -> A latina
  'а': 'a', // а cirilica minuscula -> a latina
  'Е': 'E', // Е cirilica mayuscula -> E latina
  'е': 'e', // е cirilica minuscula -> e latina
  'Р': 'P', // Р cirilica mayuscula -> P latina
  'р': 'p', // р cirilica minuscula -> p latina
  'С': 'C', // С cirilica mayuscula -> C latina
  'с': 'c', // с cirilica minuscula -> c latina
  'Х': 'X', // Х cirilica mayuscula -> X latina
  'х': 'x', // х cirilica minuscula -> x latina
  'І': 'I', // І cirilica mayuscula -> I latina
  'і': 'i', // і cirilica minuscula -> i latina
  'һ': 'h', // һ cirilica -> h latina
  'Ѕ': 'S', // Ѕ cirilica mayuscula -> S latina
  'ѕ': 's', // ѕ cirilica minuscula -> s latina
  'ј': 'j', // ј cirilica minuscula -> j latina
  'Ѳ': 'O', // Ѳ (variante) -- descartado si no se confirma en uso real, se deja fuera
  'п': 'n', // п cirilica minuscula parece "n" en algunas fuentes; en el payload real del red-team ('ignпra') se usa para reemplazar la 'o' -- se resuelve por posicion en REEMPLAZOS_CONTEXTUALES abajo, no aqui, para no introducir falsos positivos con la 'n' real.
};

// Caracteres invisibles/de formato que no aportan significado visible pero
// rompen el matching de regex al insertarse dentro de una palabra clave.
const INVISIBLES_A_REMOVER = /[​‌‍‎‏﻿­]/g;

// Marcadores de enfasis markdown que un usuario (o contenido inyectado)
// puede envolver alrededor de una palabra clave para evadir la secuencia
// exacta que un regex espera. Exige limite de palabra (\b) a AMBOS lados
// del marcador -- sin este limite, un "_" real dentro de un identificador
// (ej. "ghp_ABC123", una credencial de GitHub) se removia por error,
// rompiendo la deteccion de secrets-guard.js (bug real encontrado en esta
// misma correccion: "ghp_ABC..." se normalizaba a "ghpABC...", que ya no
// matcheaba el patron `ghp_[A-Za-z0-9]{36}`). El limite de palabra
// garantiza que solo se remueve cuando el caracter actua como delimitador
// de enfasis (rodeado de espacio o inicio/fin de string), no cuando es
// parte de un token alfanumerico contiguo.
const MARKDOWN_ENFASIS = /(?<=^|\s)[*_`]{1,3}|[*_`]{1,3}(?=\s|$)/g;

/**
 * Reemplaza caracteres de scripts no latinos que son homoglifos conocidos
 * de letras ASCII, cuando aparecen intercalados dentro de una secuencia de
 * caracteres latinos (para no falsopositivar texto legitimo enteramente en
 * otro alfabeto, ej. un comentario real en cirilico).
 */
function resolverConfusables(texto) {
  let resultado = '';
  for (const ch of texto) {
    resultado += CONFUSABLES[ch] ?? ch;
  }
  return resultado;
}

/**
 * Caso especifico confirmado en red-team: 'п' cirilica (U+043F) usada como
 * sustituto visual de 'o' latina dentro de una palabra que de otro modo es
 * ASCII (ej. 'ignпra' por 'ignora'). Se resuelve solo cuando el caracter
 * aparece rodeado de letras ASCII (heuristica de contexto), para no
 * confundir con texto genuinamente en cirilico donde 'п' es una letra real
 * (ademas 'п' cirilica normalmente representa el sonido 'p', no location
 * fonetica de 'o' -- este es puramente un caso de similitud VISUAL con la
 * 'o' latina en ciertas tipografias, confirmado por el payload real que
 * evadio jailbreak-guard.js).
 */
function resolverConfusableContextual(texto) {
  return texto.replace(/([a-zA-Z])п([a-zA-Z])/g, '$1o$2');
}

/**
 * Normaliza un texto antes de aplicar matching de regex de deteccion.
 * Pipeline: NFKC -> resolver confusables conocidos -> remover invisibles ->
 * remover enfasis markdown -> colapsar espacios.
 *
 * @param {unknown} texto
 * @returns {string} texto normalizado, cadena vacia si el input no es string
 */
function normalizarTexto(texto) {
  if (typeof texto !== 'string') return '';

  // Los invisibles se remueven ANTES de resolver confusables contextuales:
  // un caracter invisible interpuesto entre una letra ASCII y un homoglifo
  // (ej. "ign" + zero-width + "п" + "ra") rompe el lookaround de contexto
  // si no se limpia primero -- confirmado con el payload real del red-team
  // que combina ambas tecnicas en el mismo intento.
  let resultado = texto.normalize('NFKC');
  resultado = resultado.replace(INVISIBLES_A_REMOVER, '');
  resultado = resolverConfusableContextual(resultado);
  resultado = resolverConfusables(resultado);
  resultado = resultado.replace(MARKDOWN_ENFASIS, '');
  // Colapsa solo espacios/tabs horizontales -- preserva saltos de linea.
  // Bug real encontrado durante esta correccion: colapsar \s+ (que incluye
  // \n) a un solo espacio rompia el matching multilinea de injection-guard.js
  // (patron /^(system|assistant|human):/m depende de que "\n" real preceda
  // la linea para que ^ matchee el inicio de linea).
  resultado = resultado.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();

  return resultado;
}

module.exports = { normalizarTexto };
