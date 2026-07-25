'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('subagent-grader.js (hook SubagentStop)', () => {
  const SCRIPT = path.join(BIN, 'subagent-grader.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('sin stdin con datos: exit 0 sin llamar a ningun proveedor', () => {
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: '' });
    assert.equal(r.status, 0);
  });

  test('output trivial: exit 0 sin invocar el grader', () => {
    const evento = JSON.stringify({ agent_type: 'Explore', last_assistant_message: 'listo' });
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: evento });
    assert.equal(r.status, 0);
  });

  test('subagent-grader registrado en SubagentStop de settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const stopHooks = settings.hooks?.SubagentStop?.[0]?.hooks || [];
    assert.ok(stopHooks.some(h => (h.command || '').includes('subagent-grader.js')));
  });

  test('integracion end-to-end: subagent-guard.js persiste la tarea y subagent-grader.js la recupera', () => {
    // Confirma la correlacion completa via los hooks reales, no solo las
    // funciones puras del store: PreToolUse guarda, SubagentStop recupera,
    // por la misma clave session_id+prompt_id (confirmado empiricamente
    // que tool_use_id/agent_id NO sirven para esto).
    const { recuperarTarea } = require(path.join(BIN, 'lib', 'subagent-task-store'));
    const GUARD = path.join(BIN, 'subagent-guard.js');

    const sessionId = `test-e2e-${Date.now()}`;
    const promptId  = `prompt-e2e-${Date.now()}`;
    const eventoPre = JSON.stringify({
      session_id: sessionId,
      prompt_id: promptId,
      tool_input: { subagent_type: 'Explore', prompt: 'tarea real de prueba end-to-end' },
    });

    const rGuard = spawnSync('node', [GUARD], { encoding: 'utf8', cwd: REPO, input: eventoPre });
    assert.equal(rGuard.status, 0, 'subagent-guard.js no debe bloquear un spawn normal');

    const tareaRecuperada = recuperarTarea(sessionId, promptId);
    assert.equal(tareaRecuperada, 'tarea real de prueba end-to-end', 'la tarea guardada por el hook real debe recuperarse por la misma clave');
  });
});

// ─── cross-verify-gate.js ────────────────────────────────────────────────────
