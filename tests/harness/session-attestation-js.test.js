'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { BIN } = require('./_shared');

describe('lib/session-attestation.js', () => {
  const att = require(path.join(BIN, 'lib', 'session-attestation.js'));
  const { publica, privada } = att.generarParDeClaves();

  const base = {
    sessionId: 'sesion-1',
    version: '3.40.1',
    gitHead: 'abc1234',
    emitidoEn: '2026-10-29T00:00:00.000Z',
    guardReportes: [
      { guard: 'secrets-guard', verdict: 'ok', severity: 'baja', hallazgos: [] },
      { guard: 'secrets-guard', verdict: 'blocked', severity: 'alta', hallazgos: ['aws-key'] },
      { guard: 'injection-guard', verdict: 'warn', severity: 'media', hallazgos: [] },
    ],
    breakGlass: [{ id: '270e6b47', guardId: 'outside-path-guard', contexto: 'cat ~/.ssh/id_rsa' }],
  };

  function cadena(n) {
    const sobres = [];
    let prev = att.GENESIS;
    for (let i = 0; i < n; i++) {
      const sobre = att.firmarInforme(att.construirInforme({ ...base, sessionId: `s${i}`, prevHash: prev }), privada);
      sobres.push(sobre);
      prev = sobre.hash;
    }
    return sobres;
  }

  test('canonicalizar no depende del orden de las claves, tampoco en anidados', () => {
    const a = att.canonicalizar({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 3 } });
    const b = att.canonicalizar({ a: { c: 3, d: [1, { y: 2, z: 1 }] }, b: 1 });
    assert.equal(a, b);
  });

  test('construirInforme agrega veredictos por guard y no copia el contexto de break-glass', () => {
    const informe = att.construirInforme({ ...base, prevHash: att.GENESIS });
    assert.deepEqual(informe.guards.total, { ok: 1, warn: 1, blocked: 1 });
    assert.deepEqual(informe.guards.porGuard['secrets-guard'], { ok: 1, warn: 0, blocked: 1 });
    assert.deepEqual(informe.breakGlass, [{ id: '270e6b47', guardId: 'outside-path-guard' }]);
    assert.ok(!JSON.stringify(informe).includes('id_rsa'));
    assert.equal(informe.prevHash, att.GENESIS);
  });

  test('un sobre firmado verifica y deja de verificar si se altera cualquier campo', () => {
    const sobre = att.firmarInforme(att.construirInforme({ ...base, prevHash: att.GENESIS }), privada);
    assert.equal(att.verificarSobre(sobre, publica), true);
    const alterado = JSON.parse(JSON.stringify(sobre));
    alterado.informe.guards.total.blocked = 0;
    assert.equal(att.verificarSobre(alterado, publica), false);
  });

  test('un sobre firmado con otra clave no verifica', () => {
    const otra = att.generarParDeClaves();
    const sobre = att.firmarInforme(att.construirInforme({ ...base, prevHash: att.GENESIS }), otra.privada);
    assert.equal(att.verificarSobre(sobre, publica), false);
  });

  test('verificarCadena acepta una cadena integra y la vacia', () => {
    assert.deepEqual(att.verificarCadena(cadena(3), publica), { ok: true, indiceRoto: null, motivo: null });
    assert.equal(att.verificarCadena([], publica).ok, true);
  });

  test('verificarCadena localiza el sobre alterado', () => {
    const c = cadena(3);
    c[1].informe.guards.total.blocked = 99;
    const r = att.verificarCadena(c, publica);
    assert.equal(r.ok, false);
    assert.equal(r.indiceRoto, 1);
  });

  test('verificarCadena detecta un sobre eliminado del medio y un primer sobre que no es genesis', () => {
    const c = cadena(3);
    const sinMedio = [c[0], c[2]];
    const r = att.verificarCadena(sinMedio, publica);
    assert.equal(r.ok, false);
    assert.equal(r.indiceRoto, 1);
    const sinPrimero = att.verificarCadena([c[1], c[2]], publica);
    assert.equal(sinPrimero.ok, false);
    assert.equal(sinPrimero.indiceRoto, 0);
  });

  test('firmarInforme rechaza un informe sin prevHash', () => {
    const informe = att.construirInforme({ ...base, prevHash: att.GENESIS });
    delete informe.prevHash;
    assert.throws(() => att.firmarInforme(informe, privada), /prevHash/);
  });
});
