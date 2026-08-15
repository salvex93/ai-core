'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN } = require('./_shared');

describe('subagent-guard-release.js', () => {
  const SCRIPT = path.join(BIN, 'subagent-guard-release.js');

  function correr(evento, lockDir) {
    return spawnSync('node', [SCRIPT], {
      encoding: 'utf8',
      cwd: REPO,
      input: JSON.stringify(evento),
      env: { ...process.env, AI_CORE_SUBAGENT_LOCK_DIR: lockDir },
    });
  }

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('sin session_id/prompt_id: exit 0 sin tocar ningun lock', () => {
    const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-release-test-'));
    try {
      const r = correr({ hook_event_name: 'SubagentStop' }, lockDir);
      assert.equal(r.status, 0);
    } finally {
      fs.rmSync(lockDir, { recursive: true, force: true });
    }
  });

  test('libera exactamente el lock propio por session_id+prompt_id', () => {
    const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-release-test-'));
    try {
      const lockPropio = path.join(lockDir, 'sessionA__promptA.lock');
      fs.writeFileSync(lockPropio, JSON.stringify({ pid: process.pid, ts: Date.now() }));

      const r = correr({ session_id: 'sessionA', prompt_id: 'promptA', hook_event_name: 'SubagentStop' }, lockDir);
      assert.equal(r.status, 0);
      assert.equal(fs.existsSync(lockPropio), false, 'debe borrar el lock que coincide exactamente con su propia clave');
    } finally {
      fs.rmSync(lockDir, { recursive: true, force: true });
    }
  });

  // ─── Fix red-team 2026-08-15: path traversal en session_id/prompt_id ───────

  test('session_id con path traversal ("../") NO borra un archivo fuera de LOCK_DIR', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-release-test-'));
    const lockDir = path.join(base, 'locks');
    fs.mkdirSync(lockDir, { recursive: true });
    const victimaDir = path.join(base, 'victima-fuera-de-lockdir');
    fs.mkdirSync(victimaDir, { recursive: true });
    const archivoVictima = path.join(victimaDir, 'importante__x.lock');
    fs.writeFileSync(archivoVictima, 'contenido que no debe borrarse');

    try {
      const r = correr({
        session_id: '../victima-fuera-de-lockdir/importante',
        prompt_id: 'x',
        hook_event_name: 'SubagentStop',
      }, lockDir);
      assert.equal(r.status, 0, 'el guard nunca debe fallar el hook, solo abstenerse de borrar');
      assert.equal(fs.existsSync(archivoVictima), true, 'el archivo fuera de LOCK_DIR debe sobrevivir -- path traversal bloqueado');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('prompt_id con path traversal ("../") NO borra un archivo fuera de LOCK_DIR', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-release-test-'));
    const lockDir = path.join(base, 'locks');
    fs.mkdirSync(lockDir, { recursive: true });
    const archivoVictima = path.join(base, 'importante__x.lock');
    fs.writeFileSync(archivoVictima, 'contenido que no debe borrarse');

    try {
      const r = correr({
        session_id: '..',
        prompt_id: '/importante__x',
        hook_event_name: 'SubagentStop',
      }, lockDir);
      assert.equal(r.status, 0);
      assert.equal(fs.existsSync(archivoVictima), true, 'el archivo fuera de LOCK_DIR debe sobrevivir -- path traversal bloqueado');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('un lock legitimo dentro de LOCK_DIR se sigue borrando normalmente tras el fix de traversal', () => {
    const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-release-test-'));
    try {
      const lockPropio = path.join(lockDir, 'sessionZ__promptZ.lock');
      fs.writeFileSync(lockPropio, JSON.stringify({ pid: process.pid, ts: Date.now() }));

      const r = correr({ session_id: 'sessionZ', prompt_id: 'promptZ', hook_event_name: 'SubagentStop' }, lockDir);
      assert.equal(r.status, 0);
      assert.equal(fs.existsSync(lockPropio), false, 'el fix de traversal no debe romper el caso legitimo sin \'..\'');
    } finally {
      fs.rmSync(lockDir, { recursive: true, force: true });
    }
  });
});
