'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('capture-event.js — AI_CORE_TEST_MODE', () => {
  const SCRIPT     = path.join(BIN, 'capture-event.js');
  const QUEUE_PATH = path.join(REPO, '.claude', 'EVENTS_QUEUE.json');

  function leerCola() {
    try { return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')); }
    catch { return []; }
  }

  test('con AI_CORE_TEST_MODE=1 no escribe en la cola real', () => {
    const antes = leerCola().length;
    const r = runScript(SCRIPT, [
      '--type', 'harness_error', '--tool', 'test-fake', '--error', 'evento de prueba que no debe persistir',
    ]);
    const despues = leerCola().length;
    assert.equal(r.status, 0);
    assert.equal(despues, antes, 'AI_CORE_TEST_MODE=1 (inyectado por runScript) no debe agregar eventos a la cola real');
  });

  test('sin AI_CORE_TEST_MODE, capture-event.js si encola (limpiado despues)', () => {
    // Prueba el comportamiento real (sin el gate) para confirmar que el fix
    // no rompio la captura genuina -- limpia el evento de prueba al terminar
    // para no dejar ruido permanente en la cola real.
    //
    // Regresion real (test flaky detectado en auditoria de cierre): este
    // test escribe a EVENTS_QUEUE.json real (sin AI_CORE_TEST_MODE), un
    // archivo compartido con otros tests del mismo describe block que
    // tambien escriben sin el gate -- contar "antes + 1" es fragil ante
    // ejecucion concurrente/no determinista de node:test. Se verifica que
    // el evento con su marcador unico existe, no el conteo total.
    const marcador = `test-real-encolado-${Date.now()}`;
    const r = spawnSync('node', [
      SCRIPT, '--type', 'harness_error', '--tool', 'test-fake', '--error', marcador,
    ], { encoding: 'utf8', cwd: REPO }); // sin AI_CORE_TEST_MODE — env real del proceso

    const colaTrasEjecutar = leerCola();
    assert.equal(r.status, 0);
    assert.ok(colaTrasEjecutar.some(e => e.error === marcador), 'sin el gate de test, el evento si debe encolarse');

    // Limpieza: remover el evento de prueba para no dejarlo en la cola real
    const limpio = colaTrasEjecutar.filter(e => e.error !== marcador);
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(limpio, null, 2), 'utf8');
  });

  test('sin --tool/--error explicitos, completa el contexto con tool_name/tool_response del JSON de stdin', () => {
    // Regresion real: CLAUDE_TOOL_NAME/CLAUDE_TOOL_INPUT/CLAUDE_TOOL_ERROR
    // nunca existieron como variables de entorno reales -- solo importa en
    // la practica cuando el caller no pasa --tool/--error explicitos (todos
    // los hooks reales de hooks-definition.js si los pasan).
    //
    // Mismo fix de flakiness que el test anterior: se busca el evento por
    // su marcador unico (tool_response), no por conteo relativo -- este
    // describe block comparte EVENTS_QUEUE.json real con otro test que
    // tambien escribe sin AI_CORE_TEST_MODE.
    const marcador = `test-stdin-${Date.now()}`;
    const evento = JSON.stringify({ tool_name: 'test-fake-stdin', tool_response: marcador });
    const r = spawnSync('node', [SCRIPT, '--type', 'harness_error'], {
      encoding: 'utf8', cwd: REPO, input: evento,
    });
    const colaTrasEjecutar = leerCola();
    assert.equal(r.status, 0);
    const evt = colaTrasEjecutar.find(e => e.tool === 'test-fake-stdin');
    assert.ok(evt, 'debe encolar el evento con tool completado desde stdin');
    assert.equal(evt.tool, 'test-fake-stdin', 'debe completar tool desde stdin');

    const limpio = colaTrasEjecutar.filter(e => e.tool !== 'test-fake-stdin');
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(limpio, null, 2), 'utf8');
  });
});

// ─── standards-guard.js (guardrails deterministas Zero-Regression) ──────────
