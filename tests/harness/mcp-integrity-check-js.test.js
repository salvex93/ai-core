'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript } = require('./_shared');

describe('mcp-integrity-check.js', () => {
  // Aislado en directorio temporal propio (mismo patron que AI_CORE_MEMORY_VAULT_PATH
  // en memory-index.js) -- evita colision con otros archivos de test paralelos que
  // tocan el mismo baseline via health-check.js -> verificarIntegridad(). Se usa
  // process.pid (unico por proceso de test) en vez de Date.now() para evitar la
  // misma clase de colision que este fix resuelve.
  const BASELINE_PATH = path.join(os.tmpdir(), `mcp-integrity-baseline-${process.pid}.json`);
  process.env.AI_CORE_MCP_BASELINE_PATH = BASELINE_PATH;
  delete require.cache[require.resolve(path.join(BIN, 'mcp-integrity-check.js'))];
  const { verificarIntegridad } = require(path.join(BIN, 'mcp-integrity-check.js'));

  after(() => {
    fs.rmSync(BASELINE_PATH, { force: true });
    delete process.env.AI_CORE_MCP_BASELINE_PATH;
  });

  test('el script existe', () => {
    assert.ok(fs.existsSync(path.join(BIN, 'mcp-integrity-check.js')));
  });

  test('sin baseline previo: lo crea y reporta ok', () => {
    fs.rmSync(BASELINE_PATH, { force: true });
    const r = verificarIntegridad();
    assert.equal(r.ok, true);
    assert.equal(r.primeraEjecucion, true);
    assert.ok(fs.existsSync(BASELINE_PATH), 'debe crear el archivo de baseline');
  });

  test('con baseline igual al estado actual: ok sin cambios', () => {
    verificarIntegridad(); // crea baseline con el estado real actual
    const r = verificarIntegridad(); // segunda corrida, nada cambio
    assert.equal(r.ok, true);
    assert.equal(r.cambios.length, 0);
    assert.equal(r.primeraEjecucion, false);
  });

  test('detecta hash distinto cuando el baseline registrado no coincide', () => {
    verificarIntegridad(); // baseline real
    // Simular un baseline desactualizado -- hash falso para gemini-bridge
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    baseline.hashes['gemini-bridge'] = 'hash-simulado-desactualizado';
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2), 'utf8');

    const r = verificarIntegridad();
    assert.equal(r.ok, false);
    assert.ok(r.cambios.some(c => c.server === 'gemini-bridge' && c.motivo.includes('hash distinto')));
  });
});

// ─── circuit-breaker.js (ASI08 — fallos en cascada) ──────────────────────────
