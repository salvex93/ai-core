'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('ponytail-check.js', () => {
  const SCRIPT = path.join(BIN, 'ponytail-check.js');

  test('el script existe y es ejecutable', () => {
    assert.ok(fs.existsSync(SCRIPT), 'ponytail-check.js debe existir en .claude/bin/');
  });

  test('sin input: termina sin error y sin output', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: '',
      CLAUDE_TOOL_INPUT_content: '',
    });
    assert.equal(r.status, 0, 'debe terminar con exit 0');
    assert.equal(r.stdout.trim(), '', 'no debe emitir output sin input');
  });

  test('detecta reimplementacion de stdlib: capitalize', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'src/utils.js',
      CLAUDE_TOOL_INPUT_content: 'function capitalizeFirst(s) { return s[0].toUpperCase()+s.slice(1); }',
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('PONYTAIL'), 'debe emitir advertencia PONYTAIL');
    assert.ok(r.stdout.includes('capitalize'), 'debe mencionar capitalize');
  });

  test('detecta reimplementacion de stdlib: unique/dedupe', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'src/utils.js',
      CLAUDE_TOOL_INPUT_content: 'function unique(arr) { return [...new Set(arr)]; }',
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('unique'), 'debe mencionar unique');
  });

  test('detecta reimplementacion de stdlib: deepClone', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'src/utils.js',
      CLAUDE_TOOL_INPUT_content: 'function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }',
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('structuredClone'), 'debe sugerir structuredClone');
  });

  test('detecta comentario YAGNI / future', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'src/service.js',
      CLAUDE_TOOL_INPUT_content: '// TODO: future extensible plugin system\nconst x = 1;',
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('YAGNI'), 'debe detectar comentario YAGNI');
  });

  test('detecta funcion con mas de 3 parametros', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'src/api.js',
      CLAUDE_TOOL_INPUT_content: 'function fetchData(url, method, headers, body, timeout) { }',
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Parametros'), 'debe advertir sobre exceso de parametros');
  });

  test('no emite advertencias en codigo limpio y minimal', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'src/clean.js',
      CLAUDE_TOOL_INPUT_content: [
        "'use strict';",
        'const BASE = 8;',
        'function espacio(n) { return n * BASE; }',
        'module.exports = { espacio };',
      ].join('\n'),
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'codigo limpio no debe generar advertencias');
  });

  test('no evalua archivos de tests (exempt)', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'tests/utils.test.js',
      CLAUDE_TOOL_INPUT_content: 'function deepClone(o) { return JSON.parse(JSON.stringify(o)); }',
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'archivos .test.js estan exentos de ponytail');
  });

  test('sin env vars, lee tool_input.file_path/content del JSON de stdin', () => {
    // Regresion real: CLAUDE_TOOL_INPUT_* nunca existieron como variables de
    // entorno reales -- este check siempre operaba sobre strings vacios,
    // sin fallback, nunca evaluo un archivo real en produccion.
    const evento = JSON.stringify({
      tool_input: { file_path: 'src/utils.js', content: 'function capitalizeFirst(s) { return s[0].toUpperCase()+s.slice(1); }' },
    });
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: evento });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('PONYTAIL'), 'debe evaluar el contenido real leido desde stdin');
  });

  test('ponytail-check esta registrado en PreToolUse de settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const preToolUse = settings.hooks?.PreToolUse || [];
    const writeEditHook = preToolUse.find(h => h.matcher === 'Write|Edit');
    assert.ok(writeEditHook, 'debe existir matcher Write|Edit en PreToolUse');
    const commands = (writeEditHook.hooks || []).map(h => h.command || '');
    const registered = commands.some(c => c.includes('ponytail-check.js'));
    assert.ok(registered, 'ponytail-check.js debe estar registrado en el hook Write|Edit');
  });
});
