#!/usr/bin/env node
'use strict';
/**
 * hardcoded-secret-guard.js — Bloquea escribir una credencial literal en codigo.
 *
 * secrets-guard.js solo mira formatos inequivocos de proveedor en el prompt del
 * usuario; una password o api key arbitraria pegada en un archivo de codigo
 * (db.js con password: '...') no tiene formato conocido y pasaba. Este guard
 * cierra ese hueco con una heuristica acotada: nombre de variable terminado en
 * password/secret/token/api key asignado a un literal de cadena.
 *
 * Alcance deliberado: solo archivos de codigo; se excluyen tests, fixtures,
 * ejemplos, documentacion y .env (donde un valor literal es esperado), valores
 * cortos, placeholders evidentes e interpolaciones. Una heuristica sobre nombres
 * puede dar falsos positivos: por eso usa break-glass (CONFIRMAR-<id>) y no un
 * rechazo sin salida. El mensaje nunca repite el valor detectado.
 *
 * Ejecutado via hook PreToolUse(Write|Edit) en settings.json.
 * Uso: node hardcoded-secret-guard.js (recibe el evento PreToolUse por stdin)
 */

const path = require('node:path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');
const { solicitarBreakGlass, accionAprobada } = require('./lib/break-glass');

const GUARD_ID = 'hardcoded-secret-guard';

const EXT_CODIGO = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.java', '.php', '.cs']);
const RUTA_EXENTA = /(^|[\\/])(tests?|__tests__|spec|fixtures?|mocks?|examples?)([\\/]|$)|\.(test|spec)\./i;

const NOMBRE = '[\\w.-]*(?:password|passwd|secret|api[_-]?key|token|private[_-]?key)s?';
const ASIGNACION = new RegExp(`${NOMBRE}['"]?\\s*(?::|=(?!=))\\s*(['"\`])([^'"\`\\s$\\{\\}]{6,})\\1`, 'gi');
const PLACEHOLDER = /^(?:change[-_]?me|your[-_\w]*|example\w*|placeholder|x{3,}|\*+|todo|dummy|test\w*|secret|password|redacted|<.*>)$/i;

function hallazgos(texto) {
  const encontrados = [];
  for (const m of texto.matchAll(ASIGNACION)) {
    if (!PLACEHOLDER.test(m[2])) encontrados.push(m[0].split(/['"`]/)[0].replace(/[\s:=]+$/, ''));
  }
  return encontrados;
}

const evento = leerEventoDeStdin();
const filePath = evento.tool_input?.file_path || '';
if (!filePath) process.exit(0);
if (!EXT_CODIGO.has(path.extname(filePath).toLowerCase()) || RUTA_EXENTA.test(filePath)) process.exit(0);

const content = evento.tool_input?.content || evento.tool_input?.new_string || '';
const nombres = hallazgos(content);
if (nombres.length === 0) process.exit(0);

const hashAccion = `${filePath}:${content}`;
if (accionAprobada(GUARD_ID, hashAccion)) process.exit(0);

const { id } = solicitarBreakGlass(GUARD_ID, hashAccion);
process.stderr.write(
  `[HARDCODED-SECRET-GUARD] BLOQUEADO: "${filePath}" asigna un literal a ${[...new Set(nombres)].join(', ')}.\n` +
  'Motivo: una credencial escrita en el codigo queda en el historial de git y en cada copia del repo. Leela de process.env (o del gestor de secretos del proyecto) y documenta la variable.\n' +
  `Si es un falso positivo o un valor de ejemplo intencional, confirma respondiendo unicamente: CONFIRMAR-${id}\n` +
  '(valido 5 minutos y solo para reintentar esta misma escritura exacta).\n'
);
process.exit(2);
