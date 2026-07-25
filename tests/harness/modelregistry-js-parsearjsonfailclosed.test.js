'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('ModelRegistry.js — parsearJSONFailClosed', () => {
  const { parsearJSONFailClosed } = require(path.join(REPO, 'scripts', 'services', 'ModelRegistry.js'));

  test('JSON valido se parsea correctamente', () => {
    const obj = parsearJSONFailClosed('{"ok": true, "valor": 42}');
    assert.deepEqual(obj, { ok: true, valor: 42 });
  });

  test('JSON valido con texto alrededor extrae el objeto', () => {
    const obj = parsearJSONFailClosed('Aqui esta el resultado: {"ok": true} -- fin del mensaje');
    assert.deepEqual(obj, { ok: true });
  });

  test('texto no-JSON falla cerrado (retorna null)', () => {
    assert.equal(parsearJSONFailClosed('esto no es JSON en absoluto'), null);
  });

  test('string vacio falla cerrado (retorna null)', () => {
    assert.equal(parsearJSONFailClosed(''), null);
    assert.equal(parsearJSONFailClosed('   '), null);
  });

  test('input no-string falla cerrado (retorna null) sin lanzar excepcion', () => {
    assert.equal(parsearJSONFailClosed(null), null);
    assert.equal(parsearJSONFailClosed(undefined), null);
    assert.equal(parsearJSONFailClosed(42), null);
  });

  test('JSON truncado/malformado falla cerrado (retorna null)', () => {
    assert.equal(parsearJSONFailClosed('{"pass": true, "hallazg'), null);
  });
});
