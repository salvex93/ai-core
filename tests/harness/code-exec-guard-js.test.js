'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('code-exec-guard.js', () => {
  const SCRIPT = path.join(BIN, 'code-exec-guard.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'code-exec-guard.js debe existir en .claude/bin/');
  });

  function run(tool_input) {
    return spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: JSON.stringify({ tool_input }) });
  }

  test('sin stdin con datos: exit 0', () => {
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: '' });
    assert.equal(r.status, 0);
  });

  test('bloquea (exit 2) eval() en contenido .js nuevo (Write)', () => {
    const r = run({ file_path: 'x.js', content: 'function run(c) { return ' + 'eval' + '(c); }' });
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('CODE-EXEC-GUARD'));
  });

  test('bloquea (exit 2) eval() en new_string (Edit)', () => {
    const r = run({ file_path: 'x.js', old_string: 'const a = 1;', new_string: 'const a = 1;\n' + 'eval' + '(userInput);' });
    assert.equal(r.status, 2);
  });

  test('bloquea (exit 2) subprocess con shell=True en .py', () => {
    const r = run({ file_path: 'x.py', content: 'subprocess.run(cmd, shell=True)' });
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('shell=True'));
  });

  test('permite (exit 0) codigo limpio', () => {
    const r = run({ file_path: 'x.js', content: 'const suma = (a, b) => a + b;' });
    assert.equal(r.status, 0);
  });

  test('permite (exit 0) extensiones no vigiladas', () => {
    const r = run({ file_path: 'x.md', content: 'eval' + '(userInput)' });
    assert.equal(r.status, 0);
  });

  test('exime archivos .test.js del propio guard (evita bloquear fixtures de prueba)', () => {
    const r = run({ file_path: 'algo.test.js', content: 'eval' + '(userInput)' });
    assert.equal(r.status, 0, 'archivos de test deben poder contener el patron como dato de prueba');
  });

  test('code-exec-guard registrado en PreToolUse(Write|Edit) sin "|| true" que absorba el exit code', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const preHooks = (settings.hooks?.PreToolUse || [])
      .filter(h => h.matcher === 'Write|Edit')
      .flatMap(h => h.hooks || []);
    const cmd = preHooks.map(h => h.command || '').find(c => c.includes('code-exec-guard.js'));
    assert.ok(cmd, 'code-exec-guard.js debe estar registrado en PreToolUse(Write|Edit)');
    assert.ok(!cmd.includes('|| true'), 'el hook no debe absorber el exit code con || true');
  });

  describe('break-glass: excepcion auditable para patrones de ejecucion arbitraria', () => {
    const JAILBREAK_GUARD = path.join(BIN, 'jailbreak-guard.js');

    function nuevoDirBreakGlass() {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'code-exec-breakglass-'));
    }

    function runConEnv(tool_input, env) {
      return spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: JSON.stringify({ tool_input }), env: { ...process.env, ...env } });
    }

    function confirmar(dir, id) {
      return spawnSync('node', [JAILBREAK_GUARD], {
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          CLAUDE_USER_PROMPT: `CONFIRMAR-${id}`,
          AI_CORE_BREAK_GLASS_DIR: dir,
          AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl'),
          AI_CORE_JAILBREAK_BYPASS_DIR: path.join(dir, 'jb'),
        },
      });
    }

    test('el bloqueo genera un id CONFIRMAR-<id> real en stderr', () => {
      const dir = nuevoDirBreakGlass();
      const r = runConEnv(
        { file_path: 'sandbox.js', content: 'function run(c) { return ' + 'eval' + '(c); }' },
        { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') }
      );
      assert.equal(r.status, 2);
      assert.match(r.stderr, /CONFIRMAR-[a-f0-9]{8}/);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('confirmar el id permite el REINTENTO EXACTO del mismo Write (mismo file_path + content)', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const tool_input = { file_path: 'sandbox.js', content: 'function run(c) { return ' + 'eval' + '(c); }' };

      const bloqueo = runConEnv(tool_input, env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      assert.equal(confirmar(dir, id).status, 0);

      const reintento = runConEnv(tool_input, env);
      assert.equal(reintento.status, 0, 'el reintento exacto del mismo Write ya confirmado debe pasar');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('confirmar el id NO autoriza otro archivo/contenido distinto', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };

      const bloqueo = runConEnv({ file_path: 'sandbox.js', content: 'x=' + 'eval' + '(a);' }, env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      confirmar(dir, id);

      const otro = runConEnv({ file_path: 'otro.js', content: 'x=' + 'eval' + '(b);' }, env);
      assert.equal(otro.status, 2, 'un Write distinto al aprobado debe seguir bloqueado');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('reintentar una SEGUNDA vez tras confirmar vuelve a bloquear (un solo uso)', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const tool_input = { file_path: 'sandbox.js', content: 'x=' + 'eval' + '(x);' };

      const bloqueo = runConEnv(tool_input, env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      confirmar(dir, id);

      runConEnv(tool_input, env); // consume la aprobacion
      const segundoIntento = runConEnv(tool_input, env);
      assert.equal(segundoIntento.status, 2, 'la aprobacion de un solo uso no debe cubrir un segundo reintento');
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });
});

// ─── dependency-tracer.js ─────────────────────────────────────────────────────
