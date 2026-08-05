'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('health-check.js — gate de sesion', () => {
  const SCRIPT = path.join(BIN, 'health-check.js');
  // Baseline de integridad MCP aislado -- health-check.js invoca internamente
  // verificarIntegridad(), que sin este override tocaria el mismo archivo real
  // que mcp-integrity-check-js.test.js manipula en paralelo (misma clase de
  // condicion de carrera ya resuelta en memory-index.js para el vault).
  const MCP_BASELINE_ENV = { AI_CORE_MCP_BASELINE_PATH: path.join(os.tmpdir(), `hc-mcp-baseline-${process.pid}.json`) };

  function flagPath(sessionId) {
    return path.join(os.tmpdir(), `ai-core-hc-${sessionId}.flag`);
  }

  after(() => {
    fs.rmSync(MCP_BASELINE_ENV.AI_CORE_MCP_BASELINE_PATH, { force: true });
  });

  test('primera corrida en una sesion nueva: corre completo y crea el flag', () => {
    // process.pid es unico por proceso de test -- a diferencia de Date.now(),
    // no colisiona con otro archivo de test paralelo que arranque en el mismo ms.
    const sessionId = `test-${process.pid}-1`;
    const flag = flagPath(sessionId);
    fs.rmSync(flag, { force: true });

    const r = runScript(SCRIPT, [], { CLAUDE_CODE_SESSION_ID: sessionId, ...MCP_BASELINE_ENV });
    fs.rmSync(flag, { force: true });

    assert.equal(r.status, 0);
    assert.match(r.stderr, /HEALTH-CHECK/, 'primera corrida debe emitir el banner de health-check');
  });

  test('segunda corrida en la misma sesion: sale temprano sin re-verificar', () => {
    const sessionId = `test-${process.pid}-2`;
    const flag = flagPath(sessionId);
    fs.rmSync(flag, { force: true });

    runScript(SCRIPT, [], { CLAUDE_CODE_SESSION_ID: sessionId, ...MCP_BASELINE_ENV }); // primera corrida real
    const r2 = runScript(SCRIPT, [], { CLAUDE_CODE_SESSION_ID: sessionId, ...MCP_BASELINE_ENV }); // segunda, debe saltar
    fs.rmSync(flag, { force: true });

    assert.equal(r2.status, 0);
    assert.equal(r2.stderr, '', 'la segunda corrida no debe emitir ningun banner (gate de sesion activo)');
  });

  test('si el reporte no se puede escribir (REPORT_PATH es un directorio), main().catch loguea el motivo sin crashear', () => {
    const sessionId = `test-${process.pid}-3`;
    const flag = flagPath(sessionId);
    fs.rmSync(flag, { force: true });

    // HEALTH_REPORT.md como directorio fuerza EISDIR en fs.writeFileSync
    // dentro de main(), reproduciendo un fallo inesperado tardio en el
    // pipeline sin tocar node_modules ni el repo real.
    const reportComoDirectorio = path.join(REPO, '.claude', 'HEALTH_REPORT.md');
    const existiaComoArchivo = fs.existsSync(reportComoDirectorio) && fs.statSync(reportComoDirectorio).isFile();
    const backup = existiaComoArchivo ? fs.readFileSync(reportComoDirectorio, 'utf8') : null;
    if (existiaComoArchivo) fs.rmSync(reportComoDirectorio);
    fs.mkdirSync(reportComoDirectorio, { recursive: true });

    try {
      const r = runScript(SCRIPT, [], { CLAUDE_CODE_SESSION_ID: sessionId, ...MCP_BASELINE_ENV });
      assert.equal(r.status, 0, 'nunca debe bloquear el hook');
      assert.match(r.stderr, /HEALTH-CHECK.*fallo no bloqueante/, 'debe loguear el motivo del fallo, no tragarlo en silencio');
    } finally {
      fs.rmSync(reportComoDirectorio, { recursive: true, force: true });
      if (backup !== null) fs.writeFileSync(reportComoDirectorio, backup, 'utf8');
      fs.rmSync(flag, { force: true });
    }
  });
});

// ─── detect-stack.js ──────────────────────────────────────────────────────────
