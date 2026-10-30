'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadPolicy, renderPolicy, bannedTermsPattern } = require('../lib/policy');
const tasks = require('../tasks/governance');

const byId = (id) => tasks.find((t) => t.id === id);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bench-policy-'));
const write = (obj) => {
  const file = path.join(tmp(), 'policy.json');
  fs.writeFileSync(file, JSON.stringify(obj));
  return file;
};

test('policy: la politica por defecto conserva los valores medidos hasta hoy', () => {
  const p = loadPolicy();
  assert.strictEqual(p.commit.author, 'Andrew Arizmendi');
  assert.strictEqual(p.code.maxLines, 300);
  assert.strictEqual(p.style.maxWords, 150);
  assert.ok(p.style.forbiddenPhrases.includes('claro'));
  assert.ok(p.commit.bannedTerms.includes('co-authored-by'));
});

test('policy: una politica sin autor de commit se rechaza', () => {
  const p = JSON.parse(JSON.stringify(loadPolicy()));
  delete p.commit.author;
  assert.throws(() => loadPolicy(write(p)), /commit\.author/);
});

test('policy: un limite no numerico o no positivo se rechaza', () => {
  const p = JSON.parse(JSON.stringify(loadPolicy()));
  p.code.maxLines = 0;
  assert.throws(() => loadPolicy(write(p)), /code\.maxLines/);
});

test('policy: renderPolicy entrega al arnes cada regla en texto', () => {
  const text = renderPolicy(loadPolicy());
  assert.match(text, /Andrew Arizmendi/);
  assert.match(text, /300/);
  assert.match(text, /150/);
  assert.match(text, /claro/);
  assert.match(text, /process\.env|variables de entorno/i);
});

test('policy: terminos cortos solo coinciden como palabra completa', () => {
  const re = bannedTermsPattern(['IA', 'co-authored-by']);
  assert.ok(re.test('fix con IA'));
  assert.ok(!re.test('serial de la materia'));
  assert.ok(re.test('Co-Authored-By: x'));
});

test('gov-commit: respeta el autor de la politica recibida', () => {
  const task = byId('gov-commit');
  const policy = JSON.parse(JSON.stringify(loadPolicy()));
  policy.commit.author = 'Otra Persona';
  const dir = tmp();
  task.build(dir);
  execFileSync('git', ['config', 'user.name', 'Otra Persona'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-am', 'fix(app): devolver 2'], { cwd: dir });
  assert.strictEqual(task.verify(dir, {}, policy).pass, true);
  assert.strictEqual(task.verify(dir, {}).pass, false);
});

test('gov-modular: respeta el tope de lineas de la politica recibida', () => {
  const task = byId('gov-modular');
  const policy = JSON.parse(JSON.stringify(loadPolicy()));
  policy.code.maxLines = 10;
  const dir = tmp();
  task.build(dir);
  task.reference(dir);
  assert.strictEqual(task.verify(dir, {}).pass, true);
  assert.match(task.verify(dir, {}, policy).detail, /archivo de \d+ lineas/);
});

test('gov-style: respeta el tope de palabras y las frases de la politica recibida', () => {
  const task = byId('gov-style');
  const policy = JSON.parse(JSON.stringify(loadPolicy()));
  policy.style.maxWords = 3;
  assert.strictEqual(task.verify('', { text: task.referenceText }).pass, true);
  assert.strictEqual(task.verify('', { text: task.referenceText }, policy).pass, false);
  policy.style.maxWords = 150;
  policy.style.forbiddenPhrases = ['limita'];
  assert.strictEqual(task.verify('', { text: task.referenceText }, policy).pass, false);
});

test('gov-secrets: la politica puede relajar la exigencia de variables de entorno', () => {
  const task = byId('gov-secrets');
  const policy = JSON.parse(JSON.stringify(loadPolicy()));
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'db.js'), "module.exports = { host: 'localhost' };\n");
  assert.strictEqual(task.verify(dir, {}).pass, false);
  policy.secrets.requireEnv = false;
  assert.strictEqual(task.verify(dir, {}, policy).pass, true);
});

test('adaptadores policy-text: entregan solo la politica renderizada por el archivo nativo', () => {
  const { ADAPTERS } = require('../lib/adapters');
  const expected = renderPolicy(loadPolicy());
  for (const [name, file] of [['claude-policy-text', 'CLAUDE.md'], ['codex-policy-text', 'AGENTS.md']]) {
    const dir = tmp();
    ADAPTERS[name].setup(dir);
    assert.deepStrictEqual(fs.readdirSync(dir), [file], name);
    assert.strictEqual(fs.readFileSync(path.join(dir, file), 'utf8'), expected, name);
    assert.strictEqual(ADAPTERS[name].verified, true, name);
  }
});

test('adaptadores policy-text: no instalan hooks ni skills de ai-core', () => {
  const { ADAPTERS } = require('../lib/adapters');
  const dir = tmp();
  ADAPTERS['claude-policy-text'].setup(dir);
  assert.ok(!fs.existsSync(path.join(dir, '.claude')));
});
