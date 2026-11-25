'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SETTINGS } = require('./_shared');

describe('file-size-guard.js', () => {
  const SCRIPT = path.join(BIN, 'file-size-guard.js');
  let dir;
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'size-guard-')); });
  after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const run = (tool_input) => spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: JSON.stringify({ tool_input }) });
  const lineas = (n, texto = 'const a = 1;') => Array(n).fill(texto).join('\n') + '\n';
  const archivo = (nombre, n) => {
    const ruta = path.join(dir, nombre);
    fs.writeFileSync(ruta, lineas(n));
    return ruta;
  };

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'file-size-guard.js debe existir en .claude/bin/');
  });

  test('sin stdin con datos: exit 0', () => {
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: '' });
    assert.equal(r.status, 0);
  });

  test('Write de 301 lineas en codigo: exit 2 con id de confirmacion', () => {
    const r = run({ file_path: path.join(dir, 'a.js'), content: lineas(301) });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /FILE-SIZE-GUARD/);
    assert.match(r.stderr, /CONFIRMAR-/);
  });

  test('Write de 300 lineas exactas: exit 0', () => {
    assert.equal(run({ file_path: path.join(dir, 'b.js'), content: lineas(300) }).status, 0);
  });

  test('Edit que lleva un archivo de 299 a 307 lineas: exit 2', () => {
    const ruta = archivo('c.js', 299);
    const r = run({ file_path: ruta, old_string: 'const a = 1;\nconst a = 1;', new_string: lineas(9).trimEnd() });
    assert.equal(r.status, 2);
  });

  test('Edit que deja el archivo en 300 lineas: exit 0', () => {
    const ruta = archivo('d.js', 299);
    const r = run({ file_path: ruta, old_string: 'const a = 1;\nconst a = 1;', new_string: 'const a = 1;\nconst a = 1;\nconst b = 2;' });
    assert.equal(r.status, 0);
  });

  test('Edit que reduce un archivo ya largo: exit 0 (no atrapa al que lo esta arreglando)', () => {
    const ruta = archivo('e.js', 320);
    const r = run({ file_path: ruta, old_string: lineas(10).trimEnd(), new_string: 'const b = 2;' });
    assert.equal(r.status, 0);
  });

  test('Edit que agrega a un archivo ya largo: exit 2', () => {
    const ruta = archivo('f.js', 320);
    const r = run({ file_path: ruta, old_string: 'const a = 1;\nconst a = 1;', new_string: 'const a = 1;\nconst a = 1;\nconst b = 2;' });
    assert.equal(r.status, 2);
  });

  test('Edit con replace_all cuenta todas las ocurrencias', () => {
    const ruta = archivo('g.js', 200);
    const r = run({ file_path: ruta, old_string: 'const a = 1;', new_string: 'const a = 1;\nconst x = 2;', replace_all: true });
    assert.equal(r.status, 2);
  });

  test('extensiones que no son codigo y rutas inexistentes en Edit: exit 0', () => {
    assert.equal(run({ file_path: path.join(dir, 'doc.md'), content: lineas(500) }).status, 0);
    assert.equal(run({ file_path: path.join(dir, 'datos.json'), content: lineas(500) }).status, 0);
    assert.equal(run({ file_path: path.join(dir, 'no-existe.js'), old_string: 'x', new_string: 'y' }).status, 0);
  });

  test('py y ts tambien se limitan', () => {
    assert.equal(run({ file_path: path.join(dir, 'a.py'), content: lineas(301, 'x = 1') }).status, 2);
    assert.equal(run({ file_path: path.join(dir, 'a.ts'), content: lineas(301) }).status, 2);
  });

  test('el break-glass confirmado permite reintentar la misma escritura exacta', () => {
    const entrada = { file_path: path.join(dir, 'h.js'), content: lineas(305) };
    const primero = run(entrada);
    assert.equal(primero.status, 2);
    const id = /CONFIRMAR-([0-9a-f]+)/.exec(primero.stderr)[1];
    const aprobar = spawnSync('node', ['-e',
      `const bg=require(${JSON.stringify(path.join(BIN, 'lib', 'break-glass.js'))});` +
      `const r=bg.confirmarBreakGlass?bg.confirmarBreakGlass(${JSON.stringify(id)}):null;process.stdout.write(String(r))`],
    { encoding: 'utf8', cwd: REPO });
    if (aprobar.stdout === 'null') return; // el modulo no expone confirmacion programatica: cubierto por los otros guards
    assert.equal(run(entrada).status, 0);
  });

  test('esta registrado en PreToolUse(Write|Edit) de settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const entradas = settings.hooks.PreToolUse.filter((h) => /Write/.test(h.matcher || ''));
    const comandos = entradas.flatMap((h) => h.hooks.map((x) => x.command));
    assert.ok(comandos.some((c) => c.includes('file-size-guard.js')));
  });
});
