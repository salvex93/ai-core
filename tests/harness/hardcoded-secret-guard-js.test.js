'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SETTINGS } = require('./_shared');

describe('hardcoded-secret-guard.js', () => {
  const SCRIPT = path.join(BIN, 'hardcoded-secret-guard.js');

  function run(tool_input) {
    return spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: JSON.stringify({ tool_input }) });
  }

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'hardcoded-secret-guard.js debe existir en .claude/bin/');
  });

  test('sin stdin con datos: exit 0', () => {
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: '' });
    assert.equal(r.status, 0);
  });

  test('bloquea (exit 2) una password literal en codigo JS (Write)', () => {
    const r = run({ file_path: 'db.js', content: "module.exports = { host: 'localhost', password: 'Sup3rS3cret!' };\n" });
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('HARDCODED-SECRET-GUARD'));
    assert.ok(!r.stderr.includes('Sup3rS3cret!'), 'el mensaje no debe repetir el valor del secreto');
  });

  test('bloquea (exit 2) una api key literal en new_string (Edit)', () => {
    const r = run({ file_path: 'src/client.ts', old_string: 'const a = 1;', new_string: 'const apiKey = "abcd1234efgh5678";' });
    assert.equal(r.status, 2);
  });

  test('bloquea (exit 2) una constante Python con password literal', () => {
    const r = run({ file_path: 'conf.py', content: 'DB_PASSWORD = "hunter2hunter2"\n' });
    assert.equal(r.status, 2);
  });

  test('bloquea (exit 2) una clave JSON entrecomillada', () => {
    const r = run({ file_path: 'cfg.js', content: 'const c = { "client_secret": "abcdef123456" };' });
    assert.equal(r.status, 2);
  });

  test('permite (exit 0) leer la credencial de process.env', () => {
    const r = run({ file_path: 'db.js', content: 'module.exports = { password: process.env.DB_PASSWORD };\n' });
    assert.equal(r.status, 0);
  });

  test('permite (exit 0) comparaciones y valores cortos', () => {
    assert.equal(run({ file_path: 'a.js', content: "if (password === 'abcdefgh') {}\n" }).status, 0);
    assert.equal(run({ file_path: 'a.js', content: "const password = '';\n" }).status, 0);
  });

  test('permite (exit 0) placeholders evidentes e interpolaciones', () => {
    assert.equal(run({ file_path: 'a.js', content: "const password = 'changeme';\n" }).status, 0);
    assert.equal(run({ file_path: 'a.js', content: "const token = '<tu-token>';\n" }).status, 0);
    assert.equal(run({ file_path: 'a.js', content: 'const secret = `${prefix}-valor`;\n' }).status, 0);
  });

  test('permite (exit 0) tests, fixtures, documentacion y .env', () => {
    const content = "const password = 'Sup3rS3cret!';\n";
    assert.equal(run({ file_path: 'db.test.js', content }).status, 0);
    assert.equal(run({ file_path: 'tests/fixtures/db.js', content }).status, 0);
    assert.equal(run({ file_path: 'README.md', content }).status, 0);
    assert.equal(run({ file_path: '.env', content: 'DB_PASSWORD=Sup3rS3cret!\n' }).status, 0);
  });

  test('esta registrado en PreToolUse(Write|Edit) de settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const entradas = settings.hooks.PreToolUse.filter((h) => /Write/.test(h.matcher || ''));
    const comandos = entradas.flatMap((h) => h.hooks.map((x) => x.command));
    assert.ok(comandos.some((c) => c.includes('hardcoded-secret-guard.js')));
  });
});
