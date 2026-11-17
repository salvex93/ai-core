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

// Opciones de sudo que consumen un valor (-u usuario...): sin saltarlas, el usuario se tomaba por el comando
const SUDO_CON_VALOR = new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T', '-U']);

function comandoYArgs(palabras) {
  let i = 0;
  while (i < palabras.length && (/^\w+=/.test(palabras[i]) || PREFIJOS.has(palabras[i]))) {
    const esSudo = palabras[i] === 'sudo';
    i++;
    while (esSudo && i < palabras.length && palabras[i].startsWith('-')) i += SUDO_CON_VALOR.has(palabras[i]) ? 2 : 1;
  }
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

// Comandos que ejecutan otro recibido como argumento (el destino real es el del comando envuelto)
const ENVOLTORIOS = new Set(['env', 'timeout', 'nice', 'nohup', 'stdbuf', 'ionice', 'setsid', 'chrt', 'taskset', 'xargs', 'busybox']);
const SHELLS = /^(?:ba|z|da|k|a)?sh$/;

// Salta las opciones propias del envoltorio (y su duracion o valor numerico) hasta el comando real
function comandoEnvuelto(nombre, args) {
  const prefijo = nombre === 'env' ? /^(?:-|\w+=)/ : /^-|^\d+(?:\.\d+)?[smhd]?$|^\{\}$/;
  const i = args.findIndex(a => !prefijo.test(a));
  if (i < 0) return { nombre: '', args: [] };
  return { nombre: path.posix.basename(args[i]), args: args.slice(i + 1) };
}

function desenvolver(nombre, args) {
  let actual = { nombre, args };
  for (let n = 0; n < 6 && ENVOLTORIOS.has(actual.nombre); n++) actual = comandoEnvuelto(actual.nombre, actual.args);
  return actual;
}

// Valores de una opcion en sus formas: -o X, -oX, --output X, --output=X
function valoresDeOpcion(args, cortas, largas) {
  const valores = [];
  args.forEach((a, i) => {
    const corta = cortas.find(c => a === c || (a.startsWith(c) && a.length > c.length && !a.startsWith('--')));
    const larga = largas.find(l => a === l || a.startsWith(`${l}=`));
    if (larga && a.includes('=')) valores.push(a.slice(a.indexOf('=') + 1));
    else if (a === corta || a === larga) { if (args[i + 1] !== undefined) valores.push(args[i + 1]); }
    else if (corta) valores.push(a.slice(corta.length));
  });
  return valores;
}

const DESTINO_POR_OPCION = {
  curl: [['-o'], ['--output', '--output-dir']],
  wget: [['-O', '-P'], ['--output-document', '--directory-prefix']],
  tar: [['-C'], ['--directory']],
  unzip: [['-d'], []],
};

function destinosDeGit(args) {
  const posicionales = argumentos(args);
  return posicionales[0] === 'clone' && posicionales.length >= 3 ? posicionales.slice(-1) : [];
}

function destinosDeCopia(nombre, args) {
  const destino = valoresDeOpcion(args, ['-t'], ['--target-directory']);
  if (destino.length > 0) return destino;
  return argumentos(args).slice(-1);
}

function destinosDelComando(palabras) {
  const { nombre: nombreBruto, args: argsBrutos } = comandoYArgs(palabras);
  const { nombre, args } = desenvolver(nombreBruto, argsBrutos);
  if (SHELLS.test(nombre)) return destinosDeShell(args);
  if (nombre === 'eval') return destinosDeEscritura(args.join(' '));
  if (nombre === 'find') return destinosDeFind(args);
  if (TODOS_LOS_ARGS.has(nombre)) return argumentos(args);
  if (nombre === 'cp' || nombre === 'install' || nombre === 'ln') return destinosDeCopia(nombre, args);
  if (nombre === 'rsync') return argumentos(args).slice(-1);
  if (nombre === 'git') return destinosDeGit(args);
  if (nombre === 'chmod' || nombre === 'chown' || nombre === 'chgrp') return argumentos(args).slice(1);
  if (nombre === 'dd') return args.filter(a => a.startsWith('of=')).map(a => a.slice(3));
  if (nombre === 'sed' && args.some(a => /^-\w*i|^--in-place/.test(a))) return argumentos(args).slice(1);
  if (nombre === 'perl' && args.some(a => /^-\w*i/.test(a))) return argumentos(args).slice(1);
  const opciones = DESTINO_POR_OPCION[nombre];
  return opciones ? valoresDeOpcion(args, opciones[0], opciones[1]) : [];
}

function destinosDeShell(args) {
  const i = args.findIndex(a => /^-[a-z]*c[a-z]*$/i.test(a));
  return i >= 0 && args[i + 1] !== undefined ? destinosDeEscritura(args[i + 1]) : [];
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
    // Una sustitucion <( ... ) llega como "<" seguido de un separador: saltarlo borraba el limite del comando interno
    else if (t.tipo === 'op' && t.valor === '<') { if (tokens[i + 1]?.tipo === 'palabra') i++; }
    else if (t.tipo === 'op' && OPERADORES_REDIRECCION.has(t.valor)) {
      const sig = tokens[i + 1];
      if (sig && sig.tipo === 'palabra' && !esDuplicadoDeDescriptor(t.valor, sig.valor)) actual.redirecciones.push(sig.valor);
      i++;
    } else if (t.tipo === 'palabra') actual.palabras.push(t.valor);
  }
  return segmentos;
}

// Tras un cd, los destinos relativos de los comandos siguientes se resuelven contra su destino
function nuevaBase(base, args) {
  const destino = argumentos(args)[0];
  if (destino === undefined) return '~';
  if (destino === '-') return base;
  if (base === null || /^[/~$]/.test(destino)) return destino;
  return `${base}/${destino}`;
}

function aplicarBase(base, destino) {
  if (base === null || /^[/~$]|^[A-Za-z]:/.test(destino)) return destino;
  return `${base}/${destino}`;
}

/**
 * Rutas que el comando escribe o borra (redirecciones, tee, rm, mv, cp, etc.),
 * incluidas las de comandos envueltos (bash -c, eval, env, timeout) y las de
 * sustituciones entre comillas.
 * @param {string} cmd - comando ya enmascarado
 * @returns {string[]}
 */
function destinosDeEscritura(cmd) {
  let base = null;
  const destinos = [];
  for (const seg of segmentar(tokenizar(cmd))) {
    const { nombre, args } = comandoYArgs(seg.palabras);
    if (nombre === 'cd' || nombre === 'pushd') { base = nuevaBase(base, args); continue; }
    destinos.push(...[...seg.redirecciones, ...destinosDelComando(seg.palabras)].map(d => aplicarBase(base, d)));
  }
  const sustituciones = [...cmd.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)].flatMap(m => destinosDeEscritura(m[1] ?? m[2]));
  return [...destinos, ...sustituciones].filter(d => !SALIDA_NEUTRA.test(d));
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

module.exports = { destinosDeEscritura, estaFueraDelProyecto, segmentar, comandoYArgs, comandoEnvuelto };
