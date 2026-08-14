'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { BIN } = require('./_shared');

describe('pre-commit-tdd.js', () => {
  const GUARD = path.join(BIN, 'pre-commit-tdd.js');

  function nuevoRepo() {
    const repoTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-tdd-repo-'));
    spawnSync('git', ['init', '-q'], { cwd: repoTmp });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoTmp });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: repoTmp });
    return repoTmp;
  }

  function runEnRepo(repoTmp, filePath) {
    return spawnSync('node', [GUARD, filePath], {
      encoding: 'utf8',
      cwd: repoTmp,
      env: { ...process.env, AI_CORE_TEST_MODE: '1' },
    });
  }

  test('bloquea codigo fuente real sin ningun test tocado en la sesion', () => {
    const repoTmp = nuevoRepo();
    const srcDir = path.join(repoTmp, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'helper.js'), 'module.exports = {};');
    const objetivo = path.join(srcDir, 'servicio.js');
    fs.writeFileSync(objetivo, "require('./helper');");

    const r = runEnRepo(repoTmp, objetivo);
    fs.rmSync(repoTmp, { recursive: true, force: true });
    assert.equal(r.status, 2, 'debe bloquear codigo fuente referenciado sin test tocado en la sesion');
    assert.ok(r.stderr.includes('TDD-GATE'));
  });

  test('permite un script ad-hoc (prefijo tmp_, sin referencias, unico en su carpeta)', () => {
    const repoTmp = nuevoRepo();
    const objetivo = path.join(repoTmp, 'tmp_pmo_task.js');
    fs.writeFileSync(objetivo, "console.log('one-off');");

    const r = runEnRepo(repoTmp, objetivo);
    fs.rmSync(repoTmp, { recursive: true, force: true });
    assert.equal(r.status, 0, 'un script ad-hoc sin señales de produccion no debe bloquear');
  });

  test('bloquea aunque el nombre sea tmp_ si SI esta referenciado por otro archivo del repo', () => {
    const repoTmp = nuevoRepo();
    const objetivo = path.join(repoTmp, 'tmp_pmo_task.js');
    fs.writeFileSync(objetivo, 'module.exports = {};');
    fs.writeFileSync(path.join(repoTmp, 'consumidor.js'), "require('./tmp_pmo_task');");

    const r = runEnRepo(repoTmp, objetivo);
    fs.rmSync(repoTmp, { recursive: true, force: true });
    assert.equal(r.status, 2, 'el nombre solo no exime -- si esta referenciado, se trata como produccion');
  });

  test('permite si la sesion ya toco un archivo de test', () => {
    const repoTmp = nuevoRepo();
    const srcDir = path.join(repoTmp, 'src2');
    fs.mkdirSync(srcDir, { recursive: true });
    const objetivo = path.join(srcDir, 'servicio2.js');
    fs.writeFileSync(objetivo, "require('./helper2');");
    fs.writeFileSync(path.join(srcDir, 'helper2.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(srcDir, 'otro.test.js'), '');
    spawnSync('git', ['add', 'otro.test.js'], { cwd: srcDir });

    const r = runEnRepo(repoTmp, objetivo);
    fs.rmSync(repoTmp, { recursive: true, force: true });
    assert.equal(r.status, 0, 'si ya hay un *.test.js tocado en la sesion, no bloquea');
  });

  test('bloquea igual cuando el repo esta detras de un symlink (mismatch real de macOS: os.tmpdir() sin resolver vs process.cwd() resuelto)', () => {
    // Bug real de CI (2026-08-14): en macOS, os.tmpdir() puede devolver una
    // ruta con el symlink de sistema sin resolver (ej. /var/folders/...),
    // mientras que process.cwd() del proceso hijo (REPO = process.cwd() en
    // pre-commit-tdd.js) puede resolverlo a su target real (/private/var/
    // folders/...) o viceversa -- path.relative(REPO, path.resolve(filePath))
    // calculaba una ruta con ".." de mas si un lado estaba resuelto y el
    // otro no, activando esFueraDelRepo=true por error y dejando pasar
    // codigo fuente real sin bloquear (exit 0 en vez de exit 2).
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-tdd-symlink-'));
    const real = path.join(base, 'real-repo');
    fs.mkdirSync(real, { recursive: true });
    spawnSync('git', ['init', '-q'], { cwd: real });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: real });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: real });

    const link = path.join(base, 'link-repo');
    try {
      fs.symlinkSync(real, link, 'junction');
    } catch {
      fs.rmSync(base, { recursive: true, force: true });
      return; // entorno sin permiso para symlinks -- no aplica, no falsear el test
    }

    const srcDir = path.join(link, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'helper.js'), 'module.exports = {};');
    // filePath se pasa RESUELTO (fs.realpathSync) mientras el guard corre
    // con cwd = link SIN resolver -- exactamente la asimetria que rompe en
    // macOS entre os.tmpdir() y process.cwd() del proceso hijo.
    const objetivoSinResolver = path.join(srcDir, 'servicio.js');
    fs.writeFileSync(objetivoSinResolver, "require('./helper');");
    const objetivoResuelto = fs.realpathSync(objetivoSinResolver);

    const r = spawnSync('node', [GUARD, objetivoResuelto], {
      encoding: 'utf8',
      cwd: link,
      env: { ...process.env, AI_CORE_TEST_MODE: '1' },
    });
    fs.rmSync(base, { recursive: true, force: true });

    assert.equal(r.status, 2, 'debe bloquear aunque filePath y cwd difieran en resolucion de symlink');
    assert.ok(r.stderr.includes('TDD-GATE'));
  });
});
