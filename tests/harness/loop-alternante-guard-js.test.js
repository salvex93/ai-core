'use strict';

/**
 * loop-alternante-guard.js — Capa 2 de defensa contra runaway de subagentes:
 * deteccion de patron alternante A-B-A-B-A-B entre 2 tools distintas, aunque
 * los ARGUMENTOS sean distintos en cada vuelta (tool-repeat-guard.js solo
 * detecta argumentos IDENTICOS, no cubre este caso).
 *
 * Investigacion 2026-09-02: patron validado en produccion real por
 * OpenHands StuckDetector (docs.openhands.dev/sdk/guides/agent-stuck-detector)
 * -- 6+ ciclos alternantes de firma "tool_name + shape de argumentos" (no el
 * contenido exacto) sin converger es la señal, replicando exactamente el
 * caso real de vectara/awesome-agent-failures (pipeline de 4 agentes,
 * $47k, 264h). Comportamiento validado por el usuario: ADVERTIR en la
 * primera deteccion (exit 0, log), BLOQUEAR solo si el patron persiste una
 * segunda ventana completa (exit 2).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN } = require('./_shared');

describe('loop-alternante-guard.js', () => {
  const GUARD = path.join(BIN, 'loop-alternante-guard.js');
  const STATE_DIR = path.join(os.tmpdir(), `ai-core-locks-test-alternante-${process.pid}`);
  const STATE_ENV = { AI_CORE_ALTERNANTE_DIR: STATE_DIR };

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

  function eventoBase(toolName, argKey, sessionId = 's1', agentType = 'general-purpose') {
    return { session_id: sessionId, agent_type: agentType, tool_name: toolName, tool_input: { archivo: argKey } };
  }

  test('secuencia normal sin patron alternante: nunca advierte ni bloquea', () => {
    limpiarEstado();
    const secuencia = ['Read', 'Grep', 'Edit', 'Bash', 'Write', 'Read', 'Bash', 'Grep'];
    for (const tool of secuencia) {
      const r = correr(eventoBase(tool, 'x'));
      assert.equal(r.status, 0);
      assert.equal(r.stdout.trim(), '', `${tool} en secuencia variada no debe disparar el guard`);
    }
  });

  test('6 ciclos alternantes A-B con argumentos DISTINTOS cada vez: ADVIERTE (exit 0) en la primera deteccion', () => {
    limpiarEstado();
    // A=Read(archivo1,3,5...) B=Edit(archivo2,4,6...) -- argumentos DISTINTOS
    // en cada vuelta, exactamente el caso que tool-repeat-guard.js NO cubre.
    let ultimo;
    for (let i = 0; i < 12; i++) {
      const tool = i % 2 === 0 ? 'Read' : 'Edit';
      ultimo = correr(eventoBase(tool, `variante-${i}`));
    }
    assert.equal(ultimo.status, 0, 'la primera deteccion adviert, no bloquea');
    assert.match(ultimo.stdout, /LOOP-ALTERNANTE-GUARD/, 'debe advertir explicitamente en stdout');
  });

  test('el patron persiste una segunda ventana completa: BLOQUEA (exit 2)', () => {
    limpiarEstado();
    let ultimo;
    // Primera ventana de 12 (6 ciclos) -- dispara advertencia.
    for (let i = 0; i < 12; i++) {
      const tool = i % 2 === 0 ? 'Read' : 'Edit';
      ultimo = correr(eventoBase(tool, `v1-${i}`));
    }
    assert.equal(ultimo.status, 0);
    // Segunda ventana de 12 mas, mismo patron alternante persistiendo.
    for (let i = 0; i < 12; i++) {
      const tool = i % 2 === 0 ? 'Read' : 'Edit';
      ultimo = correr(eventoBase(tool, `v2-${i}`));
    }
    assert.equal(ultimo.status, 2, 'el patron persistente en la segunda ventana debe bloquear');
    assert.match(ultimo.stderr, /LOOP-ALTERNANTE-GUARD/);
  });

  test('sesiones/agentes distintos no comparten estado de deteccion', () => {
    limpiarEstado();
    for (let i = 0; i < 12; i++) {
      const tool = i % 2 === 0 ? 'Read' : 'Edit';
      correr(eventoBase(tool, `s1-${i}`, 's1', 'agente-A'));
    }
    const rOtro = correr(eventoBase('Read', 'x', 's2', 'agente-B'));
    assert.equal(rOtro.status, 0);
    assert.equal(rOtro.stdout.trim(), '', 'una sesion/agente distinto no hereda el estado de otro');
  });

  test('sin tool_name o agent_type, sale con codigo 0 sin fallar', () => {
    limpiarEstado();
    const r = correr({ session_id: 's1' });
    assert.equal(r.status, 0);
  });
});
