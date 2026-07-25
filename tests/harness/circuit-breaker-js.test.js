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
});

// ─── health-check.js — gate de sesion ────────────────────────────────────────
