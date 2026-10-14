'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const { spawnSync } = require('node:child_process');
const { BIN, REPO, entornoGitAislado: entornoAislado } = require('./_shared');

const SCRIPT = path.join(BIN, 'check-commit.js');

function correr(args, cwd = os.tmpdir()) {
  return spawnSync('node', [SCRIPT, ...args], { cwd, env: entornoAislado(), encoding: 'utf8' });
}

function mensajeEnArchivo(texto) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'check-commit-')), 'COMMIT_EDITMSG');
  fs.writeFileSync(f, texto, 'utf8');
  return f;
}

function repoConIdentidad(name, email) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-commit-repo-'));
  const git = (...a) => spawnSync('git', a, { cwd: dir, env: entornoAislado() });
  git('init', '-q');
  if (name) git('config', '--local', 'user.name', name);
  if (email) git('config', '--local', 'user.email', email);
  return dir;
}

describe('check-commit.js mensaje', () => {
  test('mensaje limpio: exit 0', () => {
    assert.equal(correr(['mensaje', mensajeEnArchivo('fix(x): corregir borde\n')]).status, 0);
  });

  test('trailer Co-Authored-By: exit 1 con motivo en stderr', () => {
    const r = correr(['mensaje', mensajeEnArchivo('fix: x\n\nCo-Authored-By: Alguien <a@b.com>\n')]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Co-Authored-By|autoria/i);
  });

  test('las lineas de comentario de git no se evaluan', () => {
    const r = correr(['mensaje', mensajeEnArchivo('fix: x\n# Generated with Claude en un comentario\n')]);
    assert.equal(r.status, 0);
  });

  test('archivo inexistente: exit 1 (no deja pasar por omision)', () => {
    assert.equal(correr(['mensaje', path.join(os.tmpdir(), 'no-existe-zzz')]).status, 1);
  });
});

describe('check-commit.js identidad', () => {
  test('identidad requerida: exit 0', () => {
    const dir = repoConIdentidad('Andrew Arizmendi', 'salvex93@gmail.com');
    assert.equal(correr(['identidad'], dir).status, 0);
  });

  test('identidad distinta: exit 1 indicando como corregirla', () => {
    const dir = repoConIdentidad('Test User', 'test@example.com');
    const r = correr(['identidad'], dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /git config user\.name/);
  });

  test('sin identidad: exit 1', () => {
    assert.equal(correr(['identidad'], repoConIdentidad()).status, 1);
  });
});

describe('check-commit.js uso', () => {
  test('modo desconocido: exit 1', () => {
    assert.equal(correr(['zzz']).status, 1);
  });
});

describe('hooks git versionados', () => {
  for (const [hook, modo] of [['commit-msg', 'mensaje'], ['pre-commit', 'identidad']]) {
    test(`.githooks/${hook} es ejecutable e invoca check-commit.js ${modo}`, () => {
      const ruta = path.join(REPO, '.githooks', hook);
      // El modo del indice es portable; fs.stat en NTFS no expone el bit de ejecucion.
      const indice = spawnSync('git', ['ls-files', '--stage', '--', `.githooks/${hook}`], { cwd: REPO, encoding: 'utf8' });
      assert.match(indice.stdout, /^100755 /, 'debe estar versionado con bit de ejecucion (100755)');
      assert.match(fs.readFileSync(ruta, 'utf8'), new RegExp(`check-commit\\.js" ${modo}`));
    });
  }
});
