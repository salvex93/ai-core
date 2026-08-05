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

  test('categoria de bloqueo (lint) no devuelve exit 0 al descartarse por carga alta', () => {
    const LOCK_DIR = path.join(os.tmpdir(), 'ai-core-locks');
    fs.mkdirSync(LOCK_DIR, { recursive: true });
    const locksCreados = [];
    try {
      for (const nombre of ['fake1', 'fake2', 'fake3', 'fake4']) {
        const lockPath = path.join(LOCK_DIR, `${nombre}.lock`);
        fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() }), 'utf8');
        locksCreados.push(lockPath);
      }

      const r = runScript(SCRIPT, ['lint', 'node', '-e', 'process.exit(0)']);
      assert.notEqual(r.status, 0, 'una categoria de bloqueo descartada por carga no debe reportar exito (0)');
    } finally {
      for (const lockPath of locksCreados) { try { fs.unlinkSync(lockPath); } catch {} }
    }
  });

  test('categorias no criticas (health, map, capture, intent, moa) si devuelven exit 0 al descartarse por carga alta', () => {
    const LOCK_DIR = path.join(os.tmpdir(), 'ai-core-locks');
    fs.mkdirSync(LOCK_DIR, { recursive: true });
    const locksCreados = [];
    try {
      for (const nombre of ['fake1', 'fake2', 'fake3', 'fake4']) {
        const lockPath = path.join(LOCK_DIR, `${nombre}.lock`);
        fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() }), 'utf8');
        locksCreados.push(lockPath);
      }

      const r = runScript(SCRIPT, ['health', 'node', '-e', 'process.exit(0)']);
      assert.equal(r.status, 0, 'una categoria no critica descartada por carga debe seguir degradando en silencio (exit 0)');
    } finally {
      for (const lockPath of locksCreados) { try { fs.unlinkSync(lockPath); } catch {} }
    }
  });
});

// ─── security-check.js ───────────────────────────────────────────────────────
