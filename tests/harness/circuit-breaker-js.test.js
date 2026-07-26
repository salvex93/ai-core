'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('circuit-breaker.js', () => {
  const { evaluarCircuito, UMBRAL_FALLOS, VENTANA_MS } = require(path.join(BIN, 'circuit-breaker.js'));

  test('el script existe', () => {
    assert.ok(fs.existsSync(path.join(BIN, 'circuit-breaker.js')));
  });

  test('sin eventos: circuito cerrado (permite)', () => {
    const r = evaluarCircuito('gemini-bridge', []);
    assert.equal(r.abierto, false);
  });

  test('fallos por debajo del umbral: circuito cerrado', () => {
    const ahora = 1700000000000;
    const eventos = Array.from({ length: UMBRAL_FALLOS - 1 }, (_, i) => ({
      type: 'mcp_failure', tool: 'gemini-bridge', reported: false,
      ts: new Date(ahora - i * 1000).toISOString(),
    }));
    const r = evaluarCircuito('gemini-bridge', eventos, ahora);
    assert.equal(r.abierto, false);
  });

  test('fallos consecutivos >= umbral dentro de la ventana: circuito abierto', () => {
    const ahora = 1700000000000;
    const eventos = Array.from({ length: UMBRAL_FALLOS }, (_, i) => ({
      type: 'mcp_failure', tool: 'gemini-bridge', reported: false,
      ts: new Date(ahora - i * 1000).toISOString(),
    }));
    const r = evaluarCircuito('gemini-bridge', eventos, ahora);
    assert.equal(r.abierto, true);
    assert.equal(r.fallos, UMBRAL_FALLOS);
  });

  test('fallos fuera de la ventana de tiempo no cuentan', () => {
    const ahora = 1700000000000;
    const eventos = Array.from({ length: UMBRAL_FALLOS }, (_, i) => ({
      type: 'mcp_failure', tool: 'gemini-bridge', reported: false,
      ts: new Date(ahora - VENTANA_MS - i * 1000).toISOString(), // todos antes de la ventana
    }));
    const r = evaluarCircuito('gemini-bridge', eventos, ahora);
    assert.equal(r.abierto, false, 'fallos viejos fuera de la ventana no deben abrir el circuito');
  });

  test('fallos de otra herramienta no cuentan para esta', () => {
    const ahora = 1700000000000;
    const eventos = Array.from({ length: UMBRAL_FALLOS }, (_, i) => ({
      type: 'mcp_failure', tool: 'anthropic-router', reported: false,
      ts: new Date(ahora - i * 1000).toISOString(),
    }));
    const r = evaluarCircuito('gemini-bridge', eventos, ahora);
    assert.equal(r.abierto, false);
  });

  test('eventos ya reportados no cuentan (ya fueron atendidos)', () => {
    const ahora = 1700000000000;
    const eventos = Array.from({ length: UMBRAL_FALLOS }, (_, i) => ({
      type: 'mcp_failure', tool: 'gemini-bridge', reported: true,
      ts: new Date(ahora - i * 1000).toISOString(),
    }));
    const r = evaluarCircuito('gemini-bridge', eventos, ahora);
    assert.equal(r.abierto, false);
  });

  test('circuit-breaker registrado en PreToolUse para llamadas MCP', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const preHooks = (settings.hooks?.PreToolUse || []).flatMap(h => h.hooks || []);
    assert.ok(preHooks.some(h => (h.command || '').includes('circuit-breaker.js')));
  });

  // ─── prediccion de degradacion (tasa de fallos, no solo conteo) ────────────
  // Mejora real: el circuito abierto trataba igual "3 fallos en 30s" (falla
  // agudo, el MCP probablemente sigue caido) que "3 fallos distribuidos en
  // 5 min" (degradacion lenta/intermitente). Ambos casos disparaban el mismo
  // aviso. Ahora se distingue por severidad, sin cambiar la filosofia de
  // "avisa, no bloquea" -- un MCP externo puede recuperarse solo.

  test('degradacion aguda (todos los fallos en menos de 60s): severidad critico', () => {
    const ahora = 1700000000000;
    const eventos = Array.from({ length: UMBRAL_FALLOS }, (_, i) => ({
      type: 'mcp_failure', tool: 'gemini-bridge', reported: false,
      ts: new Date(ahora - i * 10000).toISOString(), // 0s, 10s, 20s de separacion
    }));
    const r = evaluarCircuito('gemini-bridge', eventos, ahora);
    assert.equal(r.abierto, true);
    assert.equal(r.severidad, 'critico', 'fallos agrupados en <60s son degradacion aguda');
  });

  test('degradacion lenta (fallos distribuidos en toda la ventana): severidad aviso', () => {
    const ahora = 1700000000000;
    const pasoMs = Math.floor(VENTANA_MS / UMBRAL_FALLOS);
    const eventos = Array.from({ length: UMBRAL_FALLOS }, (_, i) => ({
      type: 'mcp_failure', tool: 'gemini-bridge', reported: false,
      ts: new Date(ahora - i * pasoMs).toISOString(),
    }));
    const r = evaluarCircuito('gemini-bridge', eventos, ahora);
    assert.equal(r.abierto, true);
    assert.equal(r.severidad, 'aviso', 'fallos distribuidos en toda la ventana son degradacion lenta');
  });

  test('circuito cerrado: severidad siempre null (no aplica)', () => {
    const r = evaluarCircuito('gemini-bridge', []);
    assert.equal(r.abierto, false);
    assert.equal(r.severidad, null);
  });

  test('degradacion aguda: el mensaje de stderr escala a CRITICO, no solo AVISO', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'circuit-breaker-'));
    const queuePath = path.join(dir, 'EVENTS_QUEUE.json');
    const ahora = Date.now();
    const eventos = Array.from({ length: UMBRAL_FALLOS }, (_, i) => ({
      type: 'mcp_failure', tool: 'gemini-bridge', reported: false,
      ts: new Date(ahora - i * 10000).toISOString(),
    }));
    fs.writeFileSync(queuePath, JSON.stringify(eventos), 'utf8');

    const evento = JSON.stringify({ tool_name: 'mcp__gemini-bridge__analizar_archivo' });
    const r = spawnSync('node', [path.join(BIN, 'circuit-breaker.js')], {
      encoding: 'utf8', cwd: REPO, input: evento,
      env: { ...process.env, AI_CORE_EVENTS_QUEUE_PATH: queuePath },
    });
    fs.rmSync(dir, { recursive: true, force: true });

    assert.match(r.stderr, /CRITICO/, 'degradacion aguda debe escalar el texto del aviso a CRITICO');
  });
});

// ─── health-check.js — gate de sesion ────────────────────────────────────────
