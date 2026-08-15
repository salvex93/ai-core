'use strict';

/**
 * lib/bm25-engine.js — bug real encontrado durante la construccion del
 * benchmark de Contextual Retrieval (2026-08-15): buildIndex() usaba
 * objetos planos ({}) para df/inv/len, indexados directamente por token.
 * Un token real del corpus (ej. "constructor", "push" -- palabras que
 * aparecen literalmente en SKILL.md que documentan codigo JS) colisiona
 * con propiedades heredadas del prototipo de Object -- "inv['constructor']"
 * no es undefined (es la funcion Object), asi que "!inv[t]" es false y el
 * codigo intenta inv[t].push(...) sobre una funcion, no un array,
 * lanzando TypeError y rompiendo la indexacion completa del corpus.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { BIN } = require('./_shared');

const { buildIndex, bm25Score } = require(path.join(BIN, 'lib', 'bm25-engine.js'));

describe('lib/bm25-engine.js — buildIndex con tokens que colisionan con Object.prototype', () => {
  test('un fragmento cuyo texto tokeniza la palabra "constructor" no lanza TypeError al indexar', () => {
    const frags = [
      { id: 'a#1', tokens: ['constructor', 'ejemplo', 'codigo'] },
    ];
    assert.doesNotThrow(() => buildIndex(frags));
  });

  test('un fragmento con el token "push" se indexa correctamente (no colisiona con Array.prototype.push heredado)', () => {
    const frags = [
      { id: 'b#1', tokens: ['push', 'metodo', 'array'] },
    ];
    const index = buildIndex(frags);
    assert.ok(Array.isArray(index.inv['push']), 'inv["push"] debe ser un array real, no la funcion heredada Array.prototype.push');
    assert.equal(index.inv['push'].length, 1);
  });

  test('el conteo de document frequency (df) para un token que colisiona con el prototipo es numerico, no NaN', () => {
    const frags = [
      { id: 'c#1', tokens: ['constructor'] },
      { id: 'c#2', tokens: ['constructor', 'otro'] },
    ];
    const index = buildIndex(frags);
    assert.equal(index.df['constructor'], 2, 'df debe contar 2 ocurrencias reales, no heredar la funcion Object del prototipo');
    assert.equal(Number.isNaN(index.df['constructor']), false);
  });

  test('bm25Score() retorna resultados validos (no NaN) cuando la query incluye un token que colisiona con el prototipo', () => {
    const frags = [
      { id: 'd#1', tokens: ['constructor', 'patron', 'diseno'] },
      { id: 'd#2', tokens: ['patron', 'observador'] },
    ];
    const index = buildIndex(frags);
    const scores = bm25Score('constructor patron', index);
    assert.ok(scores.length > 0, 'debe retornar al menos un resultado');
    for (const [, score] of scores) {
      assert.equal(Number.isNaN(score), false, 'ningun score debe ser NaN');
    }
  });

  test('otros tokens que colisionan con el prototipo (toString, valueOf, hasOwnProperty, __proto__) tambien se indexan correctamente', () => {
    const frags = [
      { id: 'e#1', tokens: ['tostring', 'valueof', 'hasownproperty'] }, // ya en minuscula/stem, como los produce tokenize()
    ];
    assert.doesNotThrow(() => buildIndex(frags));
  });
});
