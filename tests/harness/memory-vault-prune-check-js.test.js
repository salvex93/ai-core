'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('memory-vault-prune-check.js', () => {
  const GUARD    = path.join(BIN, 'memory-vault-prune-check.js');
  const TEST_DIR = path.join(REPO, '.claude', 'memory-vault', '.raw', 'architect');
  const PREFIJO  = 'test-prune-';

  function limpiarPruebas() {
    if (!fs.existsSync(TEST_DIR)) return;
    for (const f of fs.readdirSync(TEST_DIR)) {
      if (f.startsWith(PREFIJO)) fs.unlinkSync(path.join(TEST_DIR, f));
    }
  }

  before(limpiarPruebas);
  after(limpiarPruebas);

  test('sin aviso cuando el vault esta bajo el umbral', () => {
    limpiarPruebas();
    const r = runScript(GUARD, []);
    assert.equal(r.status, 0);
    assert.ok(!r.stdout.includes('MEMORY-VAULT'), 'no debe avisar si no se supero el umbral de 50');
  });

  test('avisa (sin bloquear) cuando .raw/ supera 50 archivos', () => {
    limpiarPruebas();
    fs.mkdirSync(TEST_DIR, { recursive: true });
    for (let i = 0; i < 55; i++) {
      fs.writeFileSync(path.join(TEST_DIR, `${PREFIJO}${i}.md`), '# test');
    }
    const r = runScript(GUARD, []);
    limpiarPruebas();
    assert.equal(r.status, 0, 'nunca debe bloquear — solo es un aviso');
    assert.ok(r.stdout.includes('MEMORY-VAULT'), 'debe avisar al superar el umbral');
    assert.ok(r.stdout.includes('archive'), 'debe mencionar la politica de archivar, no eliminar');
  });
});

// ─── issue-reporter.js ───────────────────────────────────────────────────────
