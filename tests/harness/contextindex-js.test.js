'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('ContextIndex.js', () => {
  const { resolver, estaIndexado, leerSiIndexado, listarArchivos, diagnostico } =
    require(path.join(REPO, 'scripts', 'services', 'ContextIndex.js'));

  test('diagnostico: el mapa real de ai-core carga correctamente', () => {
    const d = diagnostico();
    assert.equal(d.estado, 'cargado');
    assert.ok(d.total_archivos > 0);
  });

  test('listarArchivos: retorna una lista no vacia de rutas', () => {
    const archivos = listarArchivos();
    assert.ok(Array.isArray(archivos));
    assert.ok(archivos.length > 0);
    assert.ok(archivos.includes('CLAUDE.md'), 'CLAUDE.md debe estar indexado en el mapa real');
  });

  test('resolver: encuentra un archivo real por ruta exacta', () => {
    const ruta = resolver('CLAUDE.md');
    assert.ok(ruta, 'debe resolver CLAUDE.md a una ruta absoluta');
    assert.ok(fs.existsSync(ruta));
  });

  test('resolver: retorna null para un archivo que no existe en el indice', () => {
    assert.equal(resolver('archivo-que-no-existe-jamas-12345.md'), null);
  });

  test('estaIndexado: true para archivo real, false para inexistente', () => {
    assert.equal(estaIndexado('CLAUDE.md'), true);
    assert.equal(estaIndexado('nunca-existira.xyz'), false);
  });

  test('leerSiIndexado: retorna contenido para archivo indexado', () => {
    const r = leerSiIndexado('CLAUDE.md');
    assert.ok(r);
    assert.match(r.contenido, /AI-CORE/);
  });

  test('leerSiIndexado: retorna null para archivo no indexado', () => {
    assert.equal(leerSiIndexado('no-existe.md'), null);
  });
});

// ─── RateLimiter.js ───────────────────────────────────────────────────────────
