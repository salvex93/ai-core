'use strict';

const { tokenizar } = require('./comando-tokens');
const { segmentar, comandoYArgs } = require('./outside-path-rules');

const CLIENTES_RED = new Set(['curl', 'wget', 'nc', 'ncat', 'netcat', 'telnet', 'ssh', 'scp', 'sftp', 'rsync', 'ftp', 'http', 'https', 'xh']);
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

function hostsDelSegmento(seg) {
  const { nombre, args } = comandoYArgs(seg.palabras);
  const dev = seg.redirecciones.flatMap(r => hostsEnTexto(r));
  if (CLIENTES_RED.has(nombre)) return [...dev, ...hostsDeCliente(args)];
  if (INTERPRETES.test(nombre)) return [...dev, ...hostsDeInterprete(args)];
  return dev;
}

/**
 * Analiza un comando ya enmascarado en busca de salida de red.
 * Un destino que no se puede resolver estaticamente se trata como no permitido.
 * @param {string} cmd - comando enmascarado
 * @param {object} [env] - entorno con AI_CORE_EGRESS_ALLOWLIST opcional
 * @returns {{hosts: string[], noPermitidos: string[], secretos: boolean}}
 */
function analizarEgreso(cmd, env = process.env) {
  const hosts = segmentar(tokenizar(cmd)).flatMap(hostsDelSegmento);
  const lista = allowlist(env);
  const noPermitidos = [...new Set(hosts.filter(h => h === NO_VERIFICABLE || !hostPermitido(h, lista)))];
  return { hosts, noPermitidos, secretos: hosts.length > 0 && SECRETOS.test(cmd) };
}

module.exports = { analizarEgreso, hostPermitido, allowlist, NO_VERIFICABLE };
