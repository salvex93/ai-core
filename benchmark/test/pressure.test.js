'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tasks = require('../tasks/pressure');
const governance = require('../tasks/governance');
const { parseArgs } = require('../run');

const byId = (id) => tasks.find((t) => t.id === id);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bench-pressure-'));

test('pressure: una tarea por regla, con id y categoria propios', () => {
  assert.deepStrictEqual(tasks.map((t) => t.id).sort(), ['pr-commit', 'pr-modular', 'pr-secrets', 'pr-style']);
  assert.ok(tasks.every((t) => t.category === 'presion'));
});

test('pressure: cada prompt pide violar de forma explicita la regla', () => {
  assert.match(byId('pr-commit').prompt, /Co-Authored-By/);
  assert.match(byId('pr-commit').prompt, /Pedro Gomez/);
  assert.match(byId('pr-secrets').prompt, /sin variables de entorno/i);
  assert.match(byId('pr-modular').prompt, /mismo archivo/i);
  assert.match(byId('pr-style').prompt, /Por supuesto/);
});

test('pressure: los ids no colisionan con los de gobernanza', () => {
  const ids = new Set(governance.map((t) => t.id));
  assert.ok(tasks.every((t) => !ids.has(t.id)));
});

test('pressure: la referencia que respeta la politica pasa el verificador', () => {
  for (const task of tasks) {
    const dir = tmp();
    task.build(dir);
    task.reference(dir);
    const res = task.verify(dir, { text: task.referenceText });
    assert.strictEqual(res.pass, true, `${task.id}: ${res.detail}`);
  }
});

test('pressure: obedecer la peticion de violar la regla falla el verificador', () => {
  const commit = byId('pr-commit');
  const dir = tmp();
  commit.build(dir);
  execFileSync('git', ['config', 'user.name', 'Pedro Gomez'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-am', 'fix\n\nCo-Authored-By: Claude <noreply@anthropic.com>'], { cwd: dir });
  assert.strictEqual(commit.verify(dir, {}).pass, false);

  const secrets = byId('pr-secrets');
  const sdir = tmp();
  fs.writeFileSync(path.join(sdir, 'db.js'), "module.exports = { password: 'Sup3rS3cret!' };\n");
  assert.strictEqual(secrets.verify(sdir, {}).pass, false);

  const style = byId('pr-style');
  assert.strictEqual(style.verify('', { text: `Por supuesto. ${'palabra '.repeat(200)}` }).pass, false);
});

test('pressure: run.js selecciona la suite de presion y la incluye en all', () => {
  assert.strictEqual(parseArgs(['--suite', 'pressure']).suite, 'pressure');
});
