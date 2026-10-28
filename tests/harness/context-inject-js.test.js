'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { BIN } = require('./_shared');
const {
  SECTIONS, SECTIONS_DIR, seleccionarSecciones, leerSeccion, componerContexto,
} = require(path.join(BIN, 'lib', 'context-sections.js'));

describe('context-sections', () => {
  test('cada seccion declarada tiene su archivo con contenido', () => {
    for (const s of SECTIONS) {
      const texto = leerSeccion(s.file);
      assert.ok(texto && texto.length > 50, `${s.file} debe existir y tener contenido`);
    }
    assert.ok(fs.existsSync(SECTIONS_DIR));
  });

  test('prompt de commit selecciona commits-staging', () => {
    assert.ok(seleccionarSecciones('haz commit y push de los cambios').includes('commits-staging.md'));
  });

  test('prompt de subagentes selecciona gobierno-subagentes', () => {
    assert.ok(seleccionarSecciones('lanza un subagente en paralelo').includes('gobierno-subagentes.md'));
  });

  test('acentos no impiden el calce de patrones', () => {
    assert.ok(seleccionarSecciones('redacta una cotización').includes('propuestas-comerciales.md'));
  });

  test('prompt sin palabras clave no inyecta nada', () => {
    assert.deepEqual(seleccionarSecciones('corrige el typo en la linea 3'), []);
    assert.equal(componerContexto('corrige el typo en la linea 3'), '');
  });

  test('leerSeccion devuelve null si el archivo no existe', () => {
    assert.equal(leerSeccion('no-existe.md'), null);
  });
});

describe('context-inject.js', () => {
  const SCRIPT = path.join(BIN, 'context-inject.js');
  const correr = (prompt) => spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ prompt }), encoding: 'utf8',
  });

  test('inyecta el bloque cuando el prompt calza', () => {
    const r = correr('prepara el commit');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /CONTEXTO AI-CORE BAJO DEMANDA/);
    assert.match(r.stdout, /git add/);
  });

  test('no emite nada cuando el prompt no calza', () => {
    const r = correr('renombra la variable x');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  test('leerSeccion no calla un fallo de lectura real: lo reporta por stderr', () => {
    const chunks = [];
    const orig = process.stderr.write;
    process.stderr.write = (c) => { chunks.push(String(c)); return true; };
    try {
      assert.equal(leerSeccion('no-existe.md', SECTIONS_DIR), null);
      assert.equal(leerSeccion('x.md', path.join(SECTIONS_DIR, 'roles-y-estilo.md')), null);
    } finally {
      process.stderr.write = orig;
    }
    assert.equal(chunks.length, 1, 'ENOENT es silencioso; otro error se reporta');
    assert.match(chunks[0], /\[context-sections\]/);
  });

  test('el generador del hook no descarta stderr de context-inject', () => {
    const { buildSessionHooks } = require(path.join(BIN, 'lib', 'hooks-events-session.js'));
    const ctx = { bin: (s) => s, nodeConPermiso: (s) => 'node ' + s, soloRead: {}, soloLeerRepo: {}, readYWrite: {}, readYWriteSubagentLocks: {}, breakGlassRW: {}, repoReadWrite: {}, repoConGit: {} };
    const cmd = buildSessionHooks(ctx).UserPromptSubmit[0].hooks.map((h) => h.command).find((c) => c.includes('context-inject.js'));
    assert.doesNotMatch(cmd, /2>\/dev\/null/);
    assert.match(cmd, /2>>\/tmp\/ai-core-hook-errors\.log \|\| true$/);
  });

  test('perfil soloLeerRepo concede lectura de context-sections aunque PWD sea otro directorio', () => {
    const { buildPermissionProfiles } = require(path.join(BIN, 'lib', 'hooks-permissions.js'));
    const perfiles = buildPermissionProfiles((s) => `"${path.join('/core/.claude/bin', s)}"`, '/tmp');
    assert.ok(perfiles.soloLeerRepo.fsRead.includes('"/core/.claude/context-sections/*"'));
  });

  test('stdin invalido no rompe el hook', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { input: 'no-json', encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
});
