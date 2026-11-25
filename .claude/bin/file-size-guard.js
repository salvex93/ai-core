#!/usr/bin/env node
'use strict';
/**
 * file-size-guard.js — Bloquea, antes de escribir, un archivo de codigo de mas de 300 lineas.
 *
 * standards-guard.js (PostToolUse) rechaza el archivo largo cuando ya esta en
 * disco; el modelo puede ignorar el rechazo (pr-modular-2: 1 de 3). Este guard
 * actua antes de la escritura: calcula el contenido resultante de un Write o un
 * Edit y, si supera el tope, la escritura no ocurre.
 *
 * Alcance deliberado: solo .js/.ts/.py (mismo criterio que standards-guard).
 * Solo bloquea si el resultado supera el tope Y crece respecto al archivo actual:
 * quien reduce un archivo ya largo no queda atrapado. Edit cuyo old_string no
 * aparece, o sobre un archivo inexistente, lo resuelve la herramienta, no este
 * guard. Break-glass (CONFIRMAR-<id>) para la excepcion consciente. El mensaje
 * nunca repite el contenido.
 *
 * Ejecutado via hook PreToolUse(Write|Edit) en settings.json.
 * Uso: node file-size-guard.js (recibe el evento PreToolUse por stdin)
 */

const fs   = require('node:fs');
const path = require('node:path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');
const { solicitarBreakGlass, accionAprobada } = require('./lib/break-glass');

const GUARD_ID = 'file-size-guard';
const MAX_LINEAS = 300;
const EXT_CODIGO = new Set(['.js', '.ts', '.py']);

// Misma convencion que standards-guard: el salto final no abre una linea nueva
const totalLineas = (texto) => {
  if (texto === '') return 0;
  const n = texto.split('\n').length;
  return texto.endsWith('\n') ? n - 1 : n;
};

function leerActual(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

// Contenido que quedaria en disco, o null si no se puede determinar (la herramienta resolvera el error)
function contenidoResultante(input, actual) {
  if (typeof input.content === 'string') return input.content;
  if (typeof input.new_string !== 'string' || typeof input.old_string !== 'string' || actual === null) return null;
  if (!actual.includes(input.old_string)) return null;
  if (input.replace_all) return actual.split(input.old_string).join(input.new_string);
  const i = actual.indexOf(input.old_string);
  return actual.slice(0, i) + input.new_string + actual.slice(i + input.old_string.length);
}

const evento = leerEventoDeStdin();
const input = evento.tool_input || {};
const filePath = input.file_path || '';
if (!filePath || !EXT_CODIGO.has(path.extname(filePath).toLowerCase())) process.exit(0);

const actual = leerActual(filePath);
const resultante = contenidoResultante(input, actual);
if (resultante === null) process.exit(0);

const lineas = totalLineas(resultante);
if (lineas <= MAX_LINEAS || lineas <= totalLineas(actual || '')) process.exit(0);

const hashAccion = `${filePath}:${resultante}`;
if (accionAprobada(GUARD_ID, hashAccion)) process.exit(0);

const { id } = solicitarBreakGlass(GUARD_ID, hashAccion);
process.stderr.write(
  `[FILE-SIZE-GUARD] BLOQUEADO: "${filePath}" quedaria con ${lineas} lineas (limite: ${MAX_LINEAS}).\n` +
  'Motivo: un modulo con una sola razon para cambiar no supera el tope. Extrae parte de la logica a un submodulo y escribe cada archivo por separado; no se pide permiso para dividir.\n' +
  `Si la excepcion es consciente, confirma respondiendo unicamente: CONFIRMAR-${id}\n` +
  '(valido 5 minutos y solo para reintentar esta misma escritura exacta).\n'
);
process.exit(2);
