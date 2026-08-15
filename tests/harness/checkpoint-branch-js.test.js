'use strict';

/**
 * checkpoint-branch.js — auto-commit a una rama de respaldo paralela
 * (ai-core/checkpoints), nunca a la rama de trabajo real del usuario.
 * Cierra el gap de "git-native como red de seguridad" (patron de Aider)
 * sin violar la regla de CLAUDE.md de nunca commitear a la rama real sin
 * peticion explicita del usuario, y sin Co-Authored-By ni mencion de IA.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { execSync } = require('node:child_process');
const { BIN, runScript } = require('./_shared');

describe('checkpoint-branch.js', () => {
  const SCRIPT = path.join(BIN, 'checkpoint-branch.js');
  let REPO_TMP;

  function git(cmd, cwd = REPO_TMP) {
    return execSync(`git ${cmd}`, { cwd, encoding: 'utf8' });
  }

  before(() => {
    REPO_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-core-checkpoint-branch-'));
    git('init -q');
    git('config user.email test@example.com');
    git('config user.name "Test User"');
    fs.writeFileSync(path.join(REPO_TMP, 'archivo.txt'), 'contenido inicial\n', 'utf8');
    git('add archivo.txt');
    git('commit -q -m "commit inicial"');
  });

  after(() => {
    fs.rmSync(REPO_TMP, { recursive: true, force: true });
  });

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('sin cambios en el working tree: exit 0, no crea la rama de checkpoints', () => {
    const r = runScript(SCRIPT, [], { AI_CORE_CHECKPOINT_REPO: REPO_TMP });
    assert.equal(r.status, 0);
    const ramas = git('branch --list ai-core/checkpoints');
    assert.equal(ramas.trim(), '', 'no debe crear la rama si no hay cambios que respaldar');
  });

  test('con cambios en el working tree: crea la rama ai-core/checkpoints y commitea ahi', () => {
    fs.writeFileSync(path.join(REPO_TMP, 'archivo.txt'), 'contenido modificado\n', 'utf8');
    const ramaAntes = git('rev-parse --abbrev-ref HEAD').trim();

    const r = runScript(SCRIPT, [], { AI_CORE_CHECKPOINT_REPO: REPO_TMP });
    assert.equal(r.status, 0);

    const ramaDespues = git('rev-parse --abbrev-ref HEAD').trim();
    assert.equal(ramaDespues, ramaAntes, 'nunca debe dejar al usuario parado en la rama de checkpoints');

    const ramas = git('branch --list ai-core/checkpoints');
    assert.match(ramas, /ai-core\/checkpoints/, 'debe crear la rama de respaldo');
  });

  test('NUNCA modifica el indice de staging real del usuario (git status del working tree igual antes y despues)', () => {
    fs.writeFileSync(path.join(REPO_TMP, 'otro.txt'), 'nuevo archivo sin stagear\n', 'utf8');
    const statusAntes = git('status --porcelain');

    runScript(SCRIPT, [], { AI_CORE_CHECKPOINT_REPO: REPO_TMP });

    const statusDespues = git('status --porcelain');
    assert.equal(statusDespues, statusAntes, 'el working tree/index real del usuario no debe cambiar');
  });

  test('el mensaje de commit del checkpoint no menciona IA, Claude ni Co-Authored-By', () => {
    fs.writeFileSync(path.join(REPO_TMP, 'archivo.txt'), 'contenido v3\n', 'utf8');
    runScript(SCRIPT, [], { AI_CORE_CHECKPOINT_REPO: REPO_TMP });

    const log = git('log ai-core/checkpoints -1 --format=%B');
    assert.doesNotMatch(log, /claude|anthropic|co-authored|ia\b/i);
  });

  test('la rama real del usuario nunca recibe un commit nuevo (solo ai-core/checkpoints avanza)', () => {
    const ramaReal = git('rev-parse --abbrev-ref HEAD').trim();
    const headAntes = git(`rev-parse ${ramaReal}`).trim();

    fs.writeFileSync(path.join(REPO_TMP, 'archivo.txt'), 'contenido v4\n', 'utf8');
    runScript(SCRIPT, [], { AI_CORE_CHECKPOINT_REPO: REPO_TMP });

    const headDespues = git(`rev-parse ${ramaReal}`).trim();
    assert.equal(headDespues, headAntes, 'la rama de trabajo real no debe recibir ningun commit automatico');
  });

  test('corridas sucesivas van acumulando commits en la misma rama de checkpoints (historial de puntos de restauracion)', () => {
    fs.writeFileSync(path.join(REPO_TMP, 'archivo.txt'), 'contenido v5\n', 'utf8');
    runScript(SCRIPT, [], { AI_CORE_CHECKPOINT_REPO: REPO_TMP });
    const countAntes = parseInt(git('rev-list --count ai-core/checkpoints').trim(), 10);

    fs.writeFileSync(path.join(REPO_TMP, 'archivo.txt'), 'contenido v6\n', 'utf8');
    runScript(SCRIPT, [], { AI_CORE_CHECKPOINT_REPO: REPO_TMP });
    const countDespues = parseInt(git('rev-list --count ai-core/checkpoints').trim(), 10);

    assert.equal(countDespues, countAntes + 1);
  });

  test('best-effort: si no es un repositorio git, exit 0 sin lanzar excepcion', () => {
    const noGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-core-no-git-'));
    const r = runScript(SCRIPT, [], { AI_CORE_CHECKPOINT_REPO: noGitDir });
    assert.equal(r.status, 0);
    fs.rmSync(noGitDir, { recursive: true, force: true });
  });
});
