'use strict';

const path = require('node:path');
const { tokenizar } = require('./comando-tokens');
const { segmentar, comandoYArgs } = require('./outside-path-rules');

const CLIENTES_RED = new Set(['curl', 'wget', 'nc', 'ncat', 'netcat', 'telnet', 'ssh', 'scp', 'sftp', 'rsync', 'ftp', 'http', 'https', 'xh', 'socat', 'aria2c', 'lftp']);
// Comandos que ejecutan otro comando recibido como argumento: su host real es el del comando envuelto
const ENVOLTORIOS = new Set(['env', 'timeout', 'nice', 'nohup', 'stdbuf', 'ionice', 'setsid', 'chrt', 'taskset', 'xargs']);
const SHELLS = /^(?:ba|z|da|k|a)?sh$/;
const SUBCOMANDOS_GIT_RED = new Set(['push', 'pull', 'fetch', 'clone', 'ls-remote', 'remote', 'submodule']);
const HOST_SSH = /(?:^|\s)[\w.-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}):/gi;
const PROFUNDIDAD_MAXIMA = 6;
const INTERPRETES = /^(node|nodejs|deno|bun|python\d*(\.\d+)?|ruby|perl|php)$/;
const INDICIOS_RED = /(https?:\/\/|fetch\s*\(|\bhttps?\b|net\.(connect|createConnection)|\burllib|\brequests\.|http\.client|\bsocket\b|Net::HTTP|XMLHttpRequest|WebSocket)/i;
const SECRETOS = /(\.env\b|\bid_(rsa|ed25519|ecdsa)\b|\.pem\b|\.npmrc|\.netrc|\.aws\/|\.ssh\/|\bcredentials\b)/i;
const HOST_URL = /[a-z][a-z0-9+.-]*:\/\/(?:[^/\s@'"]*@)?(\[[0-9a-f:]+\]|[^/\s:'"?#]+)/gi;
const HOST_DEV = /\/dev\/(?:tcp|udp)\/([^/\s]+)/gi;
const HOST_SUELTO = /^(?:[\w.-]+@)?(localhost|\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?!(?:txt|json|html?|log|js|ts|zip|tar|gz|sh|py|md|out|bin|png|jpe?g|pdf|csv|xml|ya?ml)$)[a-z]{2,})(?::|\/|$)/i;
const NO_VERIFICABLE = '<destino no verificable>';

const HOSTS_PERMITIDOS = [
  'github.com', '*.github.com', '*.githubusercontent.com',
  'registry.npmjs.org', '*.npmjs.org', 'pypi.org', 'files.pythonhosted.org',
];

function allowlist(env = process.env) {
  const extra = (env.AI_CORE_EGRESS_ALLOWLIST || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
  return [...HOSTS_PERMITIDOS, ...extra];
}

function hostPermitido(host, lista) {
  const h = host.toLowerCase();
  return lista.some(p => (p.startsWith('*.') ? h.endsWith(p.slice(1)) : h === p));
}

function hostsEnTexto(texto) {
  const hosts = [];
  for (const re of [HOST_URL, HOST_DEV]) {
    re.lastIndex = 0;
    for (const m of texto.matchAll(re)) hosts.push(m[1].replace(/^\[|\]$/g, ''));
  }
  return hosts;
}

function hostsDeCliente(args) {
  const texto = args.join(' ');
  const hosts = hostsEnTexto(texto);
  if (hosts.length > 0) return hosts;
  const sueltos = args.filter(a => !a.startsWith('-')).map(a => a.match(HOST_SUELTO)?.[1]).filter(Boolean);
  if (sueltos.length > 0) return sueltos;
  const sinFlags = args.filter(a => !a.startsWith('-'));
  return sinFlags.length > 0 ? [NO_VERIFICABLE] : [];
}

function hostsDeInterprete(args) {
  const texto = args.join(' ');
  if (!INDICIOS_RED.test(texto)) return [];
  const hosts = hostsEnTexto(texto);
  return hosts.length > 0 ? hosts : [NO_VERIFICABLE];
}

// Salta las opciones propias del envoltorio (y su duracion o valor numerico) hasta el comando real
function comandoEnvuelto(nombre, args) {
  const prefijo = nombre === 'env' ? /^(?:-|\w+=)/ : /^-|^\d+(?:\.\d+)?[smhd]?$|^\{\}$/;
  const i = args.findIndex(a => !prefijo.test(a));
  if (i < 0) return { nombre: '', args: [] };
  return { nombre: path.posix.basename(args[i]), args: args.slice(i + 1) };
}

function hostsDeGit(args) {
  const sub = args.find((a, i) => !a.startsWith('-') && !['-C', '-c'].includes(args[i - 1] || ''));
  if (!SUBCOMANDOS_GIT_RED.has(sub)) return [];
  const texto = args.join(' ');
  return [...hostsEnTexto(texto), ...[...texto.matchAll(HOST_SSH)].map(m => m[1])];
}

function hostsDeShell(args) {
  const i = args.findIndex(a => /^-[a-z]*c[a-z]*$/i.test(a));
  return i >= 0 && args[i + 1] !== undefined ? hostsDeTexto(args[i + 1]) : [];
}

function hostsDeComando(nombre, args, viaStdin, nivel) {
  if (nivel > PROFUNDIDAD_MAXIMA) return [NO_VERIFICABLE];
  if (ENVOLTORIOS.has(nombre)) {
    const interno = comandoEnvuelto(nombre, args);
    return hostsDeComando(interno.nombre, interno.args, viaStdin || nombre === 'xargs', nivel + 1);
  }
  if (SHELLS.test(nombre)) return hostsDeShell(args);
  if (nombre === 'eval') return hostsDeTexto(args.join(' '));
  if (nombre === 'git') return hostsDeGit(args);
  if (INTERPRETES.test(nombre)) return hostsDeInterprete(args);
  if (!CLIENTES_RED.has(nombre)) return [];
  const hosts = hostsDeCliente(args);
  // Con xargs el destino llega por stdin y no se puede resolver estaticamente
  return viaStdin && hosts.length === 0 ? [NO_VERIFICABLE] : hosts;
}

function hostsDelSegmento(seg) {
  const { nombre, args } = comandoYArgs(seg.palabras);
  const dev = seg.redirecciones.flatMap(r => hostsEnTexto(r));
  return [...dev, ...hostsDeComando(nombre, args, false, 0)];
}

// Una sustitucion entre comillas no la separa el tokenizador: se extrae y se analiza aparte
function hostsEnSustituciones(texto) {
  return [...texto.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)].flatMap(m => hostsDeTexto(m[1] ?? m[2]));
}

function hostsDeTexto(texto) {
  return [...segmentar(tokenizar(texto)).flatMap(hostsDelSegmento), ...hostsEnSustituciones(texto)];
}

/**
 * Analiza un comando ya enmascarado en busca de salida de red.
 * Un destino que no se puede resolver estaticamente se trata como no permitido.
 * @param {string} cmd - comando enmascarado
 * @param {object} [env] - entorno con AI_CORE_EGRESS_ALLOWLIST opcional
 * @returns {{hosts: string[], noPermitidos: string[], secretos: boolean}}
 */
function analizarEgreso(cmd, env = process.env) {
  const hosts = hostsDeTexto(cmd);
  const lista = allowlist(env);
  const noPermitidos = [...new Set(hosts.filter(h => h === NO_VERIFICABLE || !hostPermitido(h, lista)))];
  return { hosts, noPermitidos, secretos: hosts.length > 0 && SECRETOS.test(cmd) };
}

module.exports = { analizarEgreso, hostPermitido, allowlist, NO_VERIFICABLE };
