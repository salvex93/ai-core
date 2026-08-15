'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('secrets-guard.js', () => {
  const SCRIPT = path.join(BIN, 'secrets-guard.js');

  test('sale con 0 si CLAUDE_USER_PROMPT esta vacio', () => {
    const r = runScript(SCRIPT, [], { CLAUDE_USER_PROMPT: '' });
    assert.equal(r.status, 0);
  });

  test('sale con 0 para prompt normal sin credenciales', () => {
    const r = runScript(SCRIPT, [], { CLAUDE_USER_PROMPT: 'refactoriza la funcion de paginacion' });
    assert.equal(r.status, 0);
  });

  test('bloquea OpenAI API key en el prompt (alta confianza, exit 2)', () => {
    // UserPromptSubmit si soporta bloqueo real: exit 2 borra el prompt antes
    // de que llegue al modelo (confirmado contra code.claude.com/docs/en/hooks).
    const r = runScript(SCRIPT, [], {
      CLAUDE_USER_PROMPT: 'usa esta key: sk-abcdefghijklmnopqrstuvwxyz123456 para el test',
    });
    assert.ok(r.stderr.includes('[secrets-guard]'), 'debe reportar el bloqueo por stderr');
    assert.equal(r.status, 2, 'debe bloquear (exit 2) — credencial de alta confianza');
  });

  test('bloquea GitHub PAT en el prompt (alta confianza, exit 2)', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_USER_PROMPT: 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789A',
    });
    assert.ok(r.stderr.includes('[secrets-guard]'), 'debe reportar el bloqueo por stderr');
    assert.equal(r.status, 2, 'debe bloquear (exit 2) — credencial de alta confianza');
  });

  test('bloquea el prefijo de OpenAI API key con mayuscula ("Sk-...", hallazgo red-team 2026-08-15)', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_USER_PROMPT: 'Sk-abcdefghijklmnopqrstuvwxyz123456',
    });
    assert.equal(r.status, 2, 'el prefijo en otro case no debe evadir la deteccion de la credencial real');
  });

  test('solo advierte (exit 0) para patron de confianza media', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_USER_PROMPT: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2:f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2',
    });
    assert.ok(r.stdout.includes('[secrets-guard]'), 'debe advertir sobre el patron detectado');
    assert.equal(r.status, 0, 'confianza media no bloquea');
  });

  describe('break-glass: excepcion auditable para credenciales de alta confianza', () => {
    const JAILBREAK_GUARD = path.join(BIN, 'jailbreak-guard.js');

    function nuevoDirBreakGlass() {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-guard-breakglass-'));
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
      const r = runScript(SCRIPT, [], {
        CLAUDE_USER_PROMPT: 'usa esta key: sk-abcdefghijklmnopqrstuvwxyz123456 para el test',
        AI_CORE_BREAK_GLASS_DIR: dir,
        AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl'),
      });
      assert.equal(r.status, 2);
      assert.match(r.stderr, /CONFIRMAR-[a-f0-9]{8}/);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('confirmar el id permite REENVIAR el mismo prompt exacto', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const prompt = 'usa esta key: sk-abcdefghijklmnopqrstuvwxyz123456 para el test';

      const bloqueo = runScript(SCRIPT, [], { CLAUDE_USER_PROMPT: prompt, ...env });
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      assert.equal(confirmar(dir, id).status, 0);

      const reenvio = runScript(SCRIPT, [], { CLAUDE_USER_PROMPT: prompt, ...env });
      assert.equal(reenvio.status, 0, 'reenviar el mismo prompt exacto tras confirmar debe pasar');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('confirmar el id NO autoriza un prompt DISTINTO con otra credencial', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };

      const bloqueo = runScript(SCRIPT, [], { CLAUDE_USER_PROMPT: 'sk-abcdefghijklmnopqrstuvwxyz123456', ...env });
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      confirmar(dir, id);

      const otro = runScript(SCRIPT, [], { CLAUDE_USER_PROMPT: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789A', ...env });
      assert.equal(otro.status, 2, 'un prompt con una credencial distinta debe seguir bloqueado');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('reenviar el mismo prompt una SEGUNDA vez tras confirmar vuelve a bloquear (un solo uso)', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const prompt = 'sk-abcdefghijklmnopqrstuvwxyz123456';

      const bloqueo = runScript(SCRIPT, [], { CLAUDE_USER_PROMPT: prompt, ...env });
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      confirmar(dir, id);

      runScript(SCRIPT, [], { CLAUDE_USER_PROMPT: prompt, ...env }); // consume la aprobacion
      const segundoIntento = runScript(SCRIPT, [], { CLAUDE_USER_PROMPT: prompt, ...env });
      assert.equal(segundoIntento.status, 2, 'la aprobacion de un solo uso no debe cubrir un segundo reenvio');
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });
});

// ─── session-summary.js ──────────────────────────────────────────────────────
