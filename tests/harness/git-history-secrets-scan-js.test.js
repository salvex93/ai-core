'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { execSync } = require('node:child_process');
const { BIN, runScript } = require('./_shared');

describe('git-history-secrets-scan.js — integracion CLI sobre repo git temporal', () => {
  const SCRIPT = path.join(BIN, 'git-history-secrets-scan.js');

  function crearRepoTemporal() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-history-scan-test-'));
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });
    return dir;
  }

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('repo sin ninguna credencial commiteada: exit 0, sin hallazgos', () => {
    const dir = crearRepoTemporal();
    try {
      fs.writeFileSync(path.join(dir, 'index.js'), 'function suma(a,b){return a+b;}');
      execSync('git add -A', { cwd: dir });
      execSync('git commit -q -m "inicial"', { cwd: dir });

      const r = runScript(SCRIPT, ['--json'], { AI_CORE_GIT_HISTORY_SCAN_REPO: dir });
      assert.equal(r.status, 0);
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.total, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('un secreto commiteado y luego borrado del archivo SIGUE detectandose en el historial', () => {
    const dir = crearRepoTemporal();
    try {
      const token = 'ghp_' + 'x'.repeat(36);
      fs.writeFileSync(path.join(dir, 'config.js'), `const token = "${token}";`);
      execSync('git add -A', { cwd: dir });
      execSync('git commit -q -m "agrega config con token"', { cwd: dir });

      // Borrar el secreto del archivo actual -- pero el commit anterior lo sigue teniendo.
      fs.writeFileSync(path.join(dir, 'config.js'), 'const token = process.env.GH_TOKEN;');
      execSync('git add -A', { cwd: dir });
      execSync('git commit -q -m "usar variable de entorno en su lugar"', { cwd: dir });

      // Confirmar que el working tree actual ya NO tiene el secreto (por eso
      // security-scanner.md paso 3 / secrets-guard.js no lo verian).
      const contenidoActual = fs.readFileSync(path.join(dir, 'config.js'), 'utf8');
      assert.ok(!contenidoActual.includes(token), 'el working tree actual ya no debe contener el secreto');

      const r = runScript(SCRIPT, ['--json'], { AI_CORE_GIT_HISTORY_SCAN_REPO: dir });
      assert.equal(r.status, 1, 'debe reportar exit distinto de 0 -- hay un hallazgo real en el historial');
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.total, 1);
      assert.equal(parsed.hallazgos[0].etiqueta, 'GitHub Personal Access Token');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('modo texto (sin --json) imprime el commit y la etiqueta del hallazgo', () => {
    const dir = crearRepoTemporal();
    try {
      const key = 'AIza' + 'y'.repeat(35);
      fs.writeFileSync(path.join(dir, 'app.py'), `API_KEY = "${key}"`);
      execSync('git add -A', { cwd: dir });
      execSync('git commit -q -m "agrega api key"', { cwd: dir });

      const r = runScript(SCRIPT, [], { AI_CORE_GIT_HISTORY_SCAN_REPO: dir });
      assert.equal(r.status, 1);
      assert.match(r.stdout, /Google API key/);
      assert.match(r.stdout, /reescritura/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function repoConSecretoEnRama() {
    const dir = crearRepoTemporal();
    fs.writeFileSync(path.join(dir, 'base.js'), 'const a = 1;');
    execSync('git add -A', { cwd: dir });
    execSync('git commit -q -m "base"', { cwd: dir });
    execSync('git checkout -q -b rama-lateral', { cwd: dir });
    fs.writeFileSync(path.join(dir, 'config.js'), `const token = "ghp_${'x'.repeat(36)}";`);
    execSync('git add -A', { cwd: dir });
    execSync('git commit -q -m "token en rama lateral"', { cwd: dir });
    execSync('git checkout -q -', { cwd: dir });
    return dir;
  }

  test('sin --ref escanea solo HEAD: un secreto en otra rama no se ve', () => {
    const dir = repoConSecretoEnRama();
    try {
      const r = runScript(SCRIPT, ['--json'], { AI_CORE_GIT_HISTORY_SCAN_REPO: dir });
      assert.equal(r.status, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--ref <rama> detecta el secreto de esa rama', () => {
    const dir = repoConSecretoEnRama();
    try {
      const r = runScript(SCRIPT, ['--json', '--ref', 'rama-lateral'], { AI_CORE_GIT_HISTORY_SCAN_REPO: dir });
      assert.equal(r.status, 1);
      assert.equal(JSON.parse(r.stdout).total, 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--all detecta el secreto de cualquier rama', () => {
    const dir = repoConSecretoEnRama();
    try {
      const r = runScript(SCRIPT, ['--json', '--all'], { AI_CORE_GIT_HISTORY_SCAN_REPO: dir });
      assert.equal(r.status, 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--ref inexistente falla con exit 2 en vez de reportar historial limpio', () => {
    const dir = repoConSecretoEnRama();
    try {
      const r = runScript(SCRIPT, ['--json', '--ref', 'no-existe'], { AI_CORE_GIT_HISTORY_SCAN_REPO: dir });
      assert.equal(r.status, 2);
      assert.match(r.stderr, /referencia inexistente/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('repo sin ningun commit (git init recien hecho): exit 0, sin lanzar excepcion', () => {
    const dir = crearRepoTemporal();
    try {
      const r = runScript(SCRIPT, ['--json'], { AI_CORE_GIT_HISTORY_SCAN_REPO: dir });
      assert.equal(r.status, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
