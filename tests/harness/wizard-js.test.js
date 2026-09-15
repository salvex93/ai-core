'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { REPO } = require('./_shared');

describe('bin/wizard.js', () => {
  const { leerEnv, escribirEnvVar, leerUltimaVersionChangelog, leerVersionPkg } = require(
    path.join(REPO, '.claude', 'bin', 'wizard.js')
  );
  let dir;

  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-smoke-')); });
  after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('leerEnv: archivo inexistente retorna objeto vacio', () => {
    const r = leerEnv(path.join(dir, 'no-existe.env'));
    assert.deepEqual(r, {});
  });

  test('escribirEnvVar + leerEnv: agrega variable nueva y la relee', () => {
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(envPath, 'GEMINI_API_KEY=abc\n');

    escribirEnvVar('GITHUB_TOKEN', 'ghp_fake', envPath);
    const r = leerEnv(envPath);

    assert.equal(r.GEMINI_API_KEY, 'abc');
    assert.equal(r.GITHUB_TOKEN, 'ghp_fake');
  });

  test('escribirEnvVar: reemplaza el valor existente en vez de duplicar la linea', () => {
    const envPath = path.join(dir, 'reemplazo.env');
    fs.writeFileSync(envPath, 'GITHUB_TOKEN=viejo\n');

    escribirEnvVar('GITHUB_TOKEN', 'nuevo', envPath);
    const contenido = fs.readFileSync(envPath, 'utf8');

    assert.equal((contenido.match(/GITHUB_TOKEN=/g) || []).length, 1);
    assert.match(contenido, /GITHUB_TOKEN=nuevo/);
  });

  test('leerVersionPkg: lee el campo version de un package.json', () => {
    const pkgPath = path.join(dir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ version: '9.9.9' }));

    assert.equal(leerVersionPkg(pkgPath), '9.9.9');
  });

  test('leerUltimaVersionChangelog: extrae la primera version del CHANGELOG', () => {
    const changelogPath = path.join(dir, 'CHANGELOG.md');
    fs.writeFileSync(changelogPath, '# CHANGELOG\n\n## [1.2.3] — 2026-01-01\n\ncontenido\n');

    assert.equal(leerUltimaVersionChangelog(changelogPath), '1.2.3');
  });

  test('leerUltimaVersionChangelog: archivo inexistente retorna null', () => {
    assert.equal(leerUltimaVersionChangelog(path.join(dir, 'no-existe.md')), null);
  });
});
