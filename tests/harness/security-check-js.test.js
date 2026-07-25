'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('security-check.js', () => {
  const SCRIPT = path.join(BIN, 'security-check.js');

  test('sale con 0 si no se pasa argumento', () => {
    const r = runScript(SCRIPT, []);
    assert.equal(r.status, 0);
  });

  test('sale con 0 en archivo sin hallazgos', () => {
    const f = path.join(os.tmpdir(), `sec-clean-${Date.now()}.js`);
    fs.writeFileSync(f, 'const x = 1;\nmodule.exports = x;\n');
    const r = runScript(SCRIPT, [f]);
    fs.unlinkSync(f);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  test('detecta credencial hardcodeada (sk-...)', () => {
    const f = path.join(os.tmpdir(), `sec-cred-${Date.now()}.js`);
    fs.writeFileSync(f, 'const key = "sk-abcdefghijklmnopqrstuvwxyz123456";\n');
    const r = runScript(SCRIPT, [f]);
    fs.unlinkSync(f);
    assert.ok(r.stdout.includes('[security-check]'), 'debe emitir hallazgo de seguridad');
    assert.ok(r.stdout.includes('SECRETO'), 'debe clasificar como SECRETO');
  });

  test('detecta eval() en codigo JS', () => {
    const f = path.join(os.tmpdir(), `sec-eval-${Date.now()}.js`);
    fs.writeFileSync(f, 'function run(code) { return eval(code); }\n');
    const r = runScript(SCRIPT, [f]);
    fs.unlinkSync(f);
    assert.ok(r.stdout.includes('[SEGURIDAD]'), 'debe detectar eval() como SEGURIDAD');
  });

  test('detecta catch vacio en JS', () => {
    const f = path.join(os.tmpdir(), `sec-catch-${Date.now()}.js`);
    fs.writeFileSync(f, 'try { doSomething(); } catch (e) {}\n');
    const r = runScript(SCRIPT, [f]);
    fs.unlinkSync(f);
    assert.ok(r.stdout.includes('[FALLO-SILENCIOSO]'), 'debe detectar catch vacio como FALLO-SILENCIOSO');
  });

  test('ignora extensiones no vigiladas (.md)', () => {
    const f = path.join(os.tmpdir(), `sec-md-${Date.now()}.md`);
    fs.writeFileSync(f, 'eval("bad") sk-secret\n');
    const r = runScript(SCRIPT, [f]);
    fs.unlinkSync(f);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  test('sin argv, lee tool_input.file_path del JSON de stdin', () => {
    // Regresion real: hooks-definition.js invoca este script con
    // "$CLAUDE_TOOL_INPUT_file_path" como argumento -- esa variable nunca
    // existio (confirmado contra code.claude.com/docs/en/hooks), asi que
    // argv[2] siempre llegaba vacio y el check nunca evaluaba un archivo real.
    const f = path.join(os.tmpdir(), `sec-stdin-${Date.now()}.js`);
    fs.writeFileSync(f, 'function run(code) { return eval(code); }\n');
    const evento = JSON.stringify({ tool_input: { file_path: f } });
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: evento });
    fs.unlinkSync(f);
    assert.ok(r.stdout.includes('[SEGURIDAD]'), 'debe leer la ruta real desde stdin y detectar eval()');
  });
});

// ─── secrets-guard.js ────────────────────────────────────────────────────────
