'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('detect-stack.js', () => {
  const { detectStack } = require(path.join(BIN, 'detect-stack.js'));
  let tmpDir;

  before(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-stack-')); });
  after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('proyecto vacio: sin techs, sin permisos, sin labels', () => {
    const r = detectStack(tmpDir);
    assert.deepEqual(r.techs, []);
    assert.deepEqual(r.permissions, []);
    assert.deepEqual(r.labels, []);
  });

  test('detecta node por package.json y agrega permisos npx/yarn', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    const r = detectStack(tmpDir);
    fs.unlinkSync(path.join(tmpDir, 'package.json'));

    assert.ok(r.techs.includes('node'));
    assert.ok(r.permissions.includes('Bash(npx*)'));
    assert.ok(r.labels.includes('Node.js / npm'));
  });

  test('detecta python por requirements.txt', () => {
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), '');
    const r = detectStack(tmpDir);
    fs.unlinkSync(path.join(tmpDir, 'requirements.txt'));

    assert.ok(r.techs.includes('python'));
    assert.ok(r.permissions.includes('Bash(pytest*)'));
  });

  test('detecta multiples techs combinadas sin duplicar permisos', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), '');
    const r = detectStack(tmpDir);
    fs.unlinkSync(path.join(tmpDir, 'package.json'));
    fs.unlinkSync(path.join(tmpDir, 'Dockerfile'));

    assert.ok(r.techs.includes('node') && r.techs.includes('docker'));
    const unicos = new Set(r.permissions);
    assert.equal(unicos.size, r.permissions.length, 'no debe haber permisos duplicados');
  });

  test('detecta monorepo por directorio hint (dir, no archivo)', () => {
    fs.mkdirSync(path.join(tmpDir, 'tests'));
    const r = detectStack(tmpDir);
    fs.rmSync(path.join(tmpDir, 'tests'), { recursive: true });

    assert.ok(r.techs.includes('testing'));
  });
});

// ─── syntax-check.js ──────────────────────────────────────────────────────────
