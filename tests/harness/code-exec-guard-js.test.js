'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('code-exec-guard.js', () => {
  const SCRIPT = path.join(BIN, 'code-exec-guard.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'code-exec-guard.js debe existir en .claude/bin/');
  });

  function run(tool_input) {
    return spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: JSON.stringify({ tool_input }) });
  }

  test('sin stdin con datos: exit 0', () => {
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: '' });
    assert.equal(r.status, 0);
  });

  test('bloquea (exit 2) eval() en contenido .js nuevo (Write)', () => {
    const r = run({ file_path: 'x.js', content: 'function run(c) { return ' + 'eval' + '(c); }' });
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('CODE-EXEC-GUARD'));
  });

  test('bloquea (exit 2) eval() en new_string (Edit)', () => {
    const r = run({ file_path: 'x.js', old_string: 'const a = 1;', new_string: 'const a = 1;\n' + 'eval' + '(userInput);' });
    assert.equal(r.status, 2);
  });

  test('bloquea (exit 2) subprocess con shell=True en .py', () => {
    const r = run({ file_path: 'x.py', content: 'subprocess.run(cmd, shell=True)' });
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('shell=True'));
  });

  test('permite (exit 0) codigo limpio', () => {
    const r = run({ file_path: 'x.js', content: 'const suma = (a, b) => a + b;' });
    assert.equal(r.status, 0);
  });

  test('permite (exit 0) extensiones no vigiladas', () => {
    const r = run({ file_path: 'x.md', content: 'eval' + '(userInput)' });
    assert.equal(r.status, 0);
  });

  test('exime archivos .test.js del propio guard (evita bloquear fixtures de prueba)', () => {
    const r = run({ file_path: 'algo.test.js', content: 'eval' + '(userInput)' });
    assert.equal(r.status, 0, 'archivos de test deben poder contener el patron como dato de prueba');
  });

  test('code-exec-guard registrado en PreToolUse(Write|Edit) sin "|| true" que absorba el exit code', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const preHooks = (settings.hooks?.PreToolUse || [])
      .filter(h => h.matcher === 'Write|Edit')
      .flatMap(h => h.hooks || []);
    const cmd = preHooks.map(h => h.command || '').find(c => c.includes('code-exec-guard.js'));
    assert.ok(cmd, 'code-exec-guard.js debe estar registrado en PreToolUse(Write|Edit)');
    assert.ok(!cmd.includes('|| true'), 'el hook no debe absorber el exit code con || true');
  });
});

// ─── dependency-tracer.js ─────────────────────────────────────────────────────
