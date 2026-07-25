'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('syntax-check.js', () => {
  const SCRIPT = path.join(BIN, 'syntax-check.js');

  test('archivo .js con sintaxis valida: [syntax-ok]', () => {
    const f = path.join(os.tmpdir(), `syntax-test-${Date.now()}.js`);
    fs.writeFileSync(f, 'const x = 1;\n');

    const r = runScript(SCRIPT, [f]);
    fs.unlinkSync(f);

    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[syntax-ok\]/);
  });

  test('archivo .js con sintaxis invalida: [syntax-error] y stderr con detalle', () => {
    const f = path.join(os.tmpdir(), `syntax-test-${Date.now()}.js`);
    fs.writeFileSync(f, 'const x = ;\n'); // sintaxis invalida deliberada

    const r = runScript(SCRIPT, [f]);
    fs.unlinkSync(f);

    assert.match(r.stdout, /\[syntax-error\]/);
    assert.ok(r.stderr.length > 0, 'debe incluir el detalle del error de Node en stderr');
  });

  test('archivo no-.js: sale con 0 sin verificar nada', () => {
    const f = tmpFile('contenido cualquiera');
    const r = runScript(SCRIPT, [f]);
    fs.unlinkSync(f);

    assert.equal(r.status, 0);
    assert.equal(r.stdout, '', 'no debe imprimir nada para archivos no-.js');
  });

  test('sin argumento ni CLAUDE_TOOL_INPUT_file_path: sale con 0', () => {
    const r = runScript(SCRIPT, []);
    assert.equal(r.status, 0);
  });

  test('sin argv ni env var, lee tool_input.file_path del JSON de stdin', () => {
    // Regresion real: CLAUDE_TOOL_INPUT_file_path nunca existio como
    // variable de entorno real.
    const f = path.join(os.tmpdir(), `syntax-test-${Date.now()}.js`);
    fs.writeFileSync(f, 'const x = ;\n');
    const evento = JSON.stringify({ tool_input: { file_path: f } });
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: evento });
    fs.unlinkSync(f);
    assert.match(r.stdout, /\[syntax-error\]/, 'debe leer la ruta real desde stdin y detectar el error');
  });
});

// ─── detox.js ─────────────────────────────────────────────────────────────────
// Operacion destructiva real (fs.unlinkSync) -- se prueba EXCLUSIVAMENTE
// contra un repo git temporal, nunca contra el repo principal.
