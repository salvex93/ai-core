'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('dependency-tracer.js', () => {
  const SCRIPT = path.join(BIN, 'dependency-tracer.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'dependency-tracer.js debe existir en .claude/bin/');
  });

  test('sin argv, lee tool_input.file_path del JSON de stdin', () => {
    // Regresion real: hooks-definition.js invoca este script con
    // "$CLAUDE_TOOL_INPUT_file_path" como argumento -- esa variable nunca
    // existio (confirmado contra code.claude.com/docs/en/hooks).
    const evento = JSON.stringify({ tool_input: { file_path: path.join('scripts', 'services', 'ModelRegistry.js') } });
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: evento });
    assert.equal(r.status, 0);
  });
});
