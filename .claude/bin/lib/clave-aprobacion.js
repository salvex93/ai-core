'use strict';

/**
 * lib/clave-aprobacion.js — canonicalizacion de comandos de shell antes de
 * usarlos como clave de aprobacion en lib/break-glass.js.
 *
 * Causa raiz (G37, auditoria 2026-09-21): destructive-op-guard.js y
 * mutating-action-guard.js (caso Bash) usan el comando completo -- ya
 * normalizado por normalizar-texto.js contra homoglifos/invisibles -- como
 * clave de accionAprobada(). normalizarTexto() no reordena flags ni resuelve
 * rutas: si Claude reconstruye el comando bloqueado con las flags en otro
 * orden (ej. "rm -fr" vs "rm -rf", "--recursive --force" vs
 * "--force --recursive"), la clave cambia byte a byte y la aprobacion ya
 * confirmada no se reconoce -- silencioso, sin error visible, mismo patron
 * de friccion reportado en G36.
 *
 * Fix: separar los tokens del comando en flags (empiezan con "-") y no-flags
 * (nombre de comando, subcomandos, rutas, argumentos posicionales), ordenar
 * solo las flags alfabeticamente y reconstruir con los no-flags primero en
 * su orden original. Un cambio de orden de flags deja de invalidar la
 * aprobacion; un objetivo real distinto (ej. "build/" vs "dist/") sigue
 * produciendo una clave distinta porque no es una flag -- preserva la
 * garantia de que confirmar un comando destructivo no autoriza otro con
 * distinto alcance.
 */

const PATRON_FLAG = /^--?[A-Za-z]/;

/**
 * @param {string} comando - ya pasado por normalizarTexto()
 * @returns {string} comando con flags ordenadas alfabeticamente
 */
function canonicalizarComando(comando) {
  if (typeof comando !== 'string' || !comando) return '';

  const tokens = comando.split(' ');
  const noFlags = tokens.filter(token => !PATRON_FLAG.test(token));
  const flags = tokens.filter(token => PATRON_FLAG.test(token)).sort();

  return [...noFlags, ...flags].join(' ');
}

module.exports = { canonicalizarComando };
