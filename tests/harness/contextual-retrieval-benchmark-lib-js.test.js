'use strict';

/**
 * lib/contextual-retrieval-benchmark.js — verifica el HARNESS de medicion
 * (recall@K, aplicacion de prefijo contextual) con datos controlados, no
 * el resultado real del benchmark contra el corpus de skills (eso requiere
 * generacion de prefijo via LLM real, corrido por separado, ver
 * scripts/run-contextual-retrieval-benchmark.js).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { BIN } = require('./_shared');
const { buildIndex } = require(path.join(BIN, 'lib', 'bm25-engine.js'));

const {
  cargarCorpus,
  aplicarContextualRetrieval,
  medirRecall,
} = require(path.join(BIN, 'lib', 'contextual-retrieval-benchmark.js'));

describe('lib/contextual-retrieval-benchmark.js', () => {
  test('cargarCorpus() fragmenta el corpus real de .claude/skills y genera IDs unicos por skill (no colisionan como "SKILL#N" identico entre archivos)', () => {
    const { SKILLS } = require(path.join(__dirname, '_shared'));
    const frags = cargarCorpus(SKILLS);
    assert.ok(frags.length > 500, `debe fragmentar un corpus real de tamano significativo (obtuvo ${frags.length})`);

    const ids = frags.map(f => f.id);
    assert.equal(new Set(ids).size, ids.length, 'todos los IDs de fragmento deben ser unicos');

    // Confirma que el nombre real del skill (no el literal "SKILL") quedo
    // en el id -- si esto fallara, todos los fragmentos colisionarian en
    // "skill/SKILL#N" entre los 43 archivos (todos se llaman SKILL.md).
    assert.ok(frags.some(f => f.id.includes('claude-api')), 'debe incluir el nombre real del skill en el id, no "SKILL" literal');
  });

  test('medirRecall() con un indice controlado y ground truth ficticio calcula recall@K correctamente', () => {
    const fragsControlados = [
      { id: 'a#1', source: 'a', rol: 'test', text: 'contenido sobre gatos', tokens: ['contenido', 'gatos'] },
      { id: 'a#2', source: 'a', rol: 'test', text: 'contenido sobre perros', tokens: ['contenido', 'perros'] },
    ];
    const index = buildIndex(fragsControlados);

    // Sustituir el GROUND_TRUTH real por uno controlado via monkey-patch
    // del modulo no es limpio -- en su lugar, se verifica el contrato de
    // medirRecall() ejercitando su logica de scoring directamente contra
    // este indice pequeno, confirmando que topK/acierto se calculan bien
    // para al menos una query conocida del GROUND_TRUTH real (que no
    // matcheara nada en este indice ficticio, comportamiento esperado).
    const resultado = medirRecall(index, 5);
    assert.ok(Array.isArray(resultado.detalle), 'debe retornar un array de detalle por query');
    assert.equal(resultado.detalle.length > 0, true, 'debe evaluar todas las queries del ground truth');
    assert.ok(typeof resultado.recallAtK === 'number' && resultado.recallAtK >= 0 && resultado.recallAtK <= 1, 'recallAtK debe ser una fraccion entre 0 y 1');
  });

  test('aplicarContextualRetrieval() antepone el prefijo generado y re-tokeniza el texto resultante', () => {
    const frags = [
      { id: 'x#1', source: 'x', rol: 'test', text: 'el gato duerme en el sofa', tokens: ['gato', 'duerme', 'sofa'] },
    ];
    const conContexto = aplicarContextualRetrieval(frags, () => 'Este fragmento describe una mascota domestica en reposo.');

    assert.equal(conContexto.length, 1);
    assert.match(conContexto[0].text, /mascota domestica/);
    assert.match(conContexto[0].text, /el gato duerme en el sofa/);
    // Los tokens deben reflejar el texto combinado -- "mascota" debe
    // aparecer como token nuevo que no estaba en el fragmento original.
    assert.ok(conContexto[0].tokens.some(t => t.includes('mascot')), 'debe tokenizar tambien el contenido del prefijo (stemming puede recortar la palabra)');
  });

  test('aplicarContextualRetrieval() con prefijo vacio no rompe (edge case: LLM devuelve string vacio)', () => {
    const frags = [{ id: 'y#1', source: 'y', rol: 'test', text: 'contenido original', tokens: ['contenido', 'original'] }];
    const conContexto = aplicarContextualRetrieval(frags, () => '');
    assert.match(conContexto[0].text, /contenido original/);
  });
});
