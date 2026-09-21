'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('hooks-definition.js — sandboxing', () => {
  const { buildHooksSection, nodeConPermiso } = require(path.join(BIN, 'hooks-definition.js'));

  describe('sandboxing de hooks prioritarios en buildHooksSection', () => {
    test('destructive-op-guard.js, code-exec-guard.js, secrets-guard.js e injection-guard.js usan --permission en POSIX', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
        const hooks = build((s) => `"/repo/.claude/bin/${s}"`);
        const str = JSON.stringify(hooks);

        assert.match(str, /--permission.*destructive-op-guard\.js/);
        assert.match(str, /--permission.*code-exec-guard\.js/);
        assert.match(str, /--permission.*secrets-guard\.js/);
        assert.match(str, /--permission.*injection-guard\.js/);
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
      }
    });

    test('en Windows (win32), los mismos 4 hooks TAMBIEN usan --permission (confirmado en cmd.exe real)', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      try {
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
        const hooks = build((s) => `"/repo/.claude/bin/${s}"`);
        const str = JSON.stringify(hooks);

        assert.match(str, /--permission.*destructive-op-guard\.js/);
        assert.match(str, /--permission.*code-exec-guard\.js/);
        assert.match(str, /--permission.*secrets-guard\.js/);
        assert.match(str, /--permission.*injection-guard\.js/);
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
      }
    });
  });

  describe('permiso de dos niveles para locks de subagentes (bug real confirmado en sesion real 2026-08-15)', () => {
    // Bug preexistente descubierto verificando en sesion real (no solo con
    // tests): subagent-guard.js/-release.js usaban el permiso generico de un
    // solo nivel (dirTmp = "<tmp>/*"), pero su LOCK_DIR real vive DOS niveles
    // bajo el tmpdir (<tmp>/ai-core-locks/subagents/*.lock). Confirmado en
    // vivo con --permission real que ese glob de un nivel NUNCA cubrio esa
    // profundidad, ni para lectura ni escritura -- subagent-guard.js jamas
    // pudo escribir su lock y -release.js jamas pudo borrarlo; el TTL de 2
    // minutos era la unica garantia real de liberacion en produccion.

    test('subagent-guard.js recibe --allow-fs-write apuntando al subdirectorio real de locks (dos niveles), no al tmpdir generico de un nivel', () => {
      const tmpDirReal = '/tmp/fake-tmpdir';
      const hooks = buildHooksSection((s) => `"/repo/.claude/bin/${s}"`, tmpDirReal);
      const cmd = hooks.PreToolUse
        .flatMap((g) => g.hooks)
        .map((h) => h.command)
        .find((c) => c.includes('subagent-guard.js') && !c.includes('subagent-guard-release'));

      assert.ok(cmd, 'debe encontrar la invocacion de subagent-guard.js en PreToolUse');
      assert.match(cmd, /--allow-fs-write="\/tmp\/fake-tmpdir\/ai-core-locks\/subagents\/\*"/, 'debe apuntar al subdirectorio real de locks, no solo al tmpdir generico');
    });

    test('subagent-guard-release.js recibe el mismo permiso de dos niveles en fsRead y fsWrite', () => {
      const tmpDirReal = '/tmp/fake-tmpdir';
      const hooks = buildHooksSection((s) => `"/repo/.claude/bin/${s}"`, tmpDirReal);
      const cmd = hooks.SubagentStop
        .flatMap((g) => g.hooks)
        .map((h) => h.command)
        .find((c) => c.includes('subagent-guard-release.js'));

      assert.ok(cmd, 'debe encontrar la invocacion de subagent-guard-release.js en SubagentStop');
      assert.match(cmd, /--allow-fs-read="\/tmp\/fake-tmpdir\/ai-core-locks\/subagents\/\*"/);
      assert.match(cmd, /--allow-fs-write="\/tmp\/fake-tmpdir\/ai-core-locks\/subagents\/\*"/);
    });

    test('ejecucion real: subagent-guard.js escribe el lock y subagent-guard-release.js lo borra, ambos con el permiso EXACTO generado por hooks-definition.js', () => {
      // Cross-platform (no se salta en Windows como sandbox-permission-smoke.test.js):
      // usa os.tmpdir() real y AI_CORE_SUBAGENT_LOCK_DIR para aislar del
      // directorio compartido real, sin depender de POSIX.
      const tmpDirReal = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-def-lock-e2e-'));
      const lockDirEsperado = path.join(tmpDirReal, 'ai-core-locks', 'subagents');

      // Sin comillas envolventes: spawnSync con array de args no pasa por
      // shell, asi que un valor con comillas literales llegaria a Node como
      // parte del string del glob en vez de ser removidas (a diferencia de
      // settings.json real, donde el comando se invoca via shell que si las
      // interpreta y las quita antes de pasarselo a Node).
      const permisoLock = `${tmpDirReal.replace(/\\/g, '/')}/ai-core-locks/subagents/*`;
      const dirBin = `${BIN.replace(/\\/g, '/')}/*`;

      try {
        const eventoGuard = JSON.stringify({
          session_id: 'sesion-e2e-hooks-def',
          prompt_id: 'prompt-e2e-hooks-def',
          tool_input: { subagent_type: 'general-purpose', prompt: 'tarea de prueba' },
          hook_event_name: 'PreToolUse',
        });
        const rGuard = spawnSync('node', [
          '--permission',
          `--allow-fs-read=${dirBin}`,
          `--allow-fs-read=${permisoLock}`,
          `--allow-fs-write=${permisoLock}`,
          path.join(BIN, 'subagent-guard.js'),
        ], {
          input: eventoGuard, encoding: 'utf8', cwd: REPO,
          env: { ...process.env, AI_CORE_SUBAGENT_LOCK_DIR: lockDirEsperado },
        });
        assert.equal(rGuard.status, 0, `subagent-guard.js debe escribir el lock sin EPERM: ${rGuard.stderr}`);

        const lockFile = path.join(lockDirEsperado, 'sesion-e2e-hooks-def__prompt-e2e-hooks-def.lock');
        assert.ok(fs.existsSync(lockFile), 'el lock debe existir tras subagent-guard.js con el permiso real generado');

        const eventoRelease = JSON.stringify({
          session_id: 'sesion-e2e-hooks-def',
          prompt_id: 'prompt-e2e-hooks-def',
          hook_event_name: 'SubagentStop',
        });
        const rRelease = spawnSync('node', [
          '--permission',
          `--allow-fs-read=${dirBin}`,
          `--allow-fs-read=${permisoLock}`,
          `--allow-fs-write=${permisoLock}`,
          path.join(BIN, 'subagent-guard-release.js'),
        ], {
          input: eventoRelease, encoding: 'utf8', cwd: REPO,
          env: { ...process.env, AI_CORE_SUBAGENT_LOCK_DIR: lockDirEsperado },
        });
        assert.equal(rRelease.status, 0, `subagent-guard-release.js debe correr sin EPERM: ${rRelease.stderr}`);
        assert.equal(fs.existsSync(lockFile), false, 'el lock debe quedar borrado con el permiso real de dos niveles');
      } finally {
        fs.rmSync(tmpDirReal, { recursive: true, force: true });
      }
    });
  });
});
