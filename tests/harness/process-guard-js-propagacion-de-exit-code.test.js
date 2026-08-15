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

  // ─── Fix red-team 2026-08-15: lock con PID no-Node no cuenta como vivo ──────

  test('un lock cuyo PID no corresponde a un proceso Node real se trata como obsoleto (no bloquea una segunda instancia)', () => {
    const LOCK_DIR = path.join(os.tmpdir(), 'ai-core-locks');
    fs.mkdirSync(LOCK_DIR, { recursive: true });
    const lockPath = path.join(LOCK_DIR, 'lint.lock');

    // PID que casi seguro no existe en el sistema (rango muy alto) -- simula
    // el escenario del red-team: un lock desincronizado del proceso real que
    // efectivamente ejecuta el comando de esa categoria.
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, ts: Date.now() }), 'utf8');
    try {
      const r = runScript(SCRIPT, ['lint', 'node', '-e', 'process.exit(0)']);
      assert.equal(r.status, 0, 'debe adquirir el lock y ejecutar el comando -- el lock con PID inexistente/no-Node no debe bloquear');
      assert.equal(fs.existsSync(lockPath), false, 'el lock debe quedar liberado tras la ejecucion');
    } finally {
      try { fs.unlinkSync(lockPath); } catch {}
    }
  });

  test('un lock con PID de un proceso Node real vivo SI bloquea una segunda instancia de la misma categoria', () => {
    const LOCK_DIR = path.join(os.tmpdir(), 'ai-core-locks');
    fs.mkdirSync(LOCK_DIR, { recursive: true });
    const lockPath = path.join(LOCK_DIR, 'lint.lock');

    // process.pid del propio test runner: proceso Node real y vivo durante la prueba.
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() }), 'utf8');
    try {
      const r = runScript(SCRIPT, ['lint', 'node', '-e', 'process.exit(0)']);
      assert.equal(r.status, 1, 'lock activo con PID Node real y vivo debe bloquear (categoria de bloqueo -> exit 1)');
    } finally {
      try { fs.unlinkSync(lockPath); } catch {}
    }
  });

  // ─── Fix real de CI 2026-08-15: macOS/Darwin no tiene /proc ─────────────────
  // Bug reproducido en el runner macos-latest de GitHub Actions: /proc no
  // existe en macOS/BSD (exclusivo de Linux) -- pidEsProcesoNode() asumia lo
  // contrario, caia siempre al catch en macOS y trataba CUALQUIER proceso
  // Node real y vivo como "no confiable", marcando el lock como stale y
  // dejando pasar una segunda instancia bajo carga real. Este test usa un
  // proceso Node de larga duracion real (no el propio test runner, para que
  // el PID siga vivo durante toda la asercion) y confirma el bloqueo en
  // CUALQUIER plataforma (Linux via /proc, macOS via "ps", Windows via
  // tasklist), no solo en el runner de CI donde se detecto originalmente.
  test('un proceso Node de larga duracion (no el test runner) con lock real SI bloquea, en cualquier plataforma (Linux/macOS/Windows)', () => {
    const LOCK_DIR = path.join(os.tmpdir(), 'ai-core-locks');
    fs.mkdirSync(LOCK_DIR, { recursive: true });
    const lockPath = path.join(LOCK_DIR, 'lint.lock');

    const child = require('node:child_process').spawn('node', ['-e', 'setTimeout(() => {}, 3000)']);
    try {
      fs.writeFileSync(lockPath, JSON.stringify({ pid: child.pid, ts: Date.now() }), 'utf8');
      const r = runScript(SCRIPT, ['lint', 'node', '-e', 'process.exit(0)']);
      assert.equal(r.status, 1, 'lock con PID de un proceso Node real y vivo (distinto del test runner) debe bloquear en toda plataforma');
    } finally {
      try { child.kill(); } catch {}
      try { fs.unlinkSync(lockPath); } catch {}
    }
  });
});

// ─── security-check.js ───────────────────────────────────────────────────────
