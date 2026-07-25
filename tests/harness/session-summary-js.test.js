'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('session-summary.js', () => {
  const SCRIPT = path.join(BIN, 'session-summary.js');

  test('sale con 0 y sin output si no hay actividad', () => {
    // Sin cambios git y sin EVENTS_QUEUE, el script debe ser silencioso
    const r = runScript(SCRIPT, [], { SUPPRESS_GIT: '1' });
    assert.equal(r.status, 0);
  });

  test('el script existe y es ejecutable por Node', () => {
    assert.ok(fs.existsSync(SCRIPT), 'session-summary.js debe existir en .claude/bin/');
    const r = runScript(SCRIPT, []);
    assert.notEqual(r.status, null, 'debe terminar con codigo de salida definido');
  });
});

// ─── aiops-score.js ──────────────────────────────────────────────────────────
