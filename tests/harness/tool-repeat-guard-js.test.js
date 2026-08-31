'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN } = require('./_shared');

describe('tool-repeat-guard.js', () => {
  const GUARD = path.join(BIN, 'tool-repeat-guard.js');
  const STATE_DIR = path.join(os.tmpdir(), `ai-core-locks-test-tool-repeat-${process.pid}`);
  const STATE_ENV = { AI_CORE_TOOL_REPEAT_DIR: STATE_DIR };

  function limpiarEstado() {
    fs.rmSync(STATE_DIR, { recursive: true, force: true });
  }

  before(limpiarEstado);
  after(limpiarEstado);

  function correr(evento) {
    return spawnSync('node', [GUARD], {
      encoding: 'utf8',
      cwd: REPO,
      input: JSON.stringify(evento),
      env: { ...process.env, AI_CORE_TEST_MODE: '1', ...STATE_ENV },
    });
  }

  test('permite una tool call sin historial previo (caso normal)', () => {
    limpiarEstado();
    const r = correr({ session_id: 's1', tool_name: 'Bash', tool_input: { command: 'ls' } });
    assert.equal(r.status, 0, 'primera invocacion nunca bloquea');
  });

  test('permite reintentos hasta el umbral, bloquea (codigo 2) al superarlo', () => {
    limpiarEstado();
    const evento = { session_id: 's2', tool_name: 'Edit', tool_input: { file_path: 'x.js', old_string: 'a', new_string: 'b' } };
    for (let i = 0; i < 3; i++) {
      const r = correr(evento);
      assert.equal(r.status, 0, `intento ${i + 1}/3 identico no deberia bloquear aun`);
    }
    const r4 = correr(evento);
    assert.equal(r4.status, 2, 'el 4to intento identico debe bloquear como loop');
    assert.ok(r4.stderr.includes('TOOL-REPEAT-GUARD'), 'debe incluir [TOOL-REPEAT-GUARD] en stderr');
  });

  test('no bloquea si los argumentos cambian entre intentos (reintento legitimo tras fix)', () => {
    limpiarEstado();
    const base = { session_id: 's3', tool_name: 'Edit' };
    for (let i = 0; i < 5; i++) {
      const r = correr({ ...base, tool_input: { file_path: 'x.js', old_string: `intento-${i}`, new_string: 'b' } });
      assert.equal(r.status, 0, `intento ${i + 1} con argumentos distintos nunca deberia bloquear`);
    }
  });

  test('cuenta por separado sesiones distintas (no cruza estado entre sesiones)', () => {
    limpiarEstado();
    const evento1 = { session_id: 'sesion-A', tool_name: 'Bash', tool_input: { command: 'npm test' } };
    const evento2 = { session_id: 'sesion-B', tool_name: 'Bash', tool_input: { command: 'npm test' } };
    for (let i = 0; i < 3; i++) {
      assert.equal(correr(evento1).status, 0);
    }
    // la sesion B arranca en 0 pese a ser la misma tool+argumentos que A
    const r = correr(evento2);
    assert.equal(r.status, 0, 'sesiones distintas no comparten contador de repeticion');
  });

  test('cuenta por separado agent_type distinto en la misma sesion (subagente vs hilo principal)', () => {
    limpiarEstado();
    const base = { session_id: 's4', tool_name: 'Bash', tool_input: { command: 'git status' } };
    for (let i = 0; i < 3; i++) {
      assert.equal(correr({ ...base, agent_type: 'security-scanner' }).status, 0);
    }
    const rPrincipal = correr(base); // sin agent_type = hilo principal ("main")
    assert.equal(rPrincipal.status, 0, 'el hilo principal no hereda el contador de un subagente distinto');
  });

  test('excluye Read/Grep/Glob del conteo (releer o rebuscar no es loop peligroso)', () => {
    limpiarEstado();
    const evento = { session_id: 's5', tool_name: 'Read', tool_input: { file_path: 'x.js' } };
    for (let i = 0; i < 10; i++) {
      const r = correr(evento);
      assert.equal(r.status, 0, `Read identico repetido ${i + 1} veces nunca deberia bloquear`);
    }
  });

  test('sin tool_name en el evento, sale con codigo 0 sin fallar', () => {
    limpiarEstado();
    const r = correr({ session_id: 's6' });
    assert.equal(r.status, 0);
  });
});
