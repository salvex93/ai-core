'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');
const { REPO, BIN } = require('./_shared');
const { fechaModificacion } = require(path.join(BIN, 'lib', 'fecha-modificacion.js'));

const HOY = new Date().toISOString().slice(0, 10);
const ANTIGUA = '2026-01-15';

function git(cwd, args, fecha) {
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  if (fecha) { env.GIT_AUTHOR_DATE = `${fecha}T12:00:00Z`; env.GIT_COMMITTER_DATE = `${fecha}T12:00:00Z`; }
  return execFileSync('git', args, { cwd, env, encoding: 'utf8' });
}

// Repositorio temporal con un archivo confirmado en una fecha antigua y mtime de hoy,
// que es exactamente lo que produce un checkout limpio.
function repoConArchivoAntiguo(nombre = 'a.md', contenido = 'uno\n') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fecha-mod-'));
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, nombre), contenido);
  git(dir, ['add', nombre]);
  git(dir, ['commit', '-q', '-m', 'init'], ANTIGUA);
  return dir;
}

describe('fechaModificacion', () => {
  test('un archivo confirmado y sin cambios devuelve la fecha de su ultimo commit, no su mtime', () => {
    const dir = repoConArchivoAntiguo();
    assert.equal(fechaModificacion(path.join(dir, 'a.md')), ANTIGUA);
  });

  test('un archivo con cambios sin confirmar cuenta como modificado hoy', () => {
    const dir = repoConArchivoAntiguo();
    fs.writeFileSync(path.join(dir, 'a.md'), 'dos\n');
    assert.equal(fechaModificacion(path.join(dir, 'a.md')), HOY);
  });

  test('un archivo nuevo sin seguimiento cuenta como modificado hoy', () => {
    const dir = repoConArchivoAntiguo();
    fs.writeFileSync(path.join(dir, 'nuevo.md'), 'x\n');
    assert.equal(fechaModificacion(path.join(dir, 'nuevo.md')), HOY);
  });

  test('fuera de un repositorio git recurre al mtime', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fecha-mod-sin-git-'));
    const f = path.join(dir, 'a.md');
    fs.writeFileSync(f, 'x\n');
    fs.utimesSync(f, new Date('2026-02-02T12:00:00Z'), new Date('2026-02-02T12:00:00Z'));
    assert.equal(fechaModificacion(f), '2026-02-02');
  });

  test('un archivo inexistente falla con el nombre del archivo', () => {
    assert.throws(() => fechaModificacion('/tmp/no-existe-fecha-mod.md'), /no-existe-fecha-mod\.md/);
  });
});

describe('validate-agents.js: drift de last_updated en un checkout limpio', () => {
  test('un agente confirmado y sin cambios no se reporta como modificado hoy', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-limpio-'));
    git(dir, ['init', '-q']);
    const agents = path.join(dir, 'agents');
    fs.mkdirSync(agents);
    fs.copyFileSync(path.join(REPO, '.claude', 'agents', 'code-reviewer.md'), path.join(agents, 'code-reviewer.md'));
    git(dir, ['add', '.']);
    git(dir, ['commit', '-q', '-m', 'init'], ANTIGUA);
    const r = spawnSync(process.execPath, [path.join(BIN, 'validate-agents.js')], { env: { ...process.env, AI_CORE_AGENTS_DIR: agents }, encoding: 'utf8' });
    assert.ok(!/anterior a modificacion de hoy/.test(r.stdout), r.stdout);
  });
});
