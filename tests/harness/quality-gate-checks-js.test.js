'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REPO } = require('./_shared');

const { revisarResiduales, revisarSecretos } = require(path.join(REPO, 'scripts', 'quality-gate-checks.js'));

// Se arma en runtime para que el propio archivo de test no contenga un patron literal.
const CLAVE_GITHUB = `ghp_${'A'.repeat(36)}`;

function git(cwd, ...args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  return spawnSync('git', args, { cwd, env, encoding: 'utf8' });
}

function escribir(dir, ruta, contenido) {
  const destino = path.join(dir, ruta);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, contenido);
}

describe('quality-gate-checks.js', () => {
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-checks-'));
    git(dir, 'init', '-q');
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  describe('revisarResiduales', () => {
    test('repo sin residuales cumple', () => {
      escribir(dir, 'src/a.js', 'x');
      assert.equal(revisarResiduales(dir).ok, true);
    });

    test('detecta .new, .orig y .rej aunque no esten trackeados', () => {
      for (const f of ['a.js.new', 'b.js.orig', 'c.js.rej']) escribir(dir, f, 'x');
      const r = revisarResiduales(dir);
      assert.equal(r.ok, false);
      assert.match(r.detalle, /a\.js\.new/);
      assert.match(r.detalle, /b\.js\.orig/);
      assert.match(r.detalle, /c\.js\.rej/);
      for (const f of ['a.js.new', 'b.js.orig', 'c.js.rej']) fs.rmSync(path.join(dir, f));
    });

    test('un archivo ignorado por git no cuenta', () => {
      escribir(dir, '.gitignore', '*.new\n');
      escribir(dir, 'ignorado.new', 'x');
      assert.equal(revisarResiduales(dir).ok, true);
    });
  });

  describe('revisarSecretos', () => {
    test('working tree sin credenciales cumple', () => {
      assert.equal(revisarSecretos(dir).ok, true);
    });

    test('detecta una credencial de alta confianza en un archivo del proyecto', () => {
      escribir(dir, 'config/app.js', `const t = '${CLAVE_GITHUB}';\n`);
      const r = revisarSecretos(dir);
      assert.equal(r.ok, false);
      assert.match(r.detalle, /GitHub Personal Access Token: config\/app\.js/);
    });

    test('las credenciales falsas bajo tests/ estan exentas', () => {
      fs.rmSync(path.join(dir, 'config'), { recursive: true });
      escribir(dir, 'tests/fixture.test.js', `const t = '${CLAVE_GITHUB}';\n`);
      assert.equal(revisarSecretos(dir).ok, true);
    });

    test('un binario no se escanea', () => {
      fs.writeFileSync(path.join(dir, 'img.bin'), Buffer.concat([Buffer.from([0]), Buffer.from(CLAVE_GITHUB)]));
      assert.equal(revisarSecretos(dir).ok, true);
    });
  });
});
