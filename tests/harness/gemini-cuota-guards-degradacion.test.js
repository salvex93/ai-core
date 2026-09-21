'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const { spawnSync } = require('node:child_process');
const { BIN, REPO } = require('./_shared');

const {
  marcarCuotaAgotada, cuotaAgotada, esErrorDeCuota,
} = require(path.join(BIN, 'lib', 'gemini-cuota'));

function dirAislado() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cuota-'));
}

function ejecutar(script, evento, dir, args = []) {
  return spawnSync('node', [path.join(BIN, script), ...args], {
    input: JSON.stringify(evento), encoding: 'utf8', cwd: REPO,
    env: { ...process.env, AI_CORE_TEST_MODE: '1', GEMINI_API_KEY: 'clave-de-prueba', AI_CORE_GEMINI_CUOTA_DIR: dir },
  });
}

const eventoWeb = { hook_event_name: 'PreToolUse', tool_name: 'WebSearch', tool_input: { query: 'x' } };

describe('lib/gemini-cuota', () => {
  test('sin marcador la cuota no esta agotada', () => {
    assert.equal(cuotaAgotada(Date.now(), dirAislado()), false);
  });

  test('marcador vigente: cuota agotada', () => {
    const dir = dirAislado();
    marcarCuotaAgotada(Date.now(), dir);
    assert.equal(cuotaAgotada(Date.now(), dir), true);
  });

  test('marcador vencido por TTL: cuota disponible de nuevo', () => {
    const dir = dirAislado();
    const hace = Date.now() - 60 * 60 * 1000;
    marcarCuotaAgotada(hace, dir);
    assert.equal(cuotaAgotada(Date.now(), dir), false);
  });

  test('marcador corrupto no bloquea: se trata como cuota disponible', () => {
    const dir = dirAislado();
    fs.writeFileSync(path.join(dir, 'estado.json'), '{no-json', 'utf8');
    assert.equal(cuotaAgotada(Date.now(), dir), false);
  });

  test('esErrorDeCuota reconoce status 429 y RESOURCE_EXHAUSTED', () => {
    assert.equal(esErrorDeCuota({ status: 429, message: 'x' }), true);
    assert.equal(esErrorDeCuota(new Error('{"error":{"status":"RESOURCE_EXHAUSTED"}}')), true);
  });

  test('esErrorDeCuota rechaza errores que no son de cuota', () => {
    assert.equal(esErrorDeCuota(new Error('timeout de red')), false);
    assert.equal(esErrorDeCuota({ status: 500, message: 'interno' }), false);
    assert.equal(esErrorDeCuota(null), false);
  });
});

describe('web-search-guard con cuota de Gemini agotada', () => {
  test('cuota disponible: deniega WebSearch (comportamiento previo)', () => {
    const r = ejecutar('web-search-guard.js', eventoWeb, dirAislado());
    assert.equal(r.status, 0);
    assert.match(r.stdout, /"permissionDecision":\s*"deny"/);
  });

  test('cuota agotada: permite la tool nativa (sin deny)', () => {
    const dir = dirAislado();
    marcarCuotaAgotada(Date.now(), dir);
    const r = ejecutar('web-search-guard.js', eventoWeb, dir);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  });
});

describe('guard-read con cuota de Gemini agotada', () => {
  function archivoLargo() {
    const f = path.join(dirAislado(), 'largo.js');
    fs.writeFileSync(f, 'x;\n'.repeat(300), 'utf8');
    return f;
  }

  test('cuota disponible: deniega el Read de un archivo largo', () => {
    const r = ejecutar('guard-read.js', {}, dirAislado(), [archivoLargo()]);
    assert.match(r.stdout, /"permissionDecision":\s*"deny"/);
  });

  test('cuota agotada: permite el Read nativo', () => {
    const dir = dirAislado();
    marcarCuotaAgotada(Date.now(), dir);
    const r = ejecutar('guard-read.js', {}, dir, [archivoLargo()]);
    assert.equal(r.stdout.trim(), '');
  });
});
