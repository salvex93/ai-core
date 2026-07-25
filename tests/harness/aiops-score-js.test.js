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
    const r = runScript(SCRIPT, []);
    assert.equal(r.status, 0, 'debe terminar sin error');
    assert.ok(r.stdout.includes('[AIOPS-SCORE]'), 'debe incluir linea de score');
  });

  test('--report sale con 0 y muestra ultimo score', () => {
    const r = runScript(SCRIPT, ['--report']);
    assert.equal(r.status, 0, '--report debe terminar sin error');
  });

  test('el score total esta entre 0 y 10', () => {
    // La corrida normal puede emitir formato compacto "[AIOPS-SCORE] N/10" o
    // completo "Total: N/10" segun el gate de verbosidad — aceptar ambos.
    const r = runScript(SCRIPT, []);
    const match = r.stdout.match(/Total:\s*(\d+)\/10/) || r.stdout.match(/\[AIOPS-SCORE\]\s*(\d+)\/10/);
    assert.ok(match, 'debe incluir el score total en el output (formato compacto o completo)');
    const score = parseInt(match[1], 10);
    assert.ok(score >= 0 && score <= 10, `score ${score} debe estar entre 0 y 10`);
  });

  test('produce score en las 6 dimensiones esperadas (via --report)', () => {
    // La corrida normal usa un gate de verbosidad: si el score es estable
    // (no baja y sin detalles nuevos) solo imprime una linea compacta para
    // no quemar tokens en cada Stop hook. El detalle completo por dimension
    // sigue disponible siempre via --report.
    runScript(SCRIPT, []);
    const r = runScript(SCRIPT, ['--report']);
    const dimensiones = ['routing', 'hooks', 'skills', 'drift', 'seguridad', 'agentes'];
    for (const dim of dimensiones) {
      assert.ok(r.stdout.includes(dim), `debe incluir dimension '${dim}'`);
    }
  });

  test('corrida normal: gate de verbosidad compacta cuando el score es estable', () => {
    runScript(SCRIPT, []); // primera corrida establece linea base
    const r = runScript(SCRIPT, []); // segunda corrida: estable, sin detalles
    assert.ok(r.stdout.includes('[AIOPS-SCORE]'), 'debe incluir linea de score');
    assert.ok(!r.stdout.includes('routing'), 'no debe listar dimensiones cuando el score es estable y sin detalles');
  });
});

// ─── code-exec-guard.js (ASI05 — bloqueo preventivo de ejecucion arbitraria) ──
