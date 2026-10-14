'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const { spawnSync } = require('node:child_process');
const { BIN, entornoGitAislado: entornoAislado } = require('./_shared');

const {
  IDENTIDAD_REQUERIDA, identidadValida, leerIdentidad, asegurarIdentidad,
} = require(path.join(BIN, 'lib', 'git-identity'));

function repoTemporal() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-identity-'));
  spawnSync('git', ['init', '-q'], { cwd: dir, env: entornoAislado() });
  return dir;
}

describe('lib/git-identity', () => {
  test('identidadValida acepta exactamente la identidad requerida', () => {
    assert.equal(identidadValida(IDENTIDAD_REQUERIDA), true);
  });

  test('identidadValida rechaza nombre o email distintos y vacios', () => {
    assert.equal(identidadValida({ name: 'Test User', email: IDENTIDAD_REQUERIDA.email }), false);
    assert.equal(identidadValida({ name: IDENTIDAD_REQUERIDA.name, email: 'x@maquina.local' }), false);
    assert.equal(identidadValida({ name: '', email: '' }), false);
  });

  test('asegurarIdentidad fija nombre y email en un repo sin identidad', () => {
    const dir = repoTemporal();
    asegurarIdentidad(dir, entornoAislado());
    assert.deepEqual(leerIdentidad(dir, entornoAislado()), IDENTIDAD_REQUERIDA);
  });

  test('asegurarIdentidad no pisa una identidad ya configurada', () => {
    const dir = repoTemporal();
    spawnSync('git', ['config', '--local', 'user.name', 'Otra Persona'], { cwd: dir, env: entornoAislado() });
    asegurarIdentidad(dir, entornoAislado());
    const id = leerIdentidad(dir, entornoAislado());
    assert.equal(id.name, 'Otra Persona');
    assert.equal(id.email, IDENTIDAD_REQUERIDA.email);
  });
});
