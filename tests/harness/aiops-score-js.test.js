'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('aiops-score.js', () => {
  const SCRIPT = path.join(BIN, 'aiops-score.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'aiops-score.js debe existir en .claude/bin/');
  });

  test('sale con 0 y produce output de score', () => {
    // Historial aislado -- sin esto, corre contra AIOPS_SCORE_HISTORY.json
    // real y compite por el mismo archivo con otros tests de este describe
    // cuando node --test los ejecuta en paralelo (escritura no atomica en
    // Windows: EBUSY/UNKNOWN error, el proceso crashea sin imprimir salida).
    const env = { AI_CORE_SCORE_HISTORY_PATH: tmpFile('[]') };
    const r = runScript(SCRIPT, [], env);
    assert.equal(r.status, 0, 'debe terminar sin error');
    assert.ok(r.stdout.includes('[AIOPS-SCORE]'), 'debe incluir linea de score');
  });

  test('--report sale con 0 y muestra ultimo score', () => {
    const historyPath = tmpFile('[]');
    const env = { AI_CORE_SCORE_HISTORY_PATH: historyPath };
    runScript(SCRIPT, [], env); // primera corrida establece linea base para --report
    const r = runScript(SCRIPT, ['--report'], env);
    assert.equal(r.status, 0, '--report debe terminar sin error');
  });

  test('el score total esta entre 0 y 10', () => {
    // La corrida normal puede emitir formato compacto "[AIOPS-SCORE] N/10" o
    // completo "Total: N/10" segun el gate de verbosidad — aceptar ambos.
    const env = { AI_CORE_SCORE_HISTORY_PATH: tmpFile('[]') };
    const r = runScript(SCRIPT, [], env);
    const match = r.stdout.match(/Total:\s*(\d+)\/10/) || r.stdout.match(/\[AIOPS-SCORE\]\s*(\d+)\/10/);
    assert.ok(match, 'debe incluir el score total en el output (formato compacto o completo)');
    const score = parseInt(match[1], 10);
    assert.ok(score >= 0 && score <= 10, `score ${score} debe estar entre 0 y 10`);
  });

  test('produce score en las 7 dimensiones esperadas (via --report)', () => {
    // La corrida normal usa un gate de verbosidad: si el score es estable
    // (no baja y sin detalles nuevos) solo imprime una linea compacta para
    // no quemar tokens en cada Stop hook. El detalle completo por dimension
    // sigue disponible siempre via --report.
    const historyPath = tmpFile('[]');
    const env = { AI_CORE_SCORE_HISTORY_PATH: historyPath };
    runScript(SCRIPT, [], env);
    const r = runScript(SCRIPT, ['--report'], env);
    const dimensiones = ['routing', 'hooks', 'skills', 'drift', 'seguridad', 'agentes', 'eventos'];
    for (const dim of dimensiones) {
      assert.ok(r.stdout.includes(dim), `debe incluir dimension '${dim}'`);
    }
  });

  test('dimension eventos: sin EVENTS_QUEUE.json, score maximo', () => {
    const historyPath = tmpFile('[]');
    const queuePath = path.join(os.tmpdir(), `harness-test-queue-ausente-${Date.now()}.json`);
    const env = { AI_CORE_SCORE_HISTORY_PATH: historyPath, AI_CORE_EVENTS_QUEUE_PATH: queuePath };
    runScript(SCRIPT, [], env);
    const r = runScript(SCRIPT, ['--report'], env);
    assert.match(r.stdout, /eventos\s+█{10}░{0}\s*10\/10/, 'sin cola, la dimension eventos debe ser 10/10');
  });

  test('dimension eventos: penaliza el doble los tipos criticos sin reportar', () => {
    const historyPath = tmpFile('[]');
    const cola = [
      { id: '1', ts: new Date().toISOString(), type: 'harness_error', reported: false },
      { id: '2', ts: new Date().toISOString(), type: 'hook_failure',  reported: false },
      { id: '3', ts: new Date().toISOString(), type: 'skill_gap',     reported: false },
      { id: '4', ts: new Date().toISOString(), type: 'mcp_failure',   reported: true },
    ];
    const queuePath = tmpFile(JSON.stringify(cola));
    const env = { AI_CORE_SCORE_HISTORY_PATH: historyPath, AI_CORE_EVENTS_QUEUE_PATH: queuePath };
    runScript(SCRIPT, [], env);
    const r = runScript(SCRIPT, ['--report'], env);
    // penalizacion: harness_error(2) + hook_failure(2) + skill_gap(1) = 5 -> score 5/10
    assert.match(r.stdout, /eventos\s+█{5}░{5}\s*5\/10/, 'debe penalizar -2 por tipo critico y -1 por tipo no critico, ignorando reportados');
    assert.ok(r.stdout.includes("1 evento(s) 'harness_error' sin reportar"), 'debe listar el detalle por tipo');
  });

  test('corrida normal: gate de verbosidad compacta cuando el score es estable', () => {
    // Historial y cola de eventos aislados -- sin esto, la comparacion
    // "estable" corre contra AIOPS_SCORE_HISTORY.json y EVENTS_QUEUE.json
    // reales, que pueden arrastrar una entrada con detalles (ej. drift, o
    // eventos pendientes reales del harness) ajena a este test y romper la
    // asercion de forma intermitente.
    const historyPath = tmpFile('[]');
    const queuePath = path.join(os.tmpdir(), `harness-test-queue-vacia-${Date.now()}.json`);
    const env = { AI_CORE_SCORE_HISTORY_PATH: historyPath, AI_CORE_EVENTS_QUEUE_PATH: queuePath };
    runScript(SCRIPT, [], env); // primera corrida establece linea base
    const r = runScript(SCRIPT, [], env); // segunda corrida: estable, sin detalles
    assert.ok(r.stdout.includes('[AIOPS-SCORE]'), 'debe incluir linea de score');
    assert.ok(!r.stdout.includes('routing'), 'no debe listar dimensiones cuando el score es estable y sin detalles');
  });
});

// ─── code-exec-guard.js (ASI05 — bloqueo preventivo de ejecucion arbitraria) ──
