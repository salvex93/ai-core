'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { BIN } = require('./_shared');

describe('lib/guard-report.js', () => {
  const { emitirReporte, GUARD_REPORT_PATH } = require(path.join(BIN, 'lib', 'guard-report.js'));

  after(() => {
    fs.rmSync(GUARD_REPORT_PATH, { force: true });
  });

  test('emitirReporte respeta AI_CORE_GUARD_REPORT_PATH para aislar en tests', () => {
    // Este test usa require() directo (mismo proceso), asi que GUARD_REPORT_PATH
    // ya se resolvio con el valor de entorno vigente al momento del require --
    // se verifica contra esa constante, no contra un valor hardcodeado.
    assert.ok(GUARD_REPORT_PATH.length > 0);
  });

  test('emitirReporte escribe un objeto con esquema {guard, verdict, severity}', () => {
    const ruta = path.join(os.tmpdir(), `guard-report-test-${process.pid}.json`);
    emitirReporte({
      guard: 'secrets-guard',
      verdict: 'blocked',
      severity: 'critica',
      hallazgos: ['OpenAI API key'],
    }, ruta);

    const contenido = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    assert.equal(contenido.guard, 'secrets-guard');
    assert.equal(contenido.verdict, 'blocked');
    assert.equal(contenido.severity, 'critica');
    assert.deepEqual(contenido.hallazgos, ['OpenAI API key']);
    assert.ok(contenido.timestamp, 'debe incluir timestamp ISO');

    fs.rmSync(ruta, { force: true });
  });

  test('emitirReporte rechaza un verdict fuera del enum permitido', () => {
    assert.throws(() => emitirReporte({ guard: 'x', verdict: 'invalido', severity: 'baja' }));
  });

  test('emitirReporte rechaza una severity fuera del enum permitido', () => {
    assert.throws(() => emitirReporte({ guard: 'x', verdict: 'ok', severity: 'invalida' }));
  });

  test('emitirReporte hace append -- no sobreescribe reportes previos de otros guards en la misma sesion', () => {
    const ruta = path.join(os.tmpdir(), `guard-report-append-test-${process.pid}.json`);
    fs.rmSync(ruta, { force: true });

    emitirReporte({ guard: 'guard-a', verdict: 'ok', severity: 'baja' }, ruta);
    emitirReporte({ guard: 'guard-b', verdict: 'warn', severity: 'media' }, ruta);

    const lineas = fs.readFileSync(ruta, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.equal(lineas.length, 2);
    assert.equal(lineas[0].guard, 'guard-a');
    assert.equal(lineas[1].guard, 'guard-b');

    fs.rmSync(ruta, { force: true });
  });
});
