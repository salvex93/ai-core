'use strict';

/**
 * Regresion de la auditoria: perdida silenciosa de datos en detox.js
 * (borraba documentos del usuario) y memory-index.js (--rol=X pisaba el
 * indice de los demas roles e indexaba archive/ como si fuera un rol).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { execSync, spawnSync } = require('node:child_process');
const { BIN, runScript } = require('./_shared');

describe('detox.js: cuarentena en lugar de borrado', () => {
  const SCRIPT = path.join(BIN, 'detox.js');

  function repoTemporal() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detox-cuarentena-'));
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email "t@t"', { cwd: dir });
    execSync('git config user.name "T"', { cwd: dir });
    fs.writeFileSync(path.join(dir, 'README.md'), '# base\n');
    execSync('git add README.md && git commit -q -m base', { cwd: dir });
    return dir;
  }

  test('un .md legacy sin trackear sale de la raiz pero conserva su contenido', () => {
    const dir = repoTemporal();
    fs.writeFileSync(path.join(dir, 'AUDIT-clientes.md'), 'documento del usuario');
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: dir });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.existsSync(path.join(dir, 'AUDIT-clientes.md')), false);
    const base = path.join(dir, '.claude', 'detox-cuarentena');
    const lotes = fs.readdirSync(base);
    assert.equal(lotes.length, 1);
    assert.equal(fs.readFileSync(path.join(base, lotes[0], 'AUDIT-clientes.md'), 'utf8'), 'documento del usuario');
    assert.match(r.stderr, /1 archivo\(s\) legacy movidos a cuarentena/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('error: sin archivos legacy no crea la carpeta de cuarentena', () => {
    const dir = repoTemporal();
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: dir });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.existsSync(path.join(dir, '.claude', 'detox-cuarentena')), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('memory-index.js: el indice conserva todos los roles', () => {
  const SCRIPT = path.join(BIN, 'memory-index.js');

  function boveda() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-roles-'));
    const escribir = (rel, txt) => {
      const f = path.join(dir, '.raw', rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, txt);
    };
    escribir('coder/nota-coder.md', '# coder\n\ncontenido del rol coder sobre refactor\n');
    escribir('architect/nota-arq.md', '# arq\n\ncontenido del rol architect sobre capas\n');
    escribir('archive/vieja.md', '# vieja\n\ncontenido ya archivado\n');
    escribir('suelta.md', '# general\n\ncontenido general sin rol\n');
    return dir;
  }

  const roles = (dir) => {
    const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
    return [...new Set(Object.values(idx.frags).map((f) => f.rol))].sort();
  };

  test('index --rol=coder no borra del indice a architect ni a general', () => {
    const dir = boveda();
    const r = runScript(SCRIPT, ['index', '--rol=coder'], { AI_CORE_MEMORY_VAULT_PATH: dir });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(roles(dir), ['architect', 'coder', 'general']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('archive/ no se indexa como si fuera un rol', () => {
    const dir = boveda();
    runScript(SCRIPT, ['index'], { AI_CORE_MEMORY_VAULT_PATH: dir });
    assert.equal(roles(dir).includes('archive'), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
