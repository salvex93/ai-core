'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, runScript } = require('./_shared');

describe('destructive-op-guard.js — break-glass', () => {
  const GUARD = path.join(BIN, 'destructive-op-guard.js');
  const JAILBREAK_GUARD = path.join(BIN, 'jailbreak-guard.js');

  function run(cmd, env = {}) {
    return runScript(GUARD, [], { CLAUDE_TOOL_INPUT_command: cmd, ...env });
  }

  describe('break-glass: excepcion auditable para reglas sin alternativa segura', () => {
    function nuevoDirBreakGlass() {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'destructive-op-breakglass-'));
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

    test('"rm -rf" bloqueado genera un id CONFIRMAR-<id> real en stderr', () => {
      const dir = nuevoDirBreakGlass();
      const r = run('rm -rf build/', { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') });
      assert.equal(r.status, 2);
      assert.match(r.stderr, /CONFIRMAR-[a-f0-9]{8}/);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('confirmar el id permite el REINTENTO EXACTO de "rm -rf build/"', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const cmd = 'rm -rf build/';

      const bloqueo = run(cmd, env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      const confirmacion = confirmar(dir, id);
      assert.equal(confirmacion.status, 0);

      const reintento = run(cmd, env);
      assert.equal(reintento.status, 0, 'el reintento exacto del comando ya confirmado debe pasar');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('confirmar el id NO autoriza un "rm -rf" DISTINTO (no es excepcion general)', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };

      const bloqueo = run('rm -rf build/', env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      confirmar(dir, id);

      const otroComando = run('rm -rf dist/', env);
      assert.equal(otroComando.status, 2, 'un comando destructivo distinto al aprobado debe seguir bloqueado');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('reintentar la misma accion una SEGUNDA vez tras confirmar vuelve a bloquear (un solo uso)', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const cmd = 'git reset --hard HEAD~1';

      const bloqueo = run(cmd, env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      confirmar(dir, id);

      run(cmd, env); // consume la aprobacion de un solo uso
      const segundoIntento = run(cmd, env);
      assert.equal(segundoIntento.status, 2, 'la aprobacion de un solo uso no debe cubrir un segundo reintento');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('DROP DATABASE con "-- confirmado" literal sigue funcionando sin necesitar break-glass (retrocompatible)', () => {
      // La excepcion de comentario literal ya existente NO se retira -- sigue
      // siendo una via valida, break-glass es una alternativa adicional para
      // cuando no se quiere/puede anotar el comentario en el propio comando.
      assert.equal(run('psql -c "DROP DATABASE IF EXISTS staging -- confirmado"').status, 0);
    });

    test('ofuscacion (eval sobre variable) NUNCA genera break-glass -- hard-stop absoluto', () => {
      const dir = nuevoDirBreakGlass();
      const r = run('eval $CMD_PELIGROSO', { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') });
      assert.equal(r.status, 2);
      assert.ok(!/CONFIRMAR-/.test(r.stderr), 'ofuscacion no debe ofrecer ninguna via de excepcion');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('Co-Authored-By en commit NUNCA genera break-glass -- hard-stop absoluto', () => {
      const dir = nuevoDirBreakGlass();
      const r = run('git commit -m "fix: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"', { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') });
      assert.equal(r.status, 2);
      assert.ok(!/CONFIRMAR-/.test(r.stderr), 'atribucion de IA en commit no debe ofrecer ninguna via de excepcion');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('git push --force-with-lease sigue sin bloquear -- alternativa segura, no pasa por break-glass', () => {
      assert.equal(run('git push --force-with-lease origin main').status, 0);
    });

    test('confirmar el id permite el reintento aunque el comando reordene sus flags (G37)', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };

      const bloqueo = run('rm --recursive --force build/', env);
      assert.equal(bloqueo.status, 2);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      const confirmacion = confirmar(dir, id);
      assert.equal(confirmacion.status, 0);

      const reintento = run('rm --force --recursive build/', env);
      assert.equal(reintento.status, 0, 'el reintento con flags en otro orden sobre el mismo objetivo debe reconocerse como la misma accion aprobada');
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });
});
