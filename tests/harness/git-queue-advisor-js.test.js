'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('git-queue-advisor.js', () => {
  const SCRIPT     = path.join(BIN, 'git-queue-advisor.js');
  const QUEUE_PATH = path.join(REPO, '.claude', 'EVENTS_QUEUE.json');

  function leerCola() { return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')); }
  function escribirCola(eventos) { fs.writeFileSync(QUEUE_PATH, JSON.stringify(eventos, null, 2)); }

  let colaOriginal;
  before(() => { colaOriginal = leerCola(); });
  after(() => { escribirCola(colaOriginal); });

  test('sale con 0 sin output si no hay eventos pendientes', () => {
    escribirCola([{ id: '1', type: 'harness_error', tool: 'x', error: 'y', reported: true }]);
    const r = runScript(SCRIPT, ['push']);
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
  });

  test('clasifica mcp_failure como ALTA (regresion real: antes usaba e.sev, que no existe en los eventos reales)', () => {
    escribirCola([
      { id: '1', type: 'mcp_failure', tool: 'gemini-bridge', error: 'quota exceeded', reported: false },
    ]);
    const r = runScript(SCRIPT, ['push']);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /ALTA\s*\|\s*gemini-bridge/);
  });

  test('clasifica skill_gap como MEDIA y pattern como BAJA', () => {
    escribirCola([
      { id: '1', type: 'skill_gap', tool: 'n/a', error: 'sin skill para esto', reported: false },
      { id: '2', type: 'pattern', tool: 'n/a', error: 'tarea repetida', reported: false },
    ]);
    const r = runScript(SCRIPT, ['push']);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /MEDIA/);
    assert.match(r.stderr, /BAJA/);
  });

  test('modo pull: usa el banner [POST-PULL]', () => {
    escribirCola([{ id: '1', type: 'harness_error', tool: 'x', error: 'fallo', reported: false }]);
    const r = runScript(SCRIPT, ['pull']);
    assert.match(r.stderr, /\[POST-PULL\]/);
  });

  test('nunca bloquea (siempre exit 0) aunque haya eventos criticos', () => {
    escribirCola([{ id: '1', type: 'harness_error', tool: 'x', error: 'fallo grave', reported: false }]);
    const r = runScript(SCRIPT, ['push']);
    assert.equal(r.status, 0, 'git-queue-advisor solo informa, nunca bloquea push/pull');
  });

  test('sin modo detectado (ni argv ni CLAUDE_TOOL_INPUT_command): sale con 0', () => {
    const r = runScript(SCRIPT, []);
    assert.equal(r.status, 0);
  });

  test('sin argv, detecta el modo leyendo tool_input.command del JSON de stdin', () => {
    // Fallback secundario -- en produccion real hooks-definition.js siempre
    // pasa "push"/"pull" como argv[2] explicito, este path solo cubre un
    // caller futuro que invoque sin el argumento posicional.
    escribirCola([{ id: '1', type: 'harness_error', tool: 'x', error: 'fallo', reported: false }]);
    const evento = JSON.stringify({ tool_input: { command: 'git push origin main' } });
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: evento });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /\[GIT-QUEUE\]|ALTA|MEDIA|BAJA/, 'debe detectar modo push leyendo desde stdin');
  });
});

// ─── audit-market.js ──────────────────────────────────────────────────────────
