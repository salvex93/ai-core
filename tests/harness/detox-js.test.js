'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { execSync, spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('detox.js', () => {
  const SCRIPT = path.join(BIN, 'detox.js');
  let tmpRepo;

  function crearRepoConArchivosMd() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detox-test-'));
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });
    fs.writeFileSync(path.join(dir, 'README.md'), '# trackeado, no tocar\n');
    execSync('git add README.md', { cwd: dir });
    execSync('git commit -q -m "inicial"', { cwd: dir });
    return dir;
  }

  // runScript() usa cwd: REPO (fijo al repo principal) -- detox.js resuelve
  // su raiz via "git rev-parse --show-toplevel", asi que necesita correr con
  // cwd apuntando al repo temporal, no al principal. spawnSync directo.
  function runEnRepoTemporal(dir) {
    return spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: dir });
  }

  test('elimina .md legacy sin trackear con prefijo conocido', () => {
    tmpRepo = crearRepoConArchivosMd();
    fs.writeFileSync(path.join(tmpRepo, 'REPORT-2024.md'), 'legacy');
    fs.writeFileSync(path.join(tmpRepo, 'TO_GEMINI.md'), 'legacy');

    const r = runEnRepoTemporal(tmpRepo);
    fs.rmSync(tmpRepo, { recursive: true, force: true });

    assert.equal(r.status, 0);
    assert.match(r.stderr, /2 archivo\(s\) legacy eliminados/);
  });

  test('NUNCA elimina un .md trackeado en git, aunque tenga prefijo legacy', () => {
    tmpRepo = crearRepoConArchivosMd();
    fs.writeFileSync(path.join(tmpRepo, 'REPORT-trackeado.md'), 'no deberia borrarse');
    execSync('git add REPORT-trackeado.md', { cwd: tmpRepo });
    execSync('git commit -q -m "trackear reporte legacy a proposito"', { cwd: tmpRepo });

    runEnRepoTemporal(tmpRepo);
    const sobrevivio = fs.existsSync(path.join(tmpRepo, 'REPORT-trackeado.md'));
    fs.rmSync(tmpRepo, { recursive: true, force: true });

    assert.ok(sobrevivio, 'un archivo trackeado en git nunca debe eliminarse sin importar el nombre');
  });

  test('no elimina .md sin trackear que NO tenga prefijo legacy conocido', () => {
    tmpRepo = crearRepoConArchivosMd();
    fs.writeFileSync(path.join(tmpRepo, 'notas-personales.md'), 'contenido del usuario');

    runEnRepoTemporal(tmpRepo);
    const sobrevivio = fs.existsSync(path.join(tmpRepo, 'notas-personales.md'));
    fs.rmSync(tmpRepo, { recursive: true, force: true });

    assert.ok(sobrevivio, 'archivos .md sin prefijo legacy conocido no deben tocarse');
  });
});

// ─── health-report.js ─────────────────────────────────────────────────────────
// Modulo puro (segun su propio docstring: "no toca disco, no hace checks") --
// se prueba con datos mock, sin necesidad de correr los checks reales.
