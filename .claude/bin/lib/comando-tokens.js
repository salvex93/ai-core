'use strict';

// Tokenizador minimo de comandos de shell: separa palabras (con comillas ya
// resueltas) de operadores. Lo que va entre comillas nunca es un operador, por
// eso una redireccion citada en un echo no se confunde con una escritura real.

const OPERADORES_REDIRECCION = new Set(['>', '>>', '>|', '&>', '&>>', '>&']);
const SEPARADORES = new Set([';', '&&', '||', '|', '&']);

function leerComillas(texto, i) {
  const comilla = texto[i];
  let j = i + 1;
  let contenido = '';
  while (j < texto.length && texto[j] !== comilla) {
    if (comilla === '"' && texto[j] === '\\' && j + 1 < texto.length) j++;
    contenido += texto[j++];
  }
  return { contenido, siguiente: j + 1 };
}

function leerOperador(texto, i) {
  const tres = texto.slice(i, i + 3);
  if (tres === '&>>') return tres;
  const dos = texto.slice(i, i + 2);
  if (['>>', '>|', '&>', '>&', '&&', '||'].includes(dos)) return dos;
  return texto[i];
}

/**
 * @param {string} texto - comando ya enmascarado (sin heredocs ni mensajes de commit)
 * @returns {{tipo: 'palabra'|'op', valor: string}[]}
 */
function tokenizar(texto) {
  const tokens = [];
  let palabra = null;
  const cerrar = () => { if (palabra !== null) tokens.push({ tipo: 'palabra', valor: palabra }); palabra = null; };
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '"' || c === "'") {
      const { contenido, siguiente } = leerComillas(texto, i);
      palabra = (palabra || '') + contenido;
      i = siguiente;
    } else if (/[ \t]/.test(c)) {
      cerrar(); i++;
    } else if (/[\n(){}`]/.test(c)) {
      cerrar(); tokens.push({ tipo: 'op', valor: ';' }); i++;
    } else if (/[;&|<>]/.test(c)) {
      // Un descriptor numerico pegado a > (ej. 2>) no es argumento del comando.
      if (/^\d+$/.test(palabra || '') && c === '>') palabra = null;
      cerrar();
      const op = leerOperador(texto, i);
      tokens.push({ tipo: 'op', valor: op }); i += op.length;
    } else {
      palabra = (palabra || '') + c; i++;
    }
  }
  cerrar();
  return tokens;
}

module.exports = { tokenizar, OPERADORES_REDIRECCION, SEPARADORES };
