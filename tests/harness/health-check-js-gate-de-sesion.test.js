'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('health-check.js — gate de sesion', () => {
  const SCRIPT = path.join(BIN, 'health-check.js');

  function flagPath(sessionId) {
    return path.join(os.tmpdir(), `ai-core-hc-${sessionId}.flag`);
  }

  test('primera corrida en una sesion nueva: corre completo y crea el flag', () => {
    const sessionId = `test-${Date.now()}`;
    const flag = flagPath(sessionId);
    fs.rmSync(flag, { force: true });

    const r = runScript(SCRIPT, [], { CLAUDE_CODE_SESSION_ID: sessionId });
    fs.rmSync(flag, { force: true });

    assert.equal(r.status, 0);
    assert.match(r.stderr, /HEALTH-CHECK/, 'primera corrida debe emitir el banner de health-check');
  });

  test('segunda corrida en la misma sesion: sale temprano sin re-verificar', () => {
    const sessionId = `test-${Date.now()}`;
    const flag = flagPath(sessionId);
    fs.rmSync(flag, { force: true });

    runScript(SCRIPT, [], { CLAUDE_CODE_SESSION_ID: sessionId }); // primera corrida real
    const r2 = runScript(SCRIPT, [], { CLAUDE_CODE_SESSION_ID: sessionId }); // segunda, debe saltar
    fs.rmSync(flag, { force: true });

    assert.equal(r2.status, 0);
    assert.equal(r2.stderr, '', 'la segunda corrida no debe emitir ningun banner (gate de sesion activo)');
  });
});

// ─── detect-stack.js ──────────────────────────────────────────────────────────
