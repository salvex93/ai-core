'use strict';

/**
 * Regresion de la auditoria: el gate TDD solo reconocia *.test.js y *.spec.js,
 * asi que un proyecto TypeScript o Python quedaba bloqueado aunque hubiera
 * escrito su prueba, y un test dentro de un directorio nuevo sin trackear
 * (git lo muestra colapsado como "?? tests/") tampoco contaba.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { BIN } = require('./_shared');

const GUARD = path.join(BIN, 'pre-commit-tdd.js');
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

// Repo con un commit base que contiene src/base.<ext>, referenciado para que el objetivo cuente como produccion
function repoBase(ext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-ext-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 'T');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', `base${ext}`), 'x = 1\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'base');
  return dir;
}

function gate(dir, objetivo) {
  fs.writeFileSync(objetivo, 'y = 2\n');
  return spawnSync('node', [GUARD, objetivo], { cwd: dir, encoding: 'utf8', env: { ...process.env, AI_CORE_TEST_MODE: '1' } });
}

describe('pre-commit-tdd.js: reconoce las pruebas de otros lenguajes', () => {
  for (const [ext, prueba] of [
    ['.ts', 'src/servicio.test.ts'],
    ['.ts', 'src/servicio.spec.ts'],
    ['.tsx', 'src/Vista.test.tsx'],
    ['.js', 'src/servicio.test.mjs'],
    ['.py', 'src/test_servicio.py'],
    ['.py', 'src/servicio_test.py'],
  ]) {
    test(`permite una fuente ${ext} cuando la sesion toco ${prueba}`, () => {
      const dir = repoBase(ext);
      fs.writeFileSync(path.join(dir, prueba), 'prueba\n');
      const r = gate(dir, path.join(dir, 'src', `servicio${ext}`));
      fs.rmSync(dir, { recursive: true, force: true });
      assert.equal(r.status, 0, r.stderr);
    });
  }

  test('una prueba dentro de un directorio nuevo sin trackear cuenta como prueba tocada', () => {
    const dir = repoBase('.ts');
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.writeFileSync(path.join(dir, 'tests', 'servicio.test.ts'), 'prueba\n');
    const r = gate(dir, path.join(dir, 'src', 'servicio.ts'));
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(r.status, 0, r.stderr);
  });

  test('escribir un archivo de prueba .test.ts no se bloquea', () => {
    const dir = repoBase('.ts');
    const r = gate(dir, path.join(dir, 'src', 'nuevo.test.ts'));
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(r.status, 0, r.stderr);
  });

  for (const ext of ['.ts', '.py', '.js']) {
    test(`error: una fuente ${ext} sin ninguna prueba tocada sigue bloqueada`, () => {
      const dir = repoBase(ext);
      const r = gate(dir, path.join(dir, 'src', `servicio${ext}`));
      fs.rmSync(dir, { recursive: true, force: true });
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /TDD-GATE/);
    });
  }

  test('error: un archivo que solo contiene "test" en medio del nombre no cuenta como prueba', () => {
    const dir = repoBase('.ts');
    fs.writeFileSync(path.join(dir, 'src', 'contest.ts'), 'x\n');
    const r = gate(dir, path.join(dir, 'src', 'servicio.ts'));
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(r.status, 2, r.stderr);
  });
});
