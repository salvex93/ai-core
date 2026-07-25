'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('ResponseValidator.js', () => {
  const { validar, validarEstricto, verificarEmojis, verificarFrasesProhibidas, verificarIdioma, verificarAccionesNoSolicitadas, SEVERIDAD } =
    require(path.join(REPO, 'scripts', 'services', 'ResponseValidator.js'));

  test('validar: respuesta limpia es valida sin violaciones', () => {
    const r = validar('Esta es una respuesta tecnica en español sin problemas.');
    assert.equal(r.valido, true);
    assert.deepEqual(r.violaciones, []);
  });

  test('validar: input vacio o no-string es invalido (CRITICO)', () => {
    assert.equal(validar('').valido, false);
    assert.equal(validar(null).valido, false);
    assert.equal(validar(undefined).valido, false);
  });

  test('verificarEmojis: detecta emoji fuera de bloque de codigo', () => {
    const r = verificarEmojis('Todo listo 🎉');
    assert.equal(r.ok, false);
  });

  test('verificarEmojis: ignora emoji dentro de un bloque de codigo', () => {
    const r = verificarEmojis('```\nconst x = "🎉";\n```');
    assert.equal(r.ok, true, 'un emoji dentro de un bloque de codigo no debe contar como violacion');
  });

  test('verificarFrasesProhibidas: detecta frases de cortesia prohibidas', () => {
    const r = verificarFrasesProhibidas('Claro, aqui esta el resultado.');
    assert.equal(r.ok, false);
    assert.ok(r.frases.length > 0);
  });

  test('verificarIdioma: detecta ingles fuerte fuera de codigo', () => {
    const r = verificarIdioma('Let me check that for you.');
    assert.equal(r.ok, false);
  });

  test('verificarIdioma: no marca español como ingles', () => {
    const r = verificarIdioma('Voy a revisar esto para ti.');
    assert.equal(r.ok, true);
  });

  test('verificarAccionesNoSolicitadas: detecta accion autonoma no pedida', () => {
    const r = verificarAccionesNoSolicitadas('He creado el archivo sin que me lo pidieras.');
    assert.equal(r.ok, false);
  });

  test('validar: acumula multiples violaciones en un solo informe', () => {
    const r = validar('Claro! Let me help. He creado un archivo nuevo. 🎉');
    assert.equal(r.valido, false);
    assert.ok(r.violaciones.length >= 3, 'debe detectar emoji + ingles + frase prohibida + accion no solicitada');
  });

  test('validarEstricto: lanza excepcion ante violacion CRITICA (emoji/ingles)', () => {
    assert.throws(() => validarEstricto('Sure, here is the code 🎉'), /Violacion critica/);
  });

  test('validarEstricto: no lanza si solo hay violaciones ALTO (frases prohibidas)', () => {
    assert.doesNotThrow(() => validarEstricto('Claro, aqui tienes.'));
  });

  test('SEVERIDAD expone las 3 categorias esperadas', () => {
    assert.deepEqual(Object.keys(SEVERIDAD).sort(), ['ALTO', 'CRITICO', 'MEDIO']);
  });
});

// ─── RootGuard.js ─────────────────────────────────────────────────────────────
