'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installAiCore, ADAPTERS } = require('../lib/adapters');
const { removeHooks } = require('../lib/variants');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bench-githooks-'));
const git = (dir, ...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });

function repo() {
  const dir = tmp();
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 'Andrew Arizmendi');
  git(dir, 'config', 'user.email', 'salvex93@gmail.com');
  fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
  git(dir, 'add', 'a.js');
  return dir;
}

test('githooks: instalar ai-core en un repo activa los hooks de commit de git', () => {
  const dir = repo();
  installAiCore(dir);
  assert.strictEqual(git(dir, 'config', 'core.hooksPath').stdout.trim(), '.githooks');
  assert.ok(fs.existsSync(path.join(dir, '.githooks', 'commit-msg')));
});

test('githooks: un mensaje con Co-Authored-By se rechaza y uno limpio pasa', () => {
  const dir = repo();
  installAiCore(dir);
  const bad = git(dir, 'commit', '-m', 'fix\n\nCo-Authored-By: Claude <noreply@anthropic.com>');
  assert.notStrictEqual(bad.status, 0);
  assert.strictEqual(git(dir, 'rev-list', '--count', '--all').stdout.trim(), '0');
  const ok = git(dir, 'commit', '-m', 'fix(app): devolver 2');
  assert.strictEqual(ok.status, 0, ok.stderr);
});

test('githooks: una identidad de autor ajena se rechaza', () => {
  const dir = repo();
  installAiCore(dir);
  git(dir, 'config', 'user.name', 'Pedro Gomez');
  assert.notStrictEqual(git(dir, 'commit', '-m', 'fix(app): devolver 2').status, 0);
});

test('githooks: fuera de un repo git la instalacion no falla', () => {
  const dir = tmp();
  assert.doesNotThrow(() => installAiCore(dir));
  assert.ok(!fs.existsSync(path.join(dir, '.githooks')));
});

test('githooks: la variante sin hooks tambien quita los hooks de git', () => {
  const dir = repo();
  ADAPTERS['ai-core-no-hooks'].setup(dir);
  assert.ok(!fs.existsSync(path.join(dir, '.githooks')));
  assert.strictEqual(git(dir, 'config', 'core.hooksPath').stdout.trim(), '');
  assert.strictEqual(typeof removeHooks, 'function');
});

test('githooks: el adaptador policy-text no activa hooks de git', () => {
  const dir = repo();
  ADAPTERS['claude-policy-text'].setup(dir);
  assert.strictEqual(git(dir, 'config', 'core.hooksPath').stdout.trim(), '');
});
