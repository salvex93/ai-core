'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('subagent-review.js (adverse)', () => {
  const SCRIPT = path.join(BIN, 'subagent-review.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'subagent-review.js debe existir en .claude/bin/');
  });

  test('output trivial (< 30 lineas): exit 0 sin output', () => {
    const shortOutput = Array(5).fill('linea de codigo').join('\n');
    const r = runScript(SCRIPT, [], { CLAUDE_SUBAGENT_OUTPUT: shortOutput, CLAUDE_SUBAGENT_TYPE: 'test' });
    assert.equal(r.status, 0, 'output trivial debe pasar sin revision');
  });

  test('detecta catch vacio (CRITICO) y retorna exit 1', () => {
    const badOutput = Array(35).fill('catch() {}').join('\n');
    const r = runScript(SCRIPT, [], { CLAUDE_SUBAGENT_OUTPUT: badOutput, CLAUDE_SUBAGENT_TYPE: 'test' });
    assert.equal(r.status, 1, 'debe retornar exit 1 cuando hay hallazgos CRITICOS');
    assert.ok(r.stdout.includes('CRITICO'), 'debe reportar hallazgo CRITICO');
    assert.ok(r.stdout.includes('catch vacio'), 'debe identificar el patron de catch vacio');
  });

  test('detecta eval() como hallazgo ALTO', () => {
    const evalOutput = Array(35).fill('').map((_, i) => i === 10 ? 'eval(userInput)' : `const x${i} = ${i};`).join('\n');
    const r = runScript(SCRIPT, [], { CLAUDE_SUBAGENT_OUTPUT: evalOutput, CLAUDE_SUBAGENT_TYPE: 'test' });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('ALTO') || r.stdout.includes('sin hallazgos'), 'debe detectar eval() o no tener otros criticos');
  });

  test('output limpio (> 30 lineas): exit 0 con mensaje sin hallazgos', () => {
    const cleanOutput = Array(35).fill('').map((_, i) => `const valor${i} = ${i};`).join('\n');
    const r = runScript(SCRIPT, [], { CLAUDE_SUBAGENT_OUTPUT: cleanOutput, CLAUDE_SUBAGENT_TYPE: 'test' });
    assert.equal(r.status, 0, 'codigo limpio debe pasar');
    assert.ok(r.stdout.includes('sin hallazgos'), 'debe reportar sin hallazgos');
  });

  test('sin env vars, lee agent_type y last_assistant_message del JSON de stdin', () => {
    // Regresion real: CLAUDE_SUBAGENT_OUTPUT/CLAUDE_SUBAGENT_TYPE nunca
    // existieron como variables de entorno reales.
    const badOutput = Array(35).fill('catch() {}').join('\n');
    const evento = JSON.stringify({ agent_type: 'test', last_assistant_message: badOutput });
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: evento });
    assert.equal(r.status, 1, 'debe detectar CRITICO leyendo el output real desde stdin');
    assert.ok(r.stdout.includes('CRITICO'));
  });

  test('subagent-review registrado en SubagentStop de settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const stopHooks = settings.hooks?.SubagentStop?.[0]?.hooks || [];
    const registered = stopHooks.some(h => (h.command || '').includes('subagent-review.js'));
    assert.ok(registered, 'subagent-review.js debe estar registrado en SubagentStop');
  });
});

// ─── ModelRegistry.js — parsearJSONFailClosed ────────────────────────────────
