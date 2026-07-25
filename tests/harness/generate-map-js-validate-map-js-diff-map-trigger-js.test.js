'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { execSync, spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('generate-map.js / validate-map.js / diff-map-trigger.js', () => {
  const GENERATE_MAP = path.join(BIN, 'generate-map.js');
  const VALIDATE_MAP = path.join(BIN, 'validate-map.js');
  const DIFF_TRIGGER = path.join(BIN, 'diff-map-trigger.js');

  let tmpRepo;

  function crearRepoGitTemporal() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'map-test-'));
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });
    fs.writeFileSync(path.join(dir, 'a.js'), 'const a = 1;\n');
    fs.writeFileSync(path.join(dir, 'b.js'), 'const b = 2;\n');
    execSync('git add -A', { cwd: dir });
    execSync('git commit -q -m "inicial"', { cwd: dir });
    return dir;
  }

  before(() => { tmpRepo = crearRepoGitTemporal(); });
  after(() => { fs.rmSync(tmpRepo, { recursive: true, force: true }); });

  test('generate-map.js crea CONTEXT_MAP.json con los archivos reales del repo', () => {
    const r = spawnSync('node', [GENERATE_MAP], { encoding: 'utf8', cwd: tmpRepo });
    assert.equal(r.status, 0, `debe salir 0 (stderr: ${r.stderr})`);

    const mapPath = path.join(tmpRepo, '.claude', 'CONTEXT_MAP.json');
    assert.ok(fs.existsSync(mapPath), 'debe crear .claude/CONTEXT_MAP.json');

    const mapa = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    assert.equal(mapa.host.total_files, 2, 'debe contar exactamente los 2 archivos trackeados (a.js, b.js)');
    assert.deepEqual(mapa.host.root_files.sort(), ['a.js', 'b.js']);

    // Comitear el mapa igual que en el repo real (ver git ls-files
    // .claude/CONTEXT_MAP.json en ai-core). El primer commit deja el mapa
    // reportando total_files=2 (no se incluye a si mismo, aun no existia al
    // generarse) -- regenerar una segunda vez para que el conteo YA incluya
    // su propia presencia trackeada, e igualar el estado estable real.
    execSync('git add .claude/CONTEXT_MAP.json', { cwd: tmpRepo });
    execSync('git commit -q -m "trackear mapa"', { cwd: tmpRepo });

    const r2 = spawnSync('node', [GENERATE_MAP], { encoding: 'utf8', cwd: tmpRepo });
    assert.equal(r2.status, 0);
    execSync('git add .claude/CONTEXT_MAP.json', { cwd: tmpRepo });
    execSync('git commit -q -m "mapa incluye su propia presencia" --allow-empty', { cwd: tmpRepo });
  });

  test('validate-map.js no reporta drift cuando el mapa esta sincronizado', () => {
    // El mapa ya fue generado por el test anterior y coincide con git ls-files
    const r = spawnSync('node', [VALIDATE_MAP], { encoding: 'utf8', cwd: tmpRepo });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '', 'sin drift no debe emitir ningun aviso');
  });

  test('validate-map.js detecta drift (DRIFT_THRESHOLD=1) y regenera el mapa', () => {
    // Agregar un archivo nuevo sin regenerar el mapa manualmente -- simula
    // el escenario real que motivo bajar el umbral de 3 a 1. Solo se
    // trackea c.js (no -A) para que el mapa recien commiteado no se cuente
    // dos veces en el siguiente git ls-files.
    fs.writeFileSync(path.join(tmpRepo, 'c.js'), 'const c = 3;\n');
    execSync('git add c.js', { cwd: tmpRepo });
    execSync('git commit -q -m "agrega c.js"', { cwd: tmpRepo });

    const r = spawnSync('node', [VALIDATE_MAP], { encoding: 'utf8', cwd: tmpRepo });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /Drift detectado/, 'debe reportar el drift de 1 archivo');

    const mapa = JSON.parse(fs.readFileSync(path.join(tmpRepo, '.claude', 'CONTEXT_MAP.json'), 'utf8'));
    // 4 = a.js + b.js + CONTEXT_MAP.json (ya trackeado desde el test anterior) + c.js
    assert.equal(mapa.host.total_files, 4, 'debe haber regenerado el mapa incluyendo c.js');

    // Trackear el mapa regenerado para que el siguiente test parta de un
    // estado git limpio (igual que el flujo real: el mapa se comitea).
    execSync('git add .claude/CONTEXT_MAP.json', { cwd: tmpRepo });
    execSync('git commit -q -m "actualizar mapa"', { cwd: tmpRepo });
  });

  test('diff-map-trigger.js regenera el mapa ante archivos sin trackear (??)', () => {
    // diff-map-trigger.js dispara con git status --porcelain (??, A , D , R )
    // -- un archivo nuevo SIN commitear es el caso real de Write/Edit en un
    // hook PostToolUse, antes de que el usuario decida comitear.
    fs.writeFileSync(path.join(tmpRepo, 'd.js'), 'const d = 4;\n'); // sin git add

    const antes = JSON.parse(fs.readFileSync(path.join(tmpRepo, '.claude', 'CONTEXT_MAP.json'), 'utf8'));
    assert.equal(antes.host.total_files, 4, 'antes de d.js el mapa debe reflejar solo los archivos commiteados hasta ahora');

    const r = spawnSync('node', [DIFF_TRIGGER], { encoding: 'utf8', cwd: tmpRepo });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /Cambio estructural detectado/);

    // d.js no esta commiteado, asi que generate-map (via git ls-files) no lo
    // cuenta -- lo que se verifica es que el TRIGGER se disparo (arriba) sin
    // fallar, que es su unica responsabilidad.
  });

  test('diff-map-trigger.js no hace nada si solo hay cambios de contenido (M)', () => {
    execSync('git add d.js', { cwd: tmpRepo }); // commitear d.js primero (no -A: evita re-arrastrar el mapa)
    execSync('git commit -q -m "agrega d.js"', { cwd: tmpRepo });
    execSync('git add .claude/CONTEXT_MAP.json', { cwd: tmpRepo }); // el trigger anterior regenero el mapa
    execSync('git commit -q -m "actualizar mapa" --allow-empty', { cwd: tmpRepo });
    fs.writeFileSync(path.join(tmpRepo, 'd.js'), 'const d = 999; // modificado\n'); // solo modifica, no agrega/borra

    const antesTs = fs.statSync(path.join(tmpRepo, '.claude', 'CONTEXT_MAP.json')).mtimeMs;
    const r = spawnSync('node', [DIFF_TRIGGER], { encoding: 'utf8', cwd: tmpRepo });
    const despuesTs = fs.statSync(path.join(tmpRepo, '.claude', 'CONTEXT_MAP.json')).mtimeMs;

    assert.equal(r.status, 0);
    assert.equal(r.stderr, '', 'modificacion de contenido (M) no debe disparar regeneracion');
    assert.equal(antesTs, despuesTs, 'el mapa no debe tocarse si no hay cambio estructural de rutas');
  });
});
