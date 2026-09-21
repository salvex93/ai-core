'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const { spawnSync } = require('node:child_process');
const { BIN } = require('./_shared');

const {
  IDENTIDAD_REQUERIDA, identidadValida, leerIdentidad, asegurarIdentidad,
} = require(path.join(BIN, 'lib', 'git-identity'));

// Sin GIT_* heredado (operaria sobre el repo real) y sin config global/sistema
// (la identidad del equipo que corre el test no debe influir en el resultado).
function entornoAislado() {
  const limpio = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  return { ...limpio, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' };
}

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
