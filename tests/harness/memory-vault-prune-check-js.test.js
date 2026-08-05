'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('memory-vault-prune-check.js', () => {
  const GUARD     = path.join(BIN, 'memory-vault-prune-check.js');
  // Vault temporal aislado -- AI_CORE_MEMORY_VAULT_PATH evita escribir sobre
  // .claude/memory-vault/ real del proyecto (ver memory-index.js, mismo patron).
  const TEST_VAULT = path.join(os.tmpdir(), `ai-core-vault-prune-test-${process.pid}`);
  const TEST_DIR   = path.join(TEST_VAULT, '.raw', 'architect');
  const ENV        = { AI_CORE_MEMORY_VAULT_PATH: TEST_VAULT };

  function limpiarPruebas() {
    fs.rmSync(TEST_VAULT, { recursive: true, force: true });
  }

  before(limpiarPruebas);
  after(limpiarPruebas);

  test('sin aviso cuando el vault esta bajo el umbral', () => {
    limpiarPruebas();
    const r = runScript(GUARD, [], ENV);
    assert.equal(r.status, 0);
    assert.ok(!r.stdout.includes('MEMORY-VAULT'), 'no debe avisar si no se supero el umbral de 50');
  });

  test('avisa (sin bloquear) cuando .raw/ supera 50 archivos', () => {
    limpiarPruebas();
    fs.mkdirSync(TEST_DIR, { recursive: true });
    for (let i = 0; i < 55; i++) {
      fs.writeFileSync(path.join(TEST_DIR, `test-prune-${i}.md`), '# test');
    }
    const r = runScript(GUARD, [], ENV);
    limpiarPruebas();
    assert.equal(r.status, 0, 'nunca debe bloquear — solo es un aviso');
    assert.ok(r.stdout.includes('MEMORY-VAULT'), 'debe avisar al superar el umbral');
    assert.ok(r.stdout.includes('archive'), 'debe mencionar la politica de archivar, no eliminar');
  });
});

// ─── issue-reporter.js ───────────────────────────────────────────────────────
