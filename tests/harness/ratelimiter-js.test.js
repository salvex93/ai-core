'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('RateLimiter.js', () => {
  const { verificar, registrar, estado, RateLimitError, LIMITES, _reset } =
    require(path.join(REPO, 'scripts', 'services', 'RateLimiter.js'));

  test('estado inicial: sin uso registrado', () => {
    _reset();
    const e = estado();
    assert.equal(e.requests.actual, 0);
    assert.equal(e.tokens_input.actual, 0);
    assert.equal(e.tokens_output.actual, 0);
  });

  test('verificar: no lanza dentro del limite', () => {
    _reset();
    assert.doesNotThrow(() => verificar({ tokensInput: 100, tokensOutput: 50 }));
  });

  test('registrar: acumula uso real en el estado', () => {
    _reset();
    registrar({ input_tokens: 1000, output_tokens: 500 });
    const e = estado();
    assert.equal(e.tokens_input.actual, 1000);
    assert.equal(e.tokens_output.actual, 500);
    assert.equal(e.requests.actual, 1);
  });

  test('verificar: lanza RateLimitError al superar requests/min (limite seguro)', () => {
    _reset();
    const limiteSeguro = Math.floor(LIMITES.requests_por_minuto * LIMITES.factor_seguridad);
    for (let i = 0; i < limiteSeguro; i++) registrar({ input_tokens: 1, output_tokens: 1 });

    assert.throws(() => verificar({}), RateLimitError);
  });

  test('verificar: lanza RateLimitError al superar input_tokens/min', () => {
    _reset();
    registrar({ input_tokens: Math.floor(LIMITES.input_tokens_por_minuto * LIMITES.factor_seguridad), output_tokens: 0 });
    assert.throws(() => verificar({ tokensInput: 1 }), RateLimitError);
  });

  test('RateLimitError incluye recurso, actual, limite y tiempo de espera', () => {
    _reset();
    const limiteSeguro = Math.floor(LIMITES.requests_por_minuto * LIMITES.factor_seguridad);
    for (let i = 0; i < limiteSeguro; i++) registrar({});

    try {
      verificar({});
      assert.fail('debia lanzar RateLimitError');
    } catch (e) {
      assert.ok(e instanceof RateLimitError);
      assert.equal(e.recurso, 'requests/min');
      assert.ok(e.esperarMs >= 0);
    }
  });

  after(() => _reset()); // no dejar estado sucio para otras suites
});

// ─── ResponseValidator.js ─────────────────────────────────────────────────────
