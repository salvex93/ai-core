'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('health-sync.js — checkDependencies', () => {
  const { checkDependencies } = require(path.join(BIN, 'health-sync.js'));

  test('el repo real: todas las dependencias instaladas', () => {
    const r = checkDependencies(REPO);
    assert.equal(r.ok, true);
    assert.equal(r.missing.length, 0);
    assert.ok(r.installed.length > 0);
  });
});

// ─── mcp-integrity-check.js (ASI04 — supply-chain de servidores MCP propios) ─

// ─── subagent-task-store.js — correlacion PreToolUse/SubagentStop ────────────
