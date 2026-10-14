'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { canonicalizarComando } = require('../../.claude/bin/lib/clave-aprobacion');

describe('lib/clave-aprobacion.js — canonicalizarComando', () => {
  test('reordena tokens de flags separadas en cualquier orden: "-r -f x" y "-f -r x" producen la misma clave', () => {
    assert.equal(canonicalizarComando('rm -r -f build/'), canonicalizarComando('rm -f -r build/'));
  });

  test('reordena flags largas en cualquier orden: "--recursive --force" y "--force --recursive" producen la misma clave', () => {
    assert.equal(
      canonicalizarComando('rm --recursive --force build/'),
      canonicalizarComando('rm --force --recursive build/')
    );
  });

  test('preserva distincion de objetivo real: "rm -rf build/" y "rm -rf dist/" producen claves distintas', () => {
    assert.notEqual(canonicalizarComando('rm -rf build/'), canonicalizarComando('rm -rf dist/'));
  });

  test('preserva distincion de comando base: "rm -rf x" y "docker volume rm -rf x" producen claves distintas', () => {
    assert.notEqual(canonicalizarComando('rm -rf x'), canonicalizarComando('docker volume rm -rf x'));
  });

  test('comando sin flags queda igual', () => {
    assert.equal(canonicalizarComando('git branch -D feature/x'), canonicalizarComando('git branch -D feature/x'));
  });

  test('input no-string devuelve cadena vacia', () => {
    assert.equal(canonicalizarComando(undefined), '');
    assert.equal(canonicalizarComando(null), '');
    assert.equal(canonicalizarComando(42), '');
  });

  test('cadena vacia devuelve cadena vacia', () => {
    assert.equal(canonicalizarComando(''), '');
  });

  test('es determinista: llamar dos veces con el mismo input da el mismo resultado', () => {
    const cmd = 'terraform apply -auto-approve -target=x';
    assert.equal(canonicalizarComando(cmd), canonicalizarComando(cmd));
  });
});
