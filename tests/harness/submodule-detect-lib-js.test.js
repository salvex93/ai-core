'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { REPO } = require('./_shared');

describe('lib/submodule-detect.js', () => {
  const { detectarSubmodulo, esSubmoduloDeHost } = require(path.join(REPO, '.claude', 'bin', 'lib', 'submodule-detect.js'));
  let coreDir, hostDir;

  before(() => {
    hostDir = fs.mkdtempSync(path.join(os.tmpdir(), 'submodule-detect-host-'));
    coreDir = path.join(hostDir, '.claude', 'ai-core');
    fs.mkdirSync(coreDir, { recursive: true });
  });
  after(() => { fs.rmSync(hostDir, { recursive: true, force: true }); });

  test('sin .gitmodules en el padre: no es submodulo', () => {
    const r = detectarSubmodulo(coreDir);
    assert.equal(r.esSubmodulo, false);
    assert.equal(r.hostDir, null);
    assert.match(r.razon, /gitmodules/);
  });

  test('.gitmodules existe pero no declara ai-core: no es submodulo', () => {
    fs.writeFileSync(path.join(hostDir, '.gitmodules'), '[submodule "otra-cosa"]\n\tpath = otra-cosa\n');
    const r = detectarSubmodulo(coreDir);
    fs.unlinkSync(path.join(hostDir, '.gitmodules'));

    assert.equal(r.esSubmodulo, false);
    assert.match(r.razon, /no declara/);
  });

  test('.gitmodules declara ai-core pero el padre no tiene CLAUDE.md propio: no es submodulo', () => {
    fs.writeFileSync(path.join(hostDir, '.gitmodules'), '[submodule "ai-core"]\n\tpath = .claude/ai-core\n');
    const r = detectarSubmodulo(coreDir);
    fs.unlinkSync(path.join(hostDir, '.gitmodules'));

    assert.equal(r.esSubmodulo, false);
    assert.match(r.razon, /CLAUDE\.md/);
  });

  test('.gitmodules declara ai-core y el padre tiene CLAUDE.md: es submodulo', () => {
    fs.writeFileSync(path.join(hostDir, '.gitmodules'), '[submodule "ai-core"]\n\tpath = .claude/ai-core\n');
    fs.writeFileSync(path.join(hostDir, 'CLAUDE.md'), '# AI-CORE activo\n');
    const r = detectarSubmodulo(coreDir);
    fs.unlinkSync(path.join(hostDir, '.gitmodules'));
    fs.unlinkSync(path.join(hostDir, 'CLAUDE.md'));

    assert.equal(r.esSubmodulo, true);
    assert.equal(r.hostDir, hostDir);
  });

  test('esSubmoduloDeHost recibe hostDir directamente, sin resolver desde corePath', () => {
    fs.writeFileSync(path.join(hostDir, '.gitmodules'), '[submodule "ai-core"]\n\tpath = .claude/ai-core\n');
    fs.writeFileSync(path.join(hostDir, 'CLAUDE.md'), '# AI-CORE activo\n');
    const r = esSubmoduloDeHost(hostDir);
    fs.unlinkSync(path.join(hostDir, '.gitmodules'));
    fs.unlinkSync(path.join(hostDir, 'CLAUDE.md'));

    assert.equal(r.esSubmodulo, true);
    assert.equal(r.hostDir, hostDir);
  });
});
