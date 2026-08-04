'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('subagent-guard.js', () => {
  const GUARD    = path.join(BIN, 'subagent-guard.js');
  // Directorio de locks propio por proceso de test -- el directorio real
  // (sin este override) es compartido a nivel de sistema operativo con
  // cualquier uso real y concurrente del Agent tool durante la sesion que
  // corre los tests, lo que hacia que el conteo de MAX_PARALLEL fuera no
  // determinista (locks ajenos entrando/saliendo de la ventana de 2 min).
  const LOCK_DIR = path.join(os.tmpdir(), `ai-core-locks-test-${process.pid}`, 'subagents');
  const LOCK_ENV = { AI_CORE_SUBAGENT_LOCK_DIR: LOCK_DIR };

  function limpiarLocks() {
    fs.rmSync(LOCK_DIR, { recursive: true, force: true });
  }

  before(limpiarLocks);
  after(limpiarLocks);

  test('sale con codigo 0 sin variables de entorno (caso normal)', () => {
    limpiarLocks();
    const r = runScript(GUARD, [], LOCK_ENV);
    assert.equal(r.status, 0, 'debe permitir el spawn cuando no hay contexto de recursion ni limite excedido');
  });

  test('bloquea (codigo 2) cuando el subagente actual intenta lanzar otro de su mismo tipo', () => {
    limpiarLocks();
    const r = runScript(GUARD, [], {
      CLAUDE_SUBAGENT_TYPE: 'general-purpose',
      CLAUDE_TOOL_INPUT_subagent_type: 'general-purpose',
      ...LOCK_ENV,
    });
    assert.equal(r.status, 2, 'debe bloquear recursion del mismo tipo de subagente');
    assert.ok(r.stderr.includes('SUBAGENT-GUARD'), 'debe incluir [SUBAGENT-GUARD] en stderr');
  });

  test('permite tipos distintos entre padre e hijo', () => {
    limpiarLocks();
    const r = runScript(GUARD, [], {
      CLAUDE_SUBAGENT_TYPE: 'Explore',
      CLAUDE_TOOL_INPUT_subagent_type: 'general-purpose',
      ...LOCK_ENV,
    });
    assert.equal(r.status, 0, 'no debe bloquear si el tipo del padre difiere del tipo a lanzar');
  });

  test('bloquea (codigo 2) al superar MAX_PARALLEL subagentes en la ventana de tiempo', () => {
    limpiarLocks();
    for (let i = 0; i < 3; i++) {
      const r = runScript(GUARD, [], { CLAUDE_TOOL_INPUT_subagent_type: 'Explore', ...LOCK_ENV });
      assert.equal(r.status, 0, `lanzamiento ${i + 1}/3 no deberia bloquear`);
    }
    const r4 = runScript(GUARD, [], { CLAUDE_TOOL_INPUT_subagent_type: 'Explore', ...LOCK_ENV });
    assert.equal(r4.status, 2, 'el 4to lanzamiento concurrente debe bloquear');
    assert.ok(r4.stderr.includes('SUBAGENT-GUARD'), 'debe incluir [SUBAGENT-GUARD] en stderr');
  });

  test('sin env vars, lee agent_type y tool_input.subagent_type del JSON de stdin', () => {
    // Regresion real: CLAUDE_TOOL_INPUT_subagent_type/CLAUDE_SUBAGENT_TYPE
    // nunca existieron como variables de entorno reales -- el guard antiloop
    // documentado en CLAUDE.md como "enforcement real" nunca veia el tipo
    // real de subagente en produccion.
    limpiarLocks();
    const evento = JSON.stringify({ agent_type: 'general-purpose', tool_input: { subagent_type: 'general-purpose' } });
    const r = spawnSync('node', [GUARD], {
      encoding: 'utf8', cwd: REPO, input: evento,
      env: { ...process.env, AI_CORE_TEST_MODE: '1', ...LOCK_ENV },
    });
    assert.equal(r.status, 2, 'debe bloquear recursion leyendo el tipo real desde stdin');
    assert.ok(r.stderr.includes('SUBAGENT-GUARD'));
  });
});

// ─── bash-verbosity-guard.js ─────────────────────────────────────────────────
