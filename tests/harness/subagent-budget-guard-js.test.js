'use strict';

/**
 * subagent-budget-guard.js — Capa 1 de defensa contra runaway de subagentes
 * (investigacion 2026-09-02, post-mortem real vectara/awesome-agent-failures:
 * pipeline de 4 agentes en loop 264 horas, $47k gastados, solo detectado por
 * dashboard de billing). Recomendacion explicita del propio post-mortem:
 * "Per-agent and per-pipeline budget caps are non-negotiable" -- techo de
 * llamadas ANTES de iniciar, no reactivo a facturacion.
 *
 * Complementa tool-repeat-guard.js (misma tool+argumentos identicos) y
 * subagent-guard.js (paralelismo/recursion de spawn): esta es la red de
 * seguridad final, independiente de semantica -- si TODO lo demas falla,
 * un subagente nunca supera 40 llamadas a tools sin que el humano lo sepa.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN } = require('./_shared');

describe('subagent-budget-guard.js', () => {
  const GUARD = path.join(BIN, 'subagent-budget-guard.js');
  const STATE_DIR = path.join(os.tmpdir(), `ai-core-locks-test-budget-${process.pid}`);
  const STATE_ENV = { AI_CORE_BUDGET_DIR: STATE_DIR };

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

  test('hilo principal (sin agent_type) nunca se cuenta -- solo aplica a subagentes', () => {
    limpiarEstado();
    for (let i = 0; i < 50; i++) {
      const r = correr({ session_id: 's1', tool_name: 'Bash', tool_input: { command: `echo ${i}` } });
      assert.equal(r.status, 0, `llamada ${i + 1} del hilo principal nunca debe bloquear`);
    }
  });

  test('permite hasta 40 llamadas de un subagente, bloquea la 41', () => {
    limpiarEstado();
    const base = { session_id: 's2', agent_type: 'general-purpose' };
    for (let i = 0; i < 40; i++) {
      const r = correr({ ...base, tool_name: 'Bash', tool_input: { command: `echo ${i}` } });
      assert.equal(r.status, 0, `llamada ${i + 1}/40 no deberia bloquear`);
    }
    const r41 = correr({ ...base, tool_name: 'Bash', tool_input: { command: 'echo 41' } });
    assert.equal(r41.status, 2, 'la llamada 41 debe bloquear -- presupuesto agotado');
    assert.match(r41.stderr, /SUBAGENT-BUDGET-GUARD/);
  });

  test('cada session_id+agent_type lleva su propio contador, no se cruzan', () => {
    limpiarEstado();
    const agenteA = { session_id: 's3', agent_type: 'code-reviewer' };
    const agenteB = { session_id: 's3', agent_type: 'security-scanner' };
    for (let i = 0; i < 40; i++) {
      assert.equal(correr({ ...agenteA, tool_name: 'Bash', tool_input: { i } }).status, 0);
    }
    // agenteB con presupuesto propio, sin agotar, no debe verse afectado por A
    const rB = correr({ ...agenteB, tool_name: 'Bash', tool_input: { i: 0 } });
    assert.equal(rB.status, 0, 'un subagente distinto no hereda el contador agotado de otro');
  });

  test('sin tool_name en el evento, sale con codigo 0 sin fallar', () => {
    limpiarEstado();
    const r = correr({ session_id: 's4', agent_type: 'general-purpose' });
    assert.equal(r.status, 0);
  });
});
