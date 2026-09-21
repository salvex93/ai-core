'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');


describe('pre-commit-tdd.js — gate TDD por heuristica de presencia', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const { execSync, execFileSync } = require('node:child_process');
  const SCRIPT = path.resolve(__dirname, '..', '.claude', 'bin', 'pre-commit-tdd.js');

  let repoDir;

  function initRepo() {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-gate-'));
    execSync('git init -q', { cwd: repoDir });
    execSync('git config user.email t@t.com', { cwd: repoDir });
    execSync('git config user.name t', { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'app.js'), 'console.log(1);\n', 'utf8');
    execSync('git add app.js && git commit -q -m init', { cwd: repoDir });
  }

  function runGate(file) {
    try {
      execFileSync('node', [SCRIPT, file], { cwd: repoDir, encoding: 'utf8' });
      return { status: 0 };
    } catch (e) {
      return { status: e.status, stderr: e.stderr };
    }
  }

  test('bloquea (exit 2) codigo fuente modificado sin ningun *.test.js tocado en la sesion', () => {
    initRepo();
    fs.appendFileSync(path.join(repoDir, 'app.js'), 'console.log(2);\n');
    const r = runGate('app.js');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /TDD-GATE/);
    fs.rmSync(repoDir, { recursive: true });
  });

  test('permite (exit 0) codigo fuente si existe un *.test.js con cambios en el repo', () => {
    initRepo();
    fs.appendFileSync(path.join(repoDir, 'app.js'), 'console.log(2);\n');
    fs.writeFileSync(path.join(repoDir, 'app.test.js'), '// nuevo test\n', 'utf8');
    const r = runGate('app.js');
    assert.equal(r.status, 0);
    fs.rmSync(repoDir, { recursive: true });
  });

  test('permite (exit 0) editar el propio archivo de test sin exigir otro test', () => {
    initRepo();
    fs.writeFileSync(path.join(repoDir, 'app.test.js'), '// test\n', 'utf8');
    const r = runGate('app.test.js');
    assert.equal(r.status, 0);
    fs.rmSync(repoDir, { recursive: true });
  });

  test('sin argv, lee tool_input.file_path del JSON de stdin', () => {
    // Regresion real: CLAUDE_TOOL_INPUT_file_path nunca existio como
    // variable de entorno real.
    const { spawnSync } = require('node:child_process');
    initRepo();
    fs.appendFileSync(path.join(repoDir, 'app.js'), 'console.log(2);\n');
    const evento = JSON.stringify({ tool_input: { file_path: 'app.js' } });
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: repoDir, input: evento });
    fs.rmSync(repoDir, { recursive: true });
    assert.equal(r.status, 2, 'debe bloquear leyendo la ruta real desde stdin');
    assert.match(r.stderr, /TDD-GATE/);
  });

  test('pre-commit-tdd registrado en PreToolUse(Write|Edit) de settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '.claude', 'settings.json'), 'utf8'));
    const preHooks = (settings.hooks?.PreToolUse || [])
      .filter(h => h.matcher === 'Write|Edit')
      .flatMap(h => h.hooks || []);
    assert.ok(preHooks.some(h => (h.command || '').includes('pre-commit-tdd.js')));
  });
});

describe('ModelDispatcher.js — router MoA (Command/Port)', () => {
  const {
    SUBTASK_TYPES, PROVIDER_POR_SUBTASK, SubTaskCommand,
    ContextGatheringTask, SyntaxDraftingTask, SurgicalEditTask, crearSubTarea,
  } = require('../scripts/services/ModelDispatcher');

  test('ContextGathering esta asignado a gemini', () => {
    assert.equal(PROVIDER_POR_SUBTASK[SUBTASK_TYPES.CONTEXT_GATHERING], 'gemini');
  });

  test('SyntaxDrafting esta asignado a deepseek', () => {
    assert.equal(PROVIDER_POR_SUBTASK[SUBTASK_TYPES.SYNTAX_DRAFTING], 'deepseek');
  });

  test('SurgicalEdit esta asignado a anthropic (Claude)', () => {
    assert.equal(PROVIDER_POR_SUBTASK[SUBTASK_TYPES.SURGICAL_EDIT], 'anthropic');
  });

  test('SubTaskCommand es abstracta: instanciarla directamente lanza error', () => {
    assert.throws(() => new SubTaskCommand(SUBTASK_TYPES.CONTEXT_GATHERING, []), /abstracta/);
  });

  test('cada subclase concreta se instancia con su tipo correcto', () => {
    assert.equal(new ContextGatheringTask([]).tipo, SUBTASK_TYPES.CONTEXT_GATHERING);
    assert.equal(new SyntaxDraftingTask([]).tipo,   SUBTASK_TYPES.SYNTAX_DRAFTING);
    assert.equal(new SurgicalEditTask([]).tipo,     SUBTASK_TYPES.SURGICAL_EDIT);
  });

  test('crearSubTarea (factory) retorna una instancia de SubTaskCommand', () => {
    const t = crearSubTarea(SUBTASK_TYPES.SYNTAX_DRAFTING, [{ role: 'user', content: 'x' }]);
    assert.ok(t instanceof SubTaskCommand);
    assert.equal(typeof t.execute, 'function');
  });

  test('crearSubTarea con tipo desconocido lanza error', () => {
    assert.throws(() => crearSubTarea('TipoInexistente', []), /Sin Command registrado/);
  });
});
