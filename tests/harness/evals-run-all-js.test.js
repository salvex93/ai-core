'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { REPO } = require('./_shared');

describe('.claude/evals/run-all.js', () => {
  const MODULE = path.join(REPO, '.claude', 'evals', 'run-all.js');
  const { listarConfigs, resumirTotales } = require(MODULE);

  describe('listarConfigs', () => {
    test('lista todos los *.promptfooconfig.yaml del directorio, ordenados', () => {
      const leerDirFake = () => ['b.promptfooconfig.yaml', 'a.promptfooconfig.yaml', 'runner.js', 'a-chat.json'];
      const configs = listarConfigs('/repo/.claude/evals', leerDirFake);
      assert.deepEqual(configs, ['a.promptfooconfig.yaml', 'b.promptfooconfig.yaml']);
    });

    test('directorio vacio de configs retorna arreglo vacio', () => {
      const leerDirFake = () => ['runner.js', 'prompt-loader.js'];
      assert.deepEqual(listarConfigs('/repo/.claude/evals', leerDirFake), []);
    });
  });

  describe('resumirTotales', () => {
    test('agrega aprobados/fallidos y expone el detalle por skill', () => {
      const resultados = [
        { skill: 'a', resumen: { total: 5, pasaron: 5, fallaron: 0, aprueba: true } },
        { skill: 'b', resumen: { total: 4, pasaron: 3, fallaron: 1, aprueba: false } },
      ];
      const totales = resumirTotales(resultados);
      assert.equal(totales.totalSkills, 2);
      assert.equal(totales.aprobados, 1);
      assert.equal(totales.fallidos, 1);
      assert.deepEqual(totales.skillsFallidos, ['b']);
    });

    test('lista vacia: 0 skills, ninguno aprueba ni falla, sin crash', () => {
      const totales = resumirTotales([]);
      assert.equal(totales.totalSkills, 0);
      assert.equal(totales.aprobados, 0);
      assert.equal(totales.fallidos, 0);
      assert.deepEqual(totales.skillsFallidos, []);
    });

    test('todos aprueban: skillsFallidos vacio', () => {
      const resultados = [
        { skill: 'a', resumen: { total: 2, pasaron: 2, fallaron: 0, aprueba: true } },
        { skill: 'b', resumen: { total: 3, pasaron: 3, fallaron: 0, aprueba: true } },
      ];
      const totales = resumirTotales(resultados);
      assert.equal(totales.aprobados, 2);
      assert.deepEqual(totales.skillsFallidos, []);
    });
  });
});
