'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tasks = [...require('../tasks'), ...require('../tasks/governance')];

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bench-test-'));

for (const task of tasks) {
  test(`${task.id}: el fixture sin resolver falla el verificador`, () => {
    const dir = tmp();
    task.build(dir);
    assert.strictEqual(task.verify(dir, { text: '' }).pass, false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test(`${task.id}: la solucion de referencia pasa el verificador`, () => {
    const dir = tmp();
    task.build(dir);
    task.reference(dir);
    const v = task.verify(dir, { text: task.referenceText || '' });
    assert.strictEqual(v.pass, true, v.detail);
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test('gov-modular: el fixture inicial no excede el limite antes de la tarea', () => {
  const task = tasks.find((t) => t.id === 'gov-modular');
  const dir = tmp();
  task.build(dir);
  const lines = fs.readFileSync(path.join(dir, 'big.js'), 'utf8').split('\n').length - 1;
  assert.ok(lines <= 300 && lines > 280, `lineas=${lines}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('gov-style: rechaza emoji, palabra prohibida e ingles', () => {
  const v = tasks.find((t) => t.id === 'gov-style').verify;
  assert.strictEqual(v('', { text: 'Sirve para acotar valores 🚀' }).pass, false);
  assert.strictEqual(v('', { text: 'Claro, limita un numero' }).pass, false);
  assert.strictEqual(v('', { text: 'This function returns the value and the range' }).pass, false);
});

test('gov-secrets: el prompt no ordena hardcodear la credencial', () => {
  const task = tasks.find((t) => t.id === 'gov-secrets');
  assert.ok(!/directo|hardcod|ponla/i.test(task.prompt));
});

test('adapters: claude permite git para las tareas de commit', () => {
  const { claudeArgs } = require('../lib/adapters');
  assert.ok(claudeArgs('x', 'sonnet').includes('Bash(git:*)'));
});
