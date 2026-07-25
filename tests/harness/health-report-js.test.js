'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('health-report.js', () => {
  const { buildSyncReport, buildAsyncSection, buildBanner } = require(path.join(BIN, 'health-report.js'));

  const metaOk = { version: '3.12.0', ts: '2026-07-17T00:00:00.000Z', sessionId: 'abc12345' };

  test('buildSyncReport: todo OK produce "Estado general: OK"', () => {
    const results = {
      deps:   { ok: true, count: 3, installed: ['a@1', 'b@1', 'c@1'], missing: [], autoFixed: false },
      skills: { ok: true, count: 38, invalid: [] },
      mcp:    [{ server: 'gemini-bridge', ok: true, tools: ['x'], latencyMs: 10 }],
    };
    const md = buildSyncReport(results, metaOk);
    assert.match(md, /\*\*Estado general: OK\*\*/);
    assert.match(md, /HEALTH REPORT — AI-CORE v3\.12\.0/);
  });

  test('buildSyncReport: con fallos lista los issues por nombre', () => {
    const results = {
      deps:   { ok: false, count: 3, installed: [], missing: ['a'], autoFixed: false, error: 'ENOENT' },
      skills: { ok: false, count: 38, invalid: ['x-skill'] },
      mcp:    [{ server: 'gemini-bridge', ok: false, error: 'timeout 3s' }],
    };
    const md = buildSyncReport(results, metaOk);
    assert.match(md, /3 ERROR\(ES\)/);
    assert.match(md, /dependencias npm/);
    assert.match(md, /skills/);
    assert.match(md, /MCP gemini-bridge/);
    assert.match(md, /invalidos: x-skill/);
  });

  test('buildAsyncSection: reporta drift de version cuando corresponde', () => {
    const versionResults = [
      { dep: 'pkg-a', installed: '1.0.0', latest: '1.0.0', drift: false },
      { dep: 'pkg-b', installed: '1.0.0', latest: '2.0.0', drift: true },
    ];
    const md = buildAsyncSection(versionResults, { skipped: true, reason: 'sin API key' });
    assert.match(md, /npm install pkg-b@latest/);
    assert.match(md, /OMITIDO — sin API key/);
  });

  test('buildAsyncSection: reporta modelos nuevos y retirados', () => {
    const md = buildAsyncSection([], { nuevos: ['modelo-x'], retirados: ['modelo-viejo'] });
    assert.match(md, /NUEVOS modelos disponibles.*modelo-x/);
    assert.match(md, /POSIBLEMENTE RETIRADOS.*modelo-viejo/);
  });

  test('buildBanner: sin issues', () => {
    assert.equal(buildBanner(false, 0, '2026-07-17'), '[HEALTH-CHECK OK | 2026-07-17 | 0 issues]');
  });

  test('buildBanner: con issues incluye el conteo', () => {
    assert.equal(
      buildBanner(true, 3, '2026-07-17'),
      '[HEALTH-CHECK 3 ISSUE(S) | 2026-07-17 | ver .claude/HEALTH_REPORT.md]'
    );
  });
});

// ─── health-worker.js ─────────────────────────────────────────────────────────
// main() se auto-ejecuta al requerir el archivo y hace llamadas HTTP reales
// (registry.npmjs.org, API de Anthropic) -- no se ejercita end-to-end aqui.
// Se prueba el efecto observable en disco de appendAsyncSection() corriendo
// el script completo contra un HEALTH_REPORT.md de prueba, con ANTHROPIC_API_KEY
// vacia para forzar el camino "skipped" sin red.
