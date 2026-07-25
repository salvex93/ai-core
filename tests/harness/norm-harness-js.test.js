'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { execSync, spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('norm-harness.js', () => {
  const SCRIPT = path.join(BIN, 'norm-harness.js');
  let tmpHost;

  function crearProyectoAnfitrionTemporal() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'norm-harness-test-'));
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    execSync('git add package.json', { cwd: dir });
    execSync('git commit -q -m "inicial"', { cwd: dir });
    return dir;
  }

  after(() => { if (tmpHost) fs.rmSync(tmpHost, { recursive: true, force: true }); });

  test('genera settings.json con los hooks completos en el proyecto anfitrion', () => {
    tmpHost = crearProyectoAnfitrionTemporal();
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });
    assert.equal(r.status, 0, `debe terminar sin error (stderr: ${r.stderr})`);

    const settingsPath = path.join(tmpHost, '.claude', 'settings.json');
    assert.ok(fs.existsSync(settingsPath), 'debe generar .claude/settings.json en el anfitrion');

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const hooksStr = JSON.stringify(settings.hooks);

    // Regresion real: norm-harness.js mantenia una copia paralela de la
    // definicion de hooks, desincronizada de setup-settings.js -- le
    // faltaban estos 4 hooks agregados en sesiones anteriores.
    assert.ok(hooksStr.includes('subagent-guard'), 'debe incluir subagent-guard.js');
    assert.ok(hooksStr.includes('bash-verbosity-guard'), 'debe incluir bash-verbosity-guard.js');
    assert.ok(hooksStr.includes('memory-vault-prune-check'), 'debe incluir memory-vault-prune-check.js');
    assert.ok(JSON.stringify(settings.hooks.SubagentStop).includes('cross-verify-gate'), 'SubagentStop debe incluir cross-verify-gate.js');
  });

  test('detecta el stack (node) y agrega los permisos correspondientes', () => {
    tmpHost = crearProyectoAnfitrionTemporal();
    spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

    const settings = JSON.parse(fs.readFileSync(path.join(tmpHost, '.claude', 'settings.json'), 'utf8'));
    assert.ok(settings.permissions.allow.includes('Bash(npx*)'), 'debe agregar permisos de node detectados en el stack');
  });

  test('crea CLAUDE.md del anfitrion con la referencia al ai-core', () => {
    tmpHost = crearProyectoAnfitrionTemporal();
    spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

    const claudeMdPath = path.join(tmpHost, 'CLAUDE.md');
    assert.ok(fs.existsSync(claudeMdPath), 'debe crear CLAUDE.md en el anfitrion si no existia');
  });

  test('elimina archivos legacy de la blacklist en el proyecto anfitrion', () => {
    tmpHost = crearProyectoAnfitrionTemporal();
    fs.writeFileSync(path.join(tmpHost, 'SECURITY_CHANGES_v2.4.0.md'), 'legacy');

    spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

    assert.ok(!fs.existsSync(path.join(tmpHost, 'SECURITY_CHANGES_v2.4.0.md')), 'debe eliminar el archivo legacy conocido');
  });
});

// ─── ContextIndex.js ──────────────────────────────────────────────────────────
