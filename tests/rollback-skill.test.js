'use strict';

/**
 * rollback-skill.test.js — Tests de scripts/rollback-skill.js
 * Ejecutar: node --test tests/
 *
 * Usa un repositorio git temporal real (no el repo del propio ai-core) para
 * poder hacer commits de prueba con distintas versiones de un SKILL.md sin
 * tocar el historial real del proyecto.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { execSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'rollback-skill.js');

describe('rollback-skill.js', () => {
  let repoDir;

  function git(cmd) {
    return execSync(`git ${cmd}`, { cwd: repoDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  }

  function escribirSkill(contenidoVersion) {
    const dir = path.join(repoDir, '.claude', 'skills', 'demo-skill');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), [
      '---',
      'name: demo-skill',
      'description: skill de prueba.',
      'origin: ai-core',
      `version: ${contenidoVersion}`,
      'last_updated: 2026-01-01',
      'rol: coder',
      '---',
      `# Demo skill v${contenidoVersion}`,
    ].join('\n'), 'utf8');
  }

  before(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-skill-test-'));
    git('init -q');
    git('config user.email test@test.com');
    git('config user.name Test');

    escribirSkill('1.0.0');
    git('add .');
    git('commit -q -m "v1.0.0"');

    escribirSkill('1.1.0');
    git('add .');
    git('commit -q -m "v1.1.0"');

    escribirSkill('2.0.0');
    git('add .');
    git('commit -q -m "v2.0.0"');
  });

  after(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  function run(args) {
    const { spawnSync } = require('node:child_process');
    return spawnSync('node', [SCRIPT, ...args], { cwd: repoDir, encoding: 'utf8' });
  }

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('sin argumentos, sale con codigo distinto de 0 y muestra uso', () => {
    const r = run([]);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /uso/i);
  });

  test('revierte un skill a una version anterior real', () => {
    const r = run(['demo-skill', '1.1.0']);
    assert.equal(r.status, 0);
    const contenido = fs.readFileSync(path.join(repoDir, '.claude', 'skills', 'demo-skill', 'SKILL.md'), 'utf8');
    assert.match(contenido, /version: 1\.1\.0/);
  });

  test('no toca ningun otro archivo del repo', () => {
    // El test anterior dejo el working tree modificado (rollback sin commit)
    // -- descartarlo antes de continuar para partir de un estado limpio.
    git('checkout -- .');

    fs.writeFileSync(path.join(repoDir, 'otro-archivo.txt'), 'contenido intacto', 'utf8');
    git('add .');
    git('commit -q -m "otro archivo"');

    run(['demo-skill', '1.0.0']);
    const otro = fs.readFileSync(path.join(repoDir, 'otro-archivo.txt'), 'utf8');
    assert.equal(otro, 'contenido intacto');
  });

  test('version inexistente: sale con error, no modifica el archivo', () => {
    const antes = fs.readFileSync(path.join(repoDir, '.claude', 'skills', 'demo-skill', 'SKILL.md'), 'utf8');
    const r = run(['demo-skill', '9.9.9']);
    assert.notEqual(r.status, 0);
    const despues = fs.readFileSync(path.join(repoDir, '.claude', 'skills', 'demo-skill', 'SKILL.md'), 'utf8');
    assert.equal(antes, despues);
  });

  test('skill inexistente: sale con error', () => {
    const r = run(['skill-que-no-existe', '1.0.0']);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /no existe|no encontrado/i);
  });
});
