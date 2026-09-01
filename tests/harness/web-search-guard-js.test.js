'use strict';

/**
 * web-search-guard.js — Fuerza el uso de mcp__gemini-bridge__buscar_web
 * (Gemini, tier 0 gratuito) en vez de WebSearch/WebFetch nativos de Claude,
 * mismo patron ya usado por guard-read.js para Read en archivos grandes.
 * Gap real identificado en auditoria comparativa de mercado 2026-09-01:
 * la regla "GEMINI PRIMERO" de CLAUDE.md para busqueda web era solo prosa,
 * sin enforcement tecnico -- a diferencia de Read, que si tenia guard-read.js.
 *
 * Mismo fallback con gracia que guard-read.js: sin GEMINI_API_KEY
 * disponible, deja pasar WebSearch/WebFetch nativo en vez de bloquear sin
 * alternativa real.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { REPO, BIN } = require('./_shared');

describe('web-search-guard.js', () => {
  const GUARD = path.join(BIN, 'web-search-guard.js');
  const archivosTemp = [];

  function envFile(contenido) {
    const f = path.join(os.tmpdir(), `web-search-guard-test-${crypto.randomBytes(6).toString('hex')}.env`);
    fs.writeFileSync(f, contenido, 'utf8');
    archivosTemp.push(f);
    return f;
  }

  after(() => {
    for (const f of archivosTemp) {
      try { fs.unlinkSync(f); } catch { /* ya borrado */ }
    }
  });

  function correr(toolName, envPath) {
    const evento = JSON.stringify({ tool_name: toolName, tool_input: { query: 'algo' } });
    return spawnSync('node', [GUARD], {
      encoding: 'utf8', cwd: REPO, input: evento,
      env: { ...process.env, AI_CORE_TEST_MODE: '1', AI_CORE_ENV_PATH: envPath, GEMINI_API_KEY: '' },
    });
  }

  test('con GEMINI_API_KEY disponible: bloquea WebSearch con permissionDecision:deny', () => {
    const r = correr('WebSearch', envFile('GEMINI_API_KEY=fake-key-para-test'));
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /buscar_web/);
  });

  test('con GEMINI_API_KEY disponible: bloquea WebFetch con permissionDecision:deny', () => {
    const r = correr('WebFetch', envFile('GEMINI_API_KEY=fake-key-para-test'));
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  });

  test('sin GEMINI_API_KEY: permite WebSearch en vez de bloquear (degradacion con gracia)', () => {
    const r = correr('WebSearch', envFile(''));
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'sin GEMINI_API_KEY no debe emitir permissionDecision:deny');
  });

  test('otras tools (Bash, Read, Grep) no se ven afectadas', () => {
    for (const tool of ['Bash', 'Read', 'Grep']) {
      const r = correr(tool, envFile('GEMINI_API_KEY=fake-key-para-test'));
      assert.equal(r.status, 0);
      assert.equal(r.stdout.trim(), '', `${tool} no debe activar el guard de busqueda web`);
    }
  });

  test('sin tool_name en el evento, sale con codigo 0 sin fallar', () => {
    const r = spawnSync('node', [GUARD], {
      encoding: 'utf8', cwd: REPO, input: JSON.stringify({}),
      env: { ...process.env, AI_CORE_TEST_MODE: '1' },
    });
    assert.equal(r.status, 0);
  });
});
