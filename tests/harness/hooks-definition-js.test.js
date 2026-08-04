'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('hooks-definition.js', () => {
  const { buildHooksSection, nodeConPermiso } = require(path.join(BIN, 'hooks-definition.js'));

  test('produce las 6 categorias de hooks esperadas', () => {
    const hooks = buildHooksSection((s) => `"/fake/${s}"`);
    assert.deepEqual(
      Object.keys(hooks).sort(),
      ['PostToolUse', 'PostToolUseFailure', 'PreToolUse', 'Stop', 'SubagentStop', 'UserPromptSubmit'].sort()
    );
  });

  test('usa la funcion bin() pasada para resolver cada script, no rutas hardcodeadas', () => {
    const hooks = buildHooksSection((s) => `"MARCADOR-${s}"`);
    const str = JSON.stringify(hooks);
    assert.match(str, /MARCADOR-subagent-guard\.js/);
    assert.match(str, /MARCADOR-bash-verbosity-guard\.js/);
    assert.match(str, /MARCADOR-memory-vault-prune-check\.js/);
    assert.match(str, /MARCADOR-destructive-op-guard\.js/);
  });

  test('SubagentStop incluye los 3 guards de validacion de output', () => {
    const hooks = buildHooksSection((s) => `"${s}"`);
    const str = JSON.stringify(hooks.SubagentStop);
    assert.match(str, /subagent-review\.js/);
    assert.match(str, /cross-verify-gate\.js/);
    assert.match(str, /injection-guard\.js/);
  });

  test('agent-metrics.js registra --status fail en PostToolUseFailure para el mismo grupo generico que --status ok en PostToolUse', () => {
    const hooks = buildHooksSection((s) => `"${s}"`);

    const grupoGenerico = 'Bash|Read|Write|Edit|Agent';

    const entradaOk = (hooks.PostToolUse || []).find(g => g.matcher === grupoGenerico);
    assert.ok(entradaOk, 'PostToolUse debe tener una entrada para el matcher generico Bash|Read|Write|Edit|Agent');
    assert.match(JSON.stringify(entradaOk), /agent-metrics\.js.*record --status ok/);

    const entradaFail = (hooks.PostToolUseFailure || []).find(g => g.matcher === grupoGenerico);
    assert.ok(entradaFail, 'PostToolUseFailure debe tener una entrada espejo para el matcher generico Bash|Read|Write|Edit|Agent');
    assert.match(JSON.stringify(entradaFail), /agent-metrics\.js.*record --status fail/);
  });

  describe('nodeConPermiso', () => {
    test('en POSIX antepone --permission y los flags de fs-read/fs-write', () => {
      const cmd = nodeConPermiso('"/repo/.claude/bin/secrets-guard.js"', {
        fsRead: ['"/repo/.claude/bin/*"'],
        fsWrite: ['"/tmp/*"'],
      }, 'linux');

      assert.equal(
        cmd,
        'node --permission --allow-fs-read="/repo/.claude/bin/*" --allow-fs-write="/tmp/*" "/repo/.claude/bin/secrets-guard.js"'
      );
    });

    test('en darwin (macOS) tambien activa el Permission Model', () => {
      const cmd = nodeConPermiso('"/repo/.claude/bin/code-exec-guard.js"', {
        fsRead: ['"/repo/.claude/bin/*"'],
      }, 'darwin');

      assert.match(cmd, /^node --permission --allow-fs-read="\/repo\/\.claude\/bin\/\*" "\/repo\/\.claude\/bin\/code-exec-guard\.js"$/);
    });

    test('en win32 devuelve el comando node plano, sin --permission', () => {
      const cmd = nodeConPermiso('"/repo/.claude/bin/destructive-op-guard.js"', {
        fsRead: ['"/repo/.claude/bin/*"'],
      }, 'win32');

      assert.equal(cmd, 'node "/repo/.claude/bin/destructive-op-guard.js"');
    });

    test('sin permisos declarados, en POSIX solo agrega el flag --permission', () => {
      const cmd = nodeConPermiso('"/repo/.claude/bin/hook.js"', {}, 'linux');
      assert.equal(cmd, 'node --permission "/repo/.claude/bin/hook.js"');
    });
  });

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

    test('en Windows, los mismos 4 hooks corren sin --permission (comando node plano)', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      try {
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
        const hooks = build((s) => `"/repo/.claude/bin/${s}"`);
        const preToolUseStr = JSON.stringify(hooks.PreToolUse);

        assert.match(preToolUseStr, /destructive-op-guard\.js/);
        assert.doesNotMatch(preToolUseStr, /--permission/);
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
      }
    });
  });
});
