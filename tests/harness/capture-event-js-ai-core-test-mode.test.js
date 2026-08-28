'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('capture-event.js — AI_CORE_TEST_MODE', () => {
  const SCRIPT = path.join(BIN, 'capture-event.js');
  // Cola de eventos aislada por proceso de test (mismo patron ya usado en
  // circuit-breaker.js) -- sin esto, los tests que escriben sin
  // AI_CORE_TEST_MODE comparten EVENTS_QUEUE.json real con cualquier otro
  // proceso node --test corriendo en paralelo, y el ciclo read-modify-write
  // no atomico de capture-event.js pierde eventos por condicion de carrera.
  const QUEUE_PATH = path.join(os.tmpdir(), `capture-event-queue-${process.pid}.json`);
  const QUEUE_ENV  = { AI_CORE_EVENTS_QUEUE_PATH: QUEUE_PATH };

  function leerCola() {
    try { return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')); }
    catch { return []; }
  }

  after(() => {
    fs.rmSync(QUEUE_PATH, { force: true });
  });

  test('con AI_CORE_TEST_MODE=1 no escribe en la cola real', () => {
    const antes = leerCola().length;
    const r = runScript(SCRIPT, [
      '--type', 'harness_error', '--tool', 'test-fake', '--error', 'evento de prueba que no debe persistir',
    ], QUEUE_ENV);
    const despues = leerCola().length;
    assert.equal(r.status, 0);
    assert.equal(despues, antes, 'AI_CORE_TEST_MODE=1 (inyectado por runScript) no debe agregar eventos a la cola real');
  });

  test('sin AI_CORE_TEST_MODE, capture-event.js si encola', () => {
    // Prueba el comportamiento real (sin el gate) sobre la cola aislada de
    // este archivo de test -- ya no comparte EVENTS_QUEUE.json con ningun
    // otro proceso, asi que el conteo antes/despues es determinista.
    const marcador = `test-real-encolado-${process.pid}`;
    const r = spawnSync('node', [
      SCRIPT, '--type', 'harness_error', '--tool', 'test-fake', '--error', marcador,
    ], { encoding: 'utf8', cwd: REPO, env: { ...process.env, ...QUEUE_ENV } }); // sin AI_CORE_TEST_MODE

    const colaTrasEjecutar = leerCola();
    assert.equal(r.status, 0);
    assert.ok(colaTrasEjecutar.some(e => e.error === marcador), 'sin el gate de test, el evento si debe encolarse');
  });

  test('issue #252: redacta un token/secreto real dentro de --context antes de escribirlo en la cola', () => {
    const tokenReal = '908a9927a67bf4fa008bc877e98a8fe03163a2416393ec6a6151331be1d2ee38';
    const contexto = `TOKEN="${tokenReal}"\ncurl -H "Authorization: Bearer $TOKEN" https://ejemplo.com`;
    const r = spawnSync('node', [
      SCRIPT, '--type', 'hook_failure', '--tool', 'bash', '--error', 'sin detalle', '--context', contexto,
    ], { encoding: 'utf8', cwd: REPO, env: { ...process.env, ...QUEUE_ENV } });

    assert.equal(r.status, 0);
    const crudo = fs.readFileSync(QUEUE_PATH, 'utf8');
    assert.ok(!crudo.includes(tokenReal), 'el token real nunca debe llegar a persistirse en EVENTS_QUEUE.json');

    const evt = leerCola().find(e => e.tool === 'bash' && e.error === 'sin detalle');
    assert.ok(evt, 'el evento debe encolarse igual, solo con el secreto redactado');
    assert.ok(evt.context.includes('REDACTADO'), 'el context debe marcar explicitamente la redaccion');
  });

  test('sin --tool/--error explicitos, completa el contexto con tool_name/tool_response del JSON de stdin', () => {
    // Regresion real: CLAUDE_TOOL_NAME/CLAUDE_TOOL_INPUT/CLAUDE_TOOL_ERROR
    // nunca existieron como variables de entorno reales -- solo importa en
    // la practica cuando el caller no pasa --tool/--error explicitos (todos
    // los hooks reales de hooks-definition.js si los pasan).
    const marcador = `test-stdin-${process.pid}`;
    const evento = JSON.stringify({ tool_name: 'test-fake-stdin', tool_response: marcador });
    const r = spawnSync('node', [SCRIPT, '--type', 'harness_error'], {
      encoding: 'utf8', cwd: REPO, input: evento, env: { ...process.env, ...QUEUE_ENV },
    });
    const colaTrasEjecutar = leerCola();
    assert.equal(r.status, 0);
    const evt = colaTrasEjecutar.find(e => e.tool === 'test-fake-stdin');
    assert.ok(evt, 'debe encolar el evento con tool completado desde stdin');
    assert.equal(evt.tool, 'test-fake-stdin', 'debe completar tool desde stdin');
  });
});

// ─── standards-guard.js (guardrails deterministas Zero-Regression) ──────────
