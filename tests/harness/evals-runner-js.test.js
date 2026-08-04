'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { REPO } = require('./_shared');

describe('.claude/evals/runner.js', () => {
  const RUNNER = path.join(REPO, '.claude', 'evals', 'runner.js');
  const { construirComando, resumirResultado, correrEval } = require(RUNNER);

  test('construirComando invoca npx promptfoo@latest eval con -c, -o y --env-path .env', () => {
    const { cmd, args } = construirComando('/repo/.claude/evals/security-auditor.promptfooconfig.yaml', '/tmp/out.json');
    assert.equal(cmd, 'npx');
    assert.deepEqual(args, [
      '--yes', 'promptfoo@latest', 'eval',
      '-c', '/repo/.claude/evals/security-auditor.promptfooconfig.yaml',
      '-o', '/tmp/out.json',
      '--no-progress-bar',
      '--env-path', '.env',
    ]);
  });

  describe('resumirResultado', () => {
    test('todos los casos pasan: aprueba = true', () => {
      const r = resumirResultado({ results: { stats: { successes: 5, failures: 0 } } });
      assert.deepEqual(r, { total: 5, pasaron: 5, fallaron: 0, aprueba: true });
    });

    test('al menos un caso falla: aprueba = false', () => {
      const r = resumirResultado({ results: { stats: { successes: 4, failures: 1 } } });
      assert.deepEqual(r, { total: 5, pasaron: 4, fallaron: 1, aprueba: false });
    });

    test('sin stats (JSON malformado o vacio): no aprueba, total 0', () => {
      const r = resumirResultado({});
      assert.deepEqual(r, { total: 0, pasaron: 0, fallaron: 0, aprueba: false });
    });

    test('total 0 casos nunca aprueba (evita falso positivo de config vacia)', () => {
      const r = resumirResultado({ results: { stats: { successes: 0, failures: 0 } } });
      assert.equal(r.aprueba, false);
    });
  });

  describe('correrEval', () => {
    test('spawnSync exit 0 y todos los casos pasan: exitCode 0', () => {
      const ejecutarFake = () => ({ status: 0, stdout: '', stderr: '', error: undefined });
      const leerJsonFake = () => ({ results: { stats: { successes: 3, failures: 0 } } });

      const { resumen, exitCode } = correrEval('config.yaml', 'out.json', ejecutarFake, leerJsonFake);
      assert.equal(exitCode, 0);
      assert.equal(resumen.aprueba, true);
    });

    test('spawnSync exit 100 (promptfoo: eval corrio, alguna assertion fallo): exitCode 1', () => {
      const ejecutarFake = () => ({ status: 100, stdout: '', stderr: '' });
      const leerJsonFake = () => ({ results: { stats: { successes: 2, failures: 1 } } });

      const { resumen, exitCode } = correrEval('config.yaml', 'out.json', ejecutarFake, leerJsonFake);
      assert.equal(exitCode, 1);
      assert.equal(resumen.fallaron, 1);
    });

    test('spawnSync con exit code de fallo real de ejecucion (ej. config invalida): exitCode 1, no intenta leer el JSON', () => {
      const ejecutarFake = () => ({ status: 1, stdout: '', stderr: 'error: config invalida' });
      const leerJsonFake = () => { throw new Error('no deberia llamarse -- el JSON de salida nunca se escribio'); };

      const { resumen, exitCode } = correrEval('config.yaml', 'out.json', ejecutarFake, leerJsonFake);
      assert.equal(exitCode, 1);
      assert.equal(resumen.total, 0);
    });

    test('spawnSync no encuentra el binario (ENOENT, status null): exitCode 1, no intenta leer el JSON', () => {
      const ejecutarFake = () => ({ status: null, stdout: '', stderr: '', error: new Error('spawnSync npx ENOENT') });
      const leerJsonFake = () => { throw new Error('no deberia llamarse -- el proceso nunca corrio'); };

      const { resumen, exitCode } = correrEval('config.yaml', 'out.json', ejecutarFake, leerJsonFake);
      assert.equal(exitCode, 1);
      assert.equal(resumen.total, 0);
    });
  });
});
