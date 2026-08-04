'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { REPO, BIN } = require('./_shared');

describe('mcp-lifecycle-check.js', () => {
  const LIFECYCLE_REAL = path.join(REPO, '.claude', 'MCP_LIFECYCLE.json');

  test('el archivo MCP_LIFECYCLE.json real existe y es JSON valido', () => {
    assert.ok(fs.existsSync(LIFECYCLE_REAL), 'MCP_LIFECYCLE.json debe existir en .claude/');
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(LIFECYCLE_REAL, 'utf8')));
  });

  test('gemini-bridge y anthropic-router estan declarados en el archivo real', () => {
    const lifecycle = JSON.parse(fs.readFileSync(LIFECYCLE_REAL, 'utf8'));
    const nombres = lifecycle.servidores.map(s => s.name);
    assert.ok(nombres.includes('gemini-bridge'));
    assert.ok(nombres.includes('anthropic-router'));
  });

  // Los tests siguientes usan una copia aislada del archivo real (via
  // AI_CORE_MCP_LIFECYCLE_PATH) para poder mutarla sin tocar el archivo del
  // repo -- mismo patron de aislamiento ya usado para EVENTS_QUEUE.json,
  // MCP_INTEGRITY_BASELINE.json y los locks de subagent-guard.js.
  const LIFECYCLE_TEST = path.join(os.tmpdir(), `mcp-lifecycle-test-${process.pid}.json`);
  process.env.AI_CORE_MCP_LIFECYCLE_PATH = LIFECYCLE_TEST;
  delete require.cache[require.resolve(path.join(BIN, 'mcp-lifecycle-check.js'))];
  const { verificarLifecycle } = require(path.join(BIN, 'mcp-lifecycle-check.js'));

  function escribir(data) {
    fs.writeFileSync(LIFECYCLE_TEST, JSON.stringify(data, null, 2), 'utf8');
  }

  const BASE = {
    servidores: [
      { name: 'gemini-bridge', estado: 'Active' },
      { name: 'anthropic-router', estado: 'Active' },
    ],
  };

  after(() => {
    fs.rmSync(LIFECYCLE_TEST, { force: true });
    delete process.env.AI_CORE_MCP_LIFECYCLE_PATH;
  });

  test('declara un estado valido (Active/Deprecated/Removed) para cada servidor MCP propio', () => {
    escribir(BASE);
    const r = verificarLifecycle();
    assert.equal(r.ok, true, `hallazgos: ${JSON.stringify(r.hallazgos)}`);
  });

  test('detecta un servidor con estado invalido fuera del enum permitido', () => {
    escribir({ servidores: [{ name: 'gemini-bridge', estado: 'EstadoInventado' }, BASE.servidores[1]] });
    const r = verificarLifecycle();
    assert.equal(r.ok, false);
    assert.ok(r.hallazgos.some(h => h.includes('EstadoInventado')));
  });

  test('detecta un servidor real de mcp-integrity-check.js que no esta declarado en MCP_LIFECYCLE.json', () => {
    escribir({ servidores: [BASE.servidores[1]] }); // sin gemini-bridge
    const r = verificarLifecycle();
    assert.equal(r.ok, false);
    assert.ok(r.hallazgos.some(h => h.includes('gemini-bridge')));
  });

  test('un servidor con estado Deprecated exige fecha_deprecacion y reemplazo', () => {
    escribir({ servidores: [{ name: 'gemini-bridge', estado: 'Deprecated' }, BASE.servidores[1]] });
    const r = verificarLifecycle();
    assert.equal(r.ok, false);
    assert.ok(r.hallazgos.some(h => h.includes('fecha_deprecacion') || h.includes('reemplazo')));
  });

  test('un servidor Deprecated con fecha_deprecacion y reemplazo declarados no genera hallazgo', () => {
    escribir({
      servidores: [
        { name: 'gemini-bridge', estado: 'Deprecated', fecha_deprecacion: '2026-09-01', reemplazo: 'gemini-bridge-v2' },
        BASE.servidores[1],
      ],
    });
    const r = verificarLifecycle();
    assert.equal(r.ok, true, `hallazgos: ${JSON.stringify(r.hallazgos)}`);
  });
});
