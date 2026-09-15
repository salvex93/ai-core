'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { REPO } = require('./_shared');

const { truncarOutputProveedor, MAX_TOKENS_GEMINI_OUTPUT } = require(
  path.join(REPO, 'scripts', 'services', 'TokenManager.js')
);

describe('TokenManager.js — truncarOutputProveedor (generico, no solo Gemini)', () => {
  test('devuelve el output intacto si esta dentro del limite', () => {
    const corto = 'respuesta breve de deepseek';
    assert.equal(truncarOutputProveedor(corto, 'deepseek'), corto);
  });

  test('trunca output largo de un proveedor no-Gemini (ej. deepseek) igual que Gemini', () => {
    const largo = 'x'.repeat(MAX_TOKENS_GEMINI_OUTPUT * 4 + 500);
    const resultado = truncarOutputProveedor(largo, 'deepseek');

    assert.ok(resultado.length < largo.length, 'debe recortar el contenido original');
    assert.match(resultado, /OUTPUT DEEPSEEK TRUNCADO/, 'debe nombrar el proveedor real, no asumir Gemini');
  });

  test('nombre de proveedor por defecto si no se pasa', () => {
    const largo = 'y'.repeat(MAX_TOKENS_GEMINI_OUTPUT * 4 + 500);
    const resultado = truncarOutputProveedor(largo);
    assert.match(resultado, /OUTPUT PROVEEDOR TRUNCADO/);
  });

  test('fail-closed ante input no-string (null, undefined, numero)', () => {
    assert.equal(truncarOutputProveedor(null, 'openai'), '');
    assert.equal(truncarOutputProveedor(undefined, 'openai'), '');
    assert.equal(truncarOutputProveedor(42, 'openai'), '');
  });

  test('string vacio o solo whitespace no lanza y retorna vacio', () => {
    assert.equal(truncarOutputProveedor('', 'kimi'), '');
    assert.equal(truncarOutputProveedor('   ', 'kimi'), '   ');
  });
});
