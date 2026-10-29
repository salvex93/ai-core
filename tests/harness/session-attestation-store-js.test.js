'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const { BIN } = require('./_shared');

describe('lib/session-attestation-store.js', () => {
  const att   = require(path.join(BIN, 'lib', 'session-attestation.js'));
  const store = require(path.join(BIN, 'lib', 'session-attestation-store.js'));
  const tmp   = () => fs.mkdtempSync(path.join(os.tmpdir(), 'attest-store-'));

  test('leerJsonl devuelve [] si no existe y salta lineas malformadas', () => {
    const dir = tmp();
    assert.deepEqual(store.leerJsonl(path.join(dir, 'no-existe.jsonl')), []);
    const f = path.join(dir, 'a.jsonl');
    fs.writeFileSync(f, '{"a":1}\nno-es-json\n\n{"b":2}\n');
    assert.deepEqual(store.leerJsonl(f), [{ a: 1 }, { b: 2 }]);
  });

  test('generarClaves crea la privada con permisos 0600 y no sobrescribe', () => {
    const dir = path.join(tmp(), 'claves');
    const r = store.generarClaves(dir);
    assert.equal(fs.statSync(r.privada).mode & 0o777, 0o600);
    assert.match(fs.readFileSync(r.publica, 'utf8'), /BEGIN PUBLIC KEY/);
    assert.throws(() => store.generarClaves(dir), /ya existe/);
  });

  test('agregarSobre encadena y leerCadena verifica con la clave publica', () => {
    const dir = tmp();
    const { publica, privada } = store.generarClaves(path.join(dir, 'k'));
    const cadena = path.join(dir, 'cadena.jsonl');
    for (let i = 0; i < 3; i++) {
      const informe = att.construirInforme({ sessionId: `s${i}`, version: '1', prevHash: store.hashCabeza(cadena) });
      store.agregarSobre(cadena, att.firmarInforme(informe, fs.readFileSync(privada, 'utf8')));
    }
    const sobres = store.leerJsonl(cadena);
    assert.equal(sobres.length, 3);
    assert.equal(att.verificarCadena(sobres, fs.readFileSync(publica, 'utf8')).ok, true);
    assert.equal(store.hashCabeza(cadena), sobres[2].hash);
  });

  test('hashCabeza de una cadena inexistente es GENESIS', () => {
    assert.equal(store.hashCabeza(path.join(tmp(), 'nada.jsonl')), att.GENESIS);
  });
});
