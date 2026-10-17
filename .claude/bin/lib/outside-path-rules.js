'use strict';

const os = require('node:os');
const path = require('node:path');
const { tokenizar, OPERADORES_REDIRECCION, SEPARADORES } = require('./comando-tokens');

const TODOS_LOS_ARGS = new Set(['rm', 'rmdir', 'mv', 'touch', 'mkdir', 'truncate', 'shred', 'unlink', 'tee']);
const SOLO_ULTIMO_ARG = new Set(['cp', 'install', 'ln']);
const PREFIJOS = new Set(['sudo', 'command', 'time', 'nohup', 'exec']);
const SALIDA_NEUTRA = /^\/dev\/(null|stdout|stderr|tty|fd\/\d+)$/;

function argumentos(palabras) {
  const sinFlags = [];
  let finFlags = false;
  for (const p of palabras) {
    if (p === '--') finFlags = true;
    else if (finFlags || !p.startsWith('-')) sinFlags.push(p);
  }
  return sinFlags;
}

function comandoYArgs(palabras) {
  let i = 0;
  while (i < palabras.length && (/^\w+=/.test(palabras[i]) || PREFIJOS.has(palabras[i]))) i++;
  return { nombre: path.posix.basename(palabras[i] || ''), args: palabras.slice(i + 1) };
}

const ACCIONES_FIND = new Set(['-exec', '-execdir', '-ok', '-okdir']);
const COMANDOS_DESTRUCTIVOS = new Set(['rm', 'rmdir', 'mv', 'unlink', 'shred', 'truncate']);

// Solo se validan las rutas de partida cuando find borra o ejecuta un comando que muta.
function destinosDeFind(args) {
  const muta = args.includes('-delete') || args.some((a, i) => ACCIONES_FIND.has(a) && COMANDOS_DESTRUCTIVOS.has(path.posix.basename(args[i + 1] || '')));
  if (!muta) return [];
  const inicio = args.findIndex(a => !/^-[HLPDO]/.test(a));
  const rutas = [];
  for (const a of inicio < 0 ? [] : args.slice(inicio)) {
    if (/^[-(!]/.test(a)) break;
    rutas.push(a);
  }
  return rutas;
}

function destinosDelComando(palabras) {
  const { nombre, args } = comandoYArgs(palabras);
  if (nombre === 'find') return destinosDeFind(args);
  if (TODOS_LOS_ARGS.has(nombre)) return argumentos(args);
  if (SOLO_ULTIMO_ARG.has(nombre)) return argumentos(args).slice(-1);
  if (nombre === 'dd') return args.filter(a => a.startsWith('of=')).map(a => a.slice(3));
  if (nombre === 'sed' && args.some(a => /^-\w*i/.test(a))) return argumentos(args).slice(1);
  return [];
}

function esDuplicadoDeDescriptor(op, siguiente) {
  return op === '>&' && /^(\d+|-)$/.test(siguiente);
}

function segmentar(tokens) {
  const segmentos = [{ palabras: [], redirecciones: [] }];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const actual = segmentos[segmentos.length - 1];
    if (t.tipo === 'op' && SEPARADORES.has(t.valor)) segmentos.push({ palabras: [], redirecciones: [] });
    else if (t.tipo === 'op' && t.valor === '<') i++;
    else if (t.tipo === 'op' && OPERADORES_REDIRECCION.has(t.valor)) {
      const sig = tokens[i + 1];
      if (sig && sig.tipo === 'palabra' && !esDuplicadoDeDescriptor(t.valor, sig.valor)) actual.redirecciones.push(sig.valor);
      i++;
    } else if (t.tipo === 'palabra') actual.palabras.push(t.valor);
  }
  return segmentos;
}

/**
 * Rutas que el comando escribe o borra (redirecciones, tee, rm, mv, cp, etc.).
 * @param {string} cmd - comando ya enmascarado
 * @returns {string[]}
 */
function destinosDeEscritura(cmd) {
  return segmentar(tokenizar(cmd))
    .flatMap(s => [...s.redirecciones, ...destinosDelComando(s.palabras)])
    .filter(d => !SALIDA_NEUTRA.test(d));
}

function expandirHome(ruta, home) {
  if (ruta === '~' || ruta.startsWith('~/')) return home + ruta.slice(1);
  return ruta.replace(/^\$\{?HOME\}?(?=\/|$)/, home);
}

function aRutaNativa(ruta, tmp) {
  if (process.platform !== 'win32') return ruta;
  if (ruta === '/tmp' || ruta.startsWith('/tmp/')) return tmp + ruta.slice(4);
  return ruta.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:');
}

function dentroDe(base, destino) {
  const rel = path.relative(base, destino);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Un destino con variables o sustituciones distintas de HOME no se puede
 * verificar de forma estatica: se deja pasar (otros guards cubren la evasion).
 * @param {string} destino
 * @param {string} raiz - raiz del proyecto
 * @returns {boolean} true si resuelve a una ruta fuera del proyecto y del temporal permitido
 */
function estaFueraDelProyecto(destino, raiz) {
  const tmp = os.tmpdir();
  const ruta = aRutaNativa(expandirHome(destino, os.homedir()), tmp);
  if (/[$`]/.test(ruta)) return false;
  const resuelta = path.resolve(raiz, ruta);
  if (dentroDe(raiz, resuelta)) return false;
  // El temporal solo se exime si el proyecto no vive dentro de el: de lo contrario seria un hueco para los hermanos del proyecto.
  return !(dentroDe(tmp, resuelta) && !dentroDe(tmp, raiz));
}

module.exports = { destinosDeEscritura, estaFueraDelProyecto, segmentar, comandoYArgs };
