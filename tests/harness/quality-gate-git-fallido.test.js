'use strict';

/**
 * Regresion de la auditoria: si `git ls-files` fallaba, la lista de archivos
 * quedaba vacia y los chequeos del gate pasaban sin evaluar nada.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { REPO } = require('./_shared');

const checks = require(path.join(REPO, 'scripts', 'quality-gate-checks.js'));
const gate = require(path.join(REPO, 'scripts', 'quality-gate.js'));

function noRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-sin-git-'));
  fs.writeFileSync(path.join(dir, 'residuo.orig'), 'x');
  return dir;
}

for (const [nombre, fn] of [
  ['revisarResiduales', checks.revisarResiduales],
  ['revisarSecretos', checks.revisarSecretos],
  ['revisarLimiteDeLineas', gate.revisarLimiteDeLineas],
]) {
  test(`${nombre} falla con un error explicito si git no puede listar los archivos`, () => {
    const dir = noRepo();
    assert.throws(() => fn(dir), /git ls-files/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test('error: en un repositorio valido sigue funcionando y detecta un residual', () => {
  const dir = noRepo();
  const { spawnSync } = require('node:child_process');
  spawnSync('git', ['init', '-q'], { cwd: dir });
  const r = checks.revisarResiduales(dir);
  assert.equal(r.ok, false);
  assert.match(r.detalle, /residuo\.orig/);
  fs.rmSync(dir, { recursive: true, force: true });
});
