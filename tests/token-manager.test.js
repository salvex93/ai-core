/**
 * token-manager.test.js — Tests de regresion para TokenManager.js
 * Ejecutar: node --test tests/
 * Compatible: Node >= 18 (node:test nativo, sin dependencias externas)
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  estimarTokensMensajes,
  truncarInputGemini,
  truncarOutputGemini,
  MAX_TOKENS_GEMINI_INPUT,
  MAX_TOKENS_GEMINI_OUTPUT,
} = require('../scripts/services/TokenManager');

describe('estimarTokensMensajes', () => {
  test('estima ~1 token cada 4 caracteres de contenido string', () => {
    const mensajes = [{ content: 'a'.repeat(40) }];
    assert.equal(estimarTokensMensajes(mensajes), 10);
  });

  test('suma la estimacion de multiples mensajes', () => {
    const mensajes = [{ content: 'a'.repeat(8) }, { content: 'b'.repeat(12) }];
    assert.equal(estimarTokensMensajes(mensajes), 2 + 3);
  });

  test('serializa content no-string (objetos) antes de contar', () => {
    const mensajes = [{ content: { texto: 'x' } }];
    const esperado = Math.ceil(JSON.stringify({ texto: 'x' }).length / 4);
    assert.equal(estimarTokensMensajes(mensajes), esperado);
  });

  test('array vacio retorna 0', () => {
    assert.equal(estimarTokensMensajes([]), 0);
  });
});

describe('truncarInputGemini', () => {
  test('contenido corto se retorna sin modificar', () => {
    assert.equal(truncarInputGemini('hola mundo'), 'hola mundo');
  });

  test('contenido que supera el limite se trunca conservando inicio y fin', () => {
    const largo = 'A'.repeat(MAX_TOKENS_GEMINI_INPUT * 4 * 2);
    const resultado = truncarInputGemini(largo);
    assert.ok(resultado.length < largo.length);
    assert.match(resultado, /CONTENIDO CENTRAL OMITIDO/);
    assert.ok(resultado.startsWith('A'));
    assert.ok(resultado.endsWith('A'));
  });

  test('input no-string retorna cadena vacia', () => {
    assert.equal(truncarInputGemini(null), '');
    assert.equal(truncarInputGemini(undefined), '');
    assert.equal(truncarInputGemini(42), '');
  });
});

describe('truncarOutputGemini', () => {
  test('output corto se retorna sin modificar', () => {
    assert.equal(truncarOutputGemini('resumen breve'), 'resumen breve');
  });

  test('output que supera el limite se trunca conservando el inicio', () => {
    const largo = 'B'.repeat(MAX_TOKENS_GEMINI_OUTPUT * 4 * 2);
    const resultado = truncarOutputGemini(largo);
    assert.ok(resultado.length < largo.length);
    assert.match(resultado, /OUTPUT GEMINI TRUNCADO/);
    assert.ok(resultado.startsWith('B'));
  });

  test('input no-string retorna cadena vacia', () => {
    assert.equal(truncarOutputGemini(null), '');
    assert.equal(truncarOutputGemini(undefined), '');
  });
});
