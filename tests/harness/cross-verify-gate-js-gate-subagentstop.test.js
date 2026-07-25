'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('cross-verify-gate.js (gate SubagentStop)', () => {
  const SCRIPT = path.join(BIN, 'cross-verify-gate.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'cross-verify-gate.js debe existir en .claude/bin/');
  });

  test('subagente distinto de code-reviewer: exit 0 sin activar el gate', () => {
    const r = runScript(SCRIPT, [], { CLAUDE_SUBAGENT_TYPE: 'security-scanner', CLAUDE_SUBAGENT_OUTPUT: 'VEREDICTO: APROBADO' });
    assert.equal(r.status, 0, 'solo debe activarse para el subagente code-reviewer');
  });

  test('code-reviewer sin veredicto APROBADO: exit 0 sin activar el gate', () => {
    const r = runScript(SCRIPT, [], { CLAUDE_SUBAGENT_TYPE: 'code-reviewer', CLAUDE_SUBAGENT_OUTPUT: 'VEREDICTO: BLOQUEADO' });
    assert.equal(r.status, 0, 'BLOQUEADO/REQUIERE_CAMBIOS no necesita segunda opinion');
  });

  test('sin env vars, lee agent_type y last_assistant_message del JSON de stdin', () => {
    // Regresion real: CLAUDE_SUBAGENT_TYPE/CLAUDE_SUBAGENT_OUTPUT nunca
    // existieron como variables de entorno reales.
    const evento = JSON.stringify({ agent_type: 'security-scanner', last_assistant_message: 'VEREDICTO: APROBADO' });
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: evento });
    assert.equal(r.status, 0, 'solo se activa para code-reviewer, leyendo el tipo real desde stdin');
  });

  test('cross-verify-gate registrado en SubagentStop de settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const stopHooks = settings.hooks?.SubagentStop?.[0]?.hooks || [];
    const registered = stopHooks.some(h => (h.command || '').includes('cross-verify-gate.js'));
    assert.ok(registered, 'cross-verify-gate.js debe estar registrado en SubagentStop');
  });
});

// ─── injection-guard.js ──────────────────────────────────────────────────────
