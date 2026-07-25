'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('moa-context-gatherer.js (fan-out MoA en UserPromptSubmit)', () => {
  const SCRIPT = path.join(BIN, 'moa-context-gatherer.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'moa-context-gatherer.js debe existir en .claude/bin/');
  });

  test('sin ambas API keys, sale con 0 sin invocar la red', () => {
    const r = runScript(SCRIPT, [], { GEMINI_API_KEY: '', DEEPSEEK_API_KEY: '' });
    assert.equal(r.status, 0);
  });

  test('sin CLAUDE_USER_PROMPT ni stdin con datos, sale con 0 sin invocar la red', () => {
    // Regresion real: CLAUDE_USER_PROMPT nunca existio como variable de
    // entorno real -- el prompt llega por stdin (prompt_text). Sin el fix,
    // userPrompt siempre era '' y el guard de "no hay prompt" enmascaraba
    // el bug de raiz (parecia funcionar porque nunca intentaba la red).
    const r = spawnSync('node', [SCRIPT], {
      encoding: 'utf8', cwd: REPO, input: '',
      env: { ...process.env, GEMINI_API_KEY: 'x', DEEPSEEK_API_KEY: 'x' },
    });
    assert.equal(r.status, 0);
  });
});

// ─── health-sync.js — checkSkills / checkDependencies ────────────────────────
