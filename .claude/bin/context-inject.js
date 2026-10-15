#!/usr/bin/env node
'use strict';
/**
 * context-inject.js — Inyecta secciones de gobierno bajo demanda segun el prompt.
 * Ejecutado via hook UserPromptSubmit; el stdout se agrega al contexto del turno.
 * Las reglas con enforcement duro siguen vigentes por sus guards aunque no se inyecten.
 */

const { leerPromptDeUsuario } = require('./lib/hook-stdin');
const { componerContexto } = require('./lib/context-sections');

try {
  const bloque = componerContexto(leerPromptDeUsuario());
  if (bloque) process.stdout.write(bloque);
} catch (err) {
  process.stderr.write(`[context-inject] ${err.message}\n`);
}
