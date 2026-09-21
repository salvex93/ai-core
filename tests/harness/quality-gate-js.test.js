'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO } = require('./_shared');

const SCRIPT = path.join(REPO, 'scripts', 'quality-gate.js');
const { soloBorraRamas, revisarLimiteDeLineas, definirChecks, entornoSinGit } = require(SCRIPT);

const CEROS = '0'.repeat(40);
const SHA = 'a'.repeat(40);

function lineas(n) {
  return `${'x;\n'.repeat(n)}`;
}

describe('quality-gate.js', () => {
  describe('soloBorraRamas', () => {
    test('push que solo borra refs no se valida', () => {
      assert.equal(soloBorraRamas(`(delete) ${CEROS} refs/heads/x ${SHA}\n`), true);
    });

    test('push que publica commits si se valida', () => {
      assert.equal(soloBorraRamas(`refs/heads/main ${SHA} refs/heads/main ${SHA}\n`), false);
    });

    test('mezcla de borrado y publicacion se valida', () => {
      const entrada = `(delete) ${CEROS} refs/heads/x ${SHA}\nrefs/heads/main ${SHA} refs/heads/main ${SHA}\n`;
      assert.equal(soloBorraRamas(entrada), false);
    });

    test('stdin vacio no cuenta como borrado', () => {
      assert.equal(soloBorraRamas(''), false);
    });
  });

  describe('revisarLimiteDeLineas', () => {
    let repo;
    before(() => {
      repo = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-gate-'));
      spawnSync('git', ['init', '-q'], { cwd: repo });
    });
    after(() => fs.rmSync(repo, { recursive: true, force: true }));

    test('archivo de exactamente 300 lineas cumple', () => {
      fs.writeFileSync(path.join(repo, 'limite.js'), lineas(300));
      assert.equal(revisarLimiteDeLineas(repo).ok, true);
    });

    test('archivo de 301 lineas falla y se nombra en el detalle', () => {
      fs.writeFileSync(path.join(repo, 'largo.js'), lineas(301));
      const r = revisarLimiteDeLineas(repo);
      assert.equal(r.ok, false);
      assert.match(r.detalle, /301 lineas: largo\.js/);
    });

    test('documentacion .md no cuenta para el limite', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-gate-md-'));
      spawnSync('git', ['init', '-q'], { cwd: dir });
      fs.writeFileSync(path.join(dir, 'guia.md'), lineas(900));
      assert.equal(revisarLimiteDeLineas(dir).ok, true);
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('definirChecks', () => {
    test('modo rapido omite la suite de tests', () => {
      assert.ok(!definirChecks(true).some((c) => c.nombre === 'suite de tests'));
    });

    test('incluye los checks de residuales y secretos incluso en modo rapido', () => {
      const nombres = definirChecks(true).map((c) => c.nombre);
      assert.ok(nombres.includes('archivos residuales'));
      assert.ok(nombres.includes('credenciales en el working tree'));
    });

    test('modo completo incluye la suite de tests como ultimo check', () => {
      const checks = definirChecks(false);
      assert.equal(checks[checks.length - 1].nombre, 'suite de tests');
    });
  });

  describe('integracion con git', () => {
    test('el hook pre-push versionado existe, es ejecutable y delega en quality-gate.js', () => {
      const hook = path.join(REPO, '.githooks', 'pre-push');
      assert.ok(fs.existsSync(hook));
      if (process.platform !== 'win32') assert.ok(fs.statSync(hook).mode & 0o111, 'debe ser ejecutable');
      assert.match(fs.readFileSync(hook, 'utf8'), /scripts\/quality-gate\.js" --pre-push/);
    });

    test('--pre-push con stdin de solo borrado sale 0 sin correr verificaciones', () => {
      const r = spawnSync(process.execPath, [SCRIPT, '--pre-push'], {
        input: `(delete) ${CEROS} refs/heads/x ${SHA}\n`,
        encoding: 'utf8',
      });
      assert.equal(r.status, 0);
      assert.doesNotMatch(r.stderr, /\[quality-gate\]/);
    });
  });

  describe('entornoSinGit (aislamiento del hook git)', () => {
    test('elimina las variables GIT_* que git inyecta al hook', () => {
      const env = entornoSinGit({ GIT_DIR: '/x/.git', GIT_INDEX_FILE: 'i', GIT_PREFIX: '', PATH: '/bin', HOME: '/h' });
      assert.deepEqual(Object.keys(env).sort(), ['HOME', 'PATH']);
    });

    test('no muta el entorno de origen', () => {
      const origen = { GIT_DIR: '/x/.git', PATH: '/bin' };
      entornoSinGit(origen);
      assert.equal(origen.GIT_DIR, '/x/.git');
    });
  });
});
