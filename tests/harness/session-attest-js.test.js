'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const { BIN, runScript } = require('./_shared');

describe('session-attest.js', () => {
  const script = path.join(BIN, 'session-attest.js');

  function entorno() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attest-cli-'));
    const reporte = path.join(dir, 'guards.jsonl');
    const env = {
      AI_CORE_ATTEST_DIR: path.join(dir, 'claves'),
      AI_CORE_ATTEST_CHAIN: path.join(dir, 'cadena.jsonl'),
      AI_CORE_ATTEST_BREAK_GLASS: path.join(dir, 'bg.jsonl'),
      AI_CORE_GUARD_REPORT_PATH: reporte,
      CLAUDE_CODE_SESSION_ID: 'sesion-a',
    };
    return { dir, reporte, env };
  }
  const linea = (guard, verdict) => JSON.stringify({ guard, verdict, severity: 'baja', hallazgos: [] }) + '\n';

  test('sign sin clave privada sale 0 y no escribe nada (el hook nunca debe fallar)', () => {
    const { env } = entorno();
    const r = runScript(script, ['sign'], env);
    assert.equal(r.status, 0);
    assert.equal(fs.existsSync(env.AI_CORE_ATTEST_CHAIN), false);
  });

  test('keygen, sign y verify forman un ciclo valido; keygen no sobrescribe', () => {
    const { reporte, env } = entorno();
    assert.equal(runScript(script, ['keygen'], env).status, 0);
    assert.notEqual(runScript(script, ['keygen'], env).status, 0);
    fs.writeFileSync(reporte, linea('secrets-guard', 'blocked') + linea('secrets-guard', 'ok'));
    assert.equal(runScript(script, ['sign'], env).status, 0);
    const v = runScript(script, ['verify'], env);
    assert.equal(v.status, 0);
    assert.match(v.stdout, /1 sobre/);
    assert.match(v.stdout, /[0-9a-f]{64}/);
  });

  test('sign no duplica un sobre cuando la misma sesion no cambio y agrega uno cuando cambia', () => {
    const { reporte, env } = entorno();
    runScript(script, ['keygen'], env);
    fs.writeFileSync(reporte, linea('injection-guard', 'warn'));
    runScript(script, ['sign'], env);
    runScript(script, ['sign'], env);
    const filas = () => fs.readFileSync(env.AI_CORE_ATTEST_CHAIN, 'utf8').trim().split('\n');
    assert.equal(filas().length, 1);
    fs.appendFileSync(reporte, linea('injection-guard', 'blocked'));
    runScript(script, ['sign'], env);
    assert.equal(filas().length, 2);
    assert.equal(runScript(script, ['verify'], env).status, 0);
  });

  test('verify falla y localiza el sobre cuando se altera la cadena', () => {
    const { reporte, env } = entorno();
    runScript(script, ['keygen'], env);
    fs.writeFileSync(reporte, linea('a-guard', 'ok'));
    runScript(script, ['sign'], env);
    const crudo = fs.readFileSync(env.AI_CORE_ATTEST_CHAIN, 'utf8').replace('"ok":1', '"ok":9');
    fs.writeFileSync(env.AI_CORE_ATTEST_CHAIN, crudo);
    const v = runScript(script, ['verify'], env);
    assert.equal(v.status, 1);
    assert.match(v.stdout + v.stderr, /sobre 0/);
  });

  test('el break-glass entra por id y guardId, nunca por contexto', () => {
    const { env } = entorno();
    runScript(script, ['keygen'], env);
    fs.writeFileSync(env.AI_CORE_ATTEST_BREAK_GLASS,
      JSON.stringify({ confirmadoEn: new Date().toISOString(), id: 'x1', guardId: 'outside-path-guard', contexto: 'cat ~/.ssh/id_rsa' }) + '\n');
    runScript(script, ['sign'], env);
    const crudo = fs.readFileSync(env.AI_CORE_ATTEST_CHAIN, 'utf8');
    assert.match(crudo, /outside-path-guard/);
    assert.ok(!crudo.includes('id_rsa'));
  });
});
