'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');
const { REPO, BIN } = require('./_shared');

const { revisarCadenaAtestacion } = require(path.join(REPO, 'scripts', 'quality-gate-atestacion.js'));
const att   = require(path.join(BIN, 'lib', 'session-attestation.js'));
const store = require(path.join(BIN, 'lib', 'session-attestation-store.js'));

describe('revisarCadenaAtestacion', () => {
  function montar(n) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-att-'));
    const claves = store.generarClaves(path.join(dir, 'k'));
    const cadena = path.join(dir, 'cadena.jsonl');
    const privada = fs.readFileSync(claves.privada, 'utf8');
    for (let i = 0; i < n; i++) {
      const informe = att.construirInforme({ sessionId: `s${i}`, version: '1', prevHash: store.hashCabeza(cadena) });
      store.agregarSobre(cadena, att.firmarInforme(informe, privada));
    }
    return { cadena, publica: claves.publica };
  }

  test('sin cadena en la maquina el check pasa (la firma es opt-in)', () => {
    const r = revisarCadenaAtestacion({ cadena: path.join(os.tmpdir(), 'no-existe-gate.jsonl'), publica: '/no/existe.pub' });
    assert.equal(r.ok, true);
  });

  test('cadena integra pasa', () => {
    assert.equal(revisarCadenaAtestacion(montar(3)).ok, true);
  });

  test('cadena alterada falla e indica el sobre', () => {
    const e = montar(2);
    fs.writeFileSync(e.cadena, fs.readFileSync(e.cadena, 'utf8').replace('"s1"', '"s9"'));
    const r = revisarCadenaAtestacion(e);
    assert.equal(r.ok, false);
    assert.match(r.detalle, /sobre 1/);
  });

  test('cadena sin clave publica falla: no se puede verificar', () => {
    const e = montar(1);
    const r = revisarCadenaAtestacion({ cadena: e.cadena, publica: '/no/existe.pub' });
    assert.equal(r.ok, false);
    assert.match(r.detalle, /clave publica/);
  });
});
