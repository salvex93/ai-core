'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SETTINGS } = require('./_shared');

describe('skill-vault-write-guard.js', () => {
  const SCRIPT = path.join(BIN, 'skill-vault-write-guard.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'skill-vault-write-guard.js debe existir en .claude/bin/');
  });

  function run(evento, env = {}) {
    return spawnSync('node', [SCRIPT], {
      encoding: 'utf8',
      cwd: REPO,
      input: JSON.stringify(evento),
      env: { ...process.env, ...env },
    });
  }

  test('sin stdin con datos: exit 0', () => {
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: '' });
    assert.equal(r.status, 0);
  });

  test('permite (exit 0) escritura fuera de skills/ y memory-vault/', () => {
    const r = run({ tool_input: { file_path: 'scripts/foo.js', content: 'x' } });
    assert.equal(r.status, 0);
  });

  test('bloquea (exit 2) escritura del hilo principal a .claude/skills/**', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-vault-guard-'));
    const r = run(
      { tool_input: { file_path: '.claude/skills/backend-architect/SKILL.md', content: 'x' } },
      { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') }
    );
    assert.equal(r.status, 2);
    assert.match(r.stderr, /CONFIRMAR-[a-f0-9]{8}/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('bloquea (exit 2) escritura del hilo principal a .claude/memory-vault/**', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-vault-guard-'));
    const r = run(
      { tool_input: { file_path: '.claude/memory-vault/.wiki/algo.md', content: 'x' } },
      { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') }
    );
    assert.equal(r.status, 2);
    assert.match(r.stderr, /CONFIRMAR-[a-f0-9]{8}/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('permite (exit 0) un subagente autorizado (agent_type presente) -- ya cubierto por agent-paths-guard.js', () => {
    const r = run({
      agent_type: 'aiops-auditor',
      tool_input: { file_path: '.claude/skills/backend-architect/SKILL.md', content: 'x' },
    });
    assert.equal(r.status, 0);
  });

  test('skill-vault-write-guard registrado en PreToolUse(Write|Edit) sin "|| true" que absorba el exit code', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const preHooks = (settings.hooks?.PreToolUse || [])
      .filter((h) => h.matcher === 'Write|Edit')
      .flatMap((h) => h.hooks || []);
    const cmd = preHooks.map((h) => h.command || '').find((c) => c.includes('skill-vault-write-guard.js'));
    assert.ok(cmd, 'skill-vault-write-guard.js debe estar registrado en PreToolUse(Write|Edit)');
    assert.ok(!cmd.includes('|| true'), 'el hook no debe absorber el exit code con || true');
  });

  describe('break-glass: excepcion auditable para escrituras a skills/vault', () => {
    const JAILBREAK_GUARD = path.join(BIN, 'jailbreak-guard.js');

    function nuevoDirBreakGlass() {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-vault-breakglass-'));
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

    test('confirmar el id permite el REINTENTO EXACTO de la misma escritura (mismo file_path + content)', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const evento = { tool_input: { file_path: '.claude/skills/backend-architect/SKILL.md', content: 'nuevo contenido' } };

      const bloqueo = run(evento, env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      assert.equal(confirmar(dir, id).status, 0);

      const reintento = run(evento, env);
      assert.equal(reintento.status, 0, 'el reintento exacto ya confirmado debe pasar');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('confirmar el id NO autoriza otro archivo/contenido distinto', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };

      const bloqueo = run({ tool_input: { file_path: '.claude/skills/backend-architect/SKILL.md', content: 'a' } }, env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      confirmar(dir, id);

      const otro = run({ tool_input: { file_path: '.claude/memory-vault/.wiki/otro.md', content: 'b' } }, env);
      assert.equal(otro.status, 2, 'una escritura distinta a la aprobada debe seguir bloqueada');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('reintentar una SEGUNDA vez tras confirmar vuelve a bloquear (un solo uso)', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const evento = { tool_input: { file_path: '.claude/skills/backend-architect/SKILL.md', content: 'x' } };

      const bloqueo = run(evento, env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      confirmar(dir, id);

      run(evento, env); // consume la aprobacion
      const segundoIntento = run(evento, env);
      assert.equal(segundoIntento.status, 2, 'la aprobacion de un solo uso no debe cubrir un segundo reintento');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('bloqueo real 2026-09-22: editar el contenido entre el bloqueo y el reintento advierte explicitamente en stderr', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const filePath = '.claude/memory-vault/.raw/sesion.md';

      const primerBloqueo = run({ tool_input: { file_path: filePath, content: 'version 1' } }, env);
      assert.doesNotMatch(primerBloqueo.stderr, /ALERTA/, 'la primera solicitud para este guard no tiene nada previo con que comparar');

      const segundoBloqueo = run({ tool_input: { file_path: filePath, content: 'version 2, con una linea agregada' } }, env);
      assert.equal(segundoBloqueo.status, 2);
      assert.match(
        segundoBloqueo.stderr,
        /ALERTA.*contenido.*DISTINTO/s,
        'reescribir el contenido entre reintentos debe advertirse en el momento del bloqueo, no despues de que el humano confirme a ciegas'
      );
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });
});
