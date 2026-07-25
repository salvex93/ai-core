'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('bash-verbosity-guard.js', () => {
  const GUARD = path.join(BIN, 'bash-verbosity-guard.js');

  function run(cmd) {
    return runScript(GUARD, [], { CLAUDE_TOOL_INPUT_command: cmd });
  }

  test('sale con codigo 0 si no hay comando', () => {
    const r = runScript(GUARD, []);
    assert.equal(r.status, 0, 'debe permitir cuando no hay comando en el env');
  });

  test('bloquea "git log" sin acotar', () => {
    const r = run('git log');
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('BASH-VERBOSITY-GUARD'));
  });

  test('permite "git log --oneline -n"', () => {
    assert.equal(run('git log --oneline -n 10').status, 0);
  });

  test('permite "git log | head"', () => {
    assert.equal(run('git log | head -20').status, 0);
  });

  test('bloquea "git diff" a secas', () => {
    assert.equal(run('git diff').status, 2);
  });

  test('bloquea "git diff --cached" sin archivo', () => {
    assert.equal(run('git diff --cached').status, 2);
  });

  test('permite "git diff" con archivos especificos', () => {
    assert.equal(run('git diff CLAUDE.md package.json').status, 0);
  });

  test('permite "git diff --stat"', () => {
    assert.equal(run('git diff --stat').status, 0);
  });

  test('bloquea "cat" de archivo sin acotar', () => {
    assert.equal(run('cat package.json').status, 2);
  });

  test('permite "cat" con head/tail/grep', () => {
    assert.equal(run('cat file.txt | head -50').status, 0);
  });

  test('permite "cat /dev/null"', () => {
    assert.equal(run('cat /dev/null').status, 0);
  });

  test('bloquea "find -name" sin maxdepth', () => {
    assert.equal(run("find . -name '*.js'").status, 2);
  });

  test('permite "find" con -maxdepth', () => {
    assert.equal(run("find . -maxdepth 1 -name '*.js'").status, 0);
  });

  test('permite comandos no relacionados (npm test, git status)', () => {
    assert.equal(run('npm test').status, 0);
    assert.equal(run('git status --short').status, 0);
  });

  test('sin CLAUDE_TOOL_INPUT_command, lee tool_input.command del JSON de stdin (contrato real de hooks Claude Code)', () => {
    // Regresion real: CLAUDE_TOOL_INPUT_command nunca existio en runtime real
    // (confirmado contra code.claude.com/docs/en/hooks y el issue
    // anthropics/claude-code#9567) -- el comando real llega por stdin como
    // JSON (tool_input.command). Sin este test, el guard quedaba inerte en
    // produccion pese a pasar todos los tests anteriores (que inyectan la
    // env var a mano, algo que Claude Code nunca hace).
    const evento = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git log' } });
    const r = spawnSync('node', [GUARD], { encoding: 'utf8', cwd: REPO, input: evento });
    assert.equal(r.status, 2, 'debe bloquear leyendo el comando real desde stdin');
    assert.ok(r.stderr.includes('BASH-VERBOSITY-GUARD'));
  });

  test('sin CLAUDE_TOOL_INPUT_command y sin stdin con datos, no bloquea y no lanza excepcion', () => {
    const r = spawnSync('node', [GUARD], { encoding: 'utf8', cwd: REPO, input: '' });
    assert.equal(r.status, 0);
  });
});

// ─── memory-vault-prune-check.js ─────────────────────────────────────────────
