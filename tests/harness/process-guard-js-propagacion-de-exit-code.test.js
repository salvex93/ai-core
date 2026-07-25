'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('process-guard.js — propagacion de exit code', () => {
  const SCRIPT = path.join(BIN, 'process-guard.js');

  test('propaga exit code distinto de 0 del comando envuelto', () => {
    const r = runScript(SCRIPT, ['lint', 'node', '-e', 'process.exit(2)']);
    assert.equal(r.status, 2, 'process-guard.js debe propagar el exit code real del comando');
  });

  test('propaga exit 0 cuando el comando envuelto termina normalmente', () => {
    const r = runScript(SCRIPT, ['lint', 'node', '-e', 'process.exit(0)']);
    assert.equal(r.status, 0);
  });
});

// ─── security-check.js ───────────────────────────────────────────────────────
