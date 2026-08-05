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

  test('bloquea (codigo 2) el ciclo indirecto A->B->A, no solo la recursion directa A->A', () => {
    // Regresion real: la anti-recursion original solo comparaba el tipo del
    // padre inmediato contra el hijo -- A lanza B (ok), B lanza A (ok,
    // cerrando el ciclo sin deteccion). El fix persiste la cadena de tipos
    // ancestros en el lock y hereda por coincidencia de tipoActual -- una
    // heuristica (no un id de linaje real, que Claude Code no expone hoy),
    // suficiente para el caso comun de un solo subagente de cada tipo activo.
    limpiarLocks();

    // A lanza B: registra el lock de B con cadena ['A']
    const rA = spawnSync('node', [GUARD], {
      encoding: 'utf8', cwd: REPO,
      input: JSON.stringify({ agent_type: 'A', tool_input: { subagent_type: 'B' }, session_id: 's1', prompt_id: 'pB' }),
      env: { ...process.env, AI_CORE_TEST_MODE: '1', ...LOCK_ENV },
    });
    assert.equal(rA.status, 0, 'A->B no deberia bloquear');

    // B (corriendo, tipoActual=B) intenta lanzar A: debe bloquear porque A
    // ya esta en la cadena de ancestros de B (['A'])
    const rB = spawnSync('node', [GUARD], {
      encoding: 'utf8', cwd: REPO,
      input: JSON.stringify({ agent_type: 'B', tool_input: { subagent_type: 'A' }, session_id: 's1', prompt_id: 'pA2' }),
      env: { ...process.env, AI_CORE_TEST_MODE: '1', ...LOCK_ENV },
    });
    assert.equal(rB.status, 2, 'B->A debe bloquear -- cierra el ciclo indirecto A->B->A');
    assert.ok(rB.stderr.includes('SUBAGENT-GUARD'));
  });

  test('el lock se libera cuando el subagente termina (SubagentStop) -- el 4to spawn no bloquea si 2 de los 3 previos ya terminaron', () => {
    // Regresion real: sin release, MAX_PARALLEL contaba lanzamientos en una
    // ventana de 2 min sin importar si el subagente ya termino, bloqueando
    // falsamente un 4to spawn aunque los 3 previos ya hubieran finalizado.
    const RELEASE = path.join(BIN, 'subagent-guard-release.js');
    limpiarLocks();

    const subagentes = [
      { session_id: 's1', prompt_id: 'p1' },
      { session_id: 's2', prompt_id: 'p2' },
      { session_id: 's3', prompt_id: 'p3' },
    ];
    for (const s of subagentes) {
      const evento = JSON.stringify({ tool_input: { subagent_type: 'Explore' }, ...s });
      const r = spawnSync('node', [GUARD], {
        encoding: 'utf8', cwd: REPO, input: evento,
        env: { ...process.env, AI_CORE_TEST_MODE: '1', ...LOCK_ENV },
      });
      assert.equal(r.status, 0, `lanzamiento de ${s.session_id} no deberia bloquear`);
    }

    // Simular que 2 de los 3 subagentes terminaron (SubagentStop real)
    for (const s of [subagentes[0], subagentes[1]]) {
      const eventoStop = JSON.stringify(s);
      const r = spawnSync('node', [RELEASE], {
        encoding: 'utf8', cwd: REPO, input: eventoStop,
        env: { ...process.env, AI_CORE_TEST_MODE: '1', ...LOCK_ENV },
      });
      assert.equal(r.status, 0, `release de ${s.session_id} no deberia fallar`);
    }

    // Con solo 1 lock activo (s3), el 4to spawn no debe bloquear
    const evento4 = JSON.stringify({ tool_input: { subagent_type: 'Explore' }, session_id: 's4', prompt_id: 'p4' });
    const r4 = spawnSync('node', [GUARD], {
      encoding: 'utf8', cwd: REPO, input: evento4,
      env: { ...process.env, AI_CORE_TEST_MODE: '1', ...LOCK_ENV },
    });
    assert.equal(r4.status, 0, 'el 4to spawn no debe bloquear si 2 de los 3 previos ya liberaron su lock');
  });
});

// ─── bash-verbosity-guard.js ─────────────────────────────────────────────────
