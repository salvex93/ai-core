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

  test('con tmpDir explicito: usa el valor REAL de os.tmpdir(), no el literal ${TMPDIR:-/tmp}', () => {
    // Bug real de CI (2026-08-14): el literal '"${TMPDIR:-/tmp}/*"' depende
    // de que el shell que invoca el comando expanda esa sintaxis POSIX antes
    // de pasarselo a Node -- en macOS runners de GitHub Actions, $TMPDIR real
    // no es /tmp (suele ser /var/folders/xx/xxxxx/T/, a veces con prefijo
    // /private/ segun si Node resuelve el symlink o no), y el patron
    // declarado en --allow-fs-read/--allow-fs-write podia no coincidir con
    // la ruta real donde Node escribe/lee (os.tmpdir()), causando
    // ERR_ACCESS_DENIED especifico de esa plataforma. Resolver tmpDir en
    // build time (mismo proceso Node que luego ejecuta el guard) elimina la
    // categoria entera del bug -- ya no depende de que un shell externo
    // expanda nada.
    const tmpDirReal = '/var/folders/xx/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/T';
    const hooks = buildHooksSection((s) => `"/repo/.claude/bin/${s}"`, tmpDirReal);
    const str = JSON.stringify(hooks);

    assert.match(str, /var\/folders\/xx/, 'debe usar el tmpDir real pasado, no el literal ${TMPDIR:-/tmp}');
    assert.doesNotMatch(str, /\$\{TMPDIR/, 'no debe quedar ningun literal sin resolver de ${TMPDIR:-/tmp}');
  });

  test('sin tmpDir explicito (retrocompatible): sigue usando el literal ${TMPDIR:-/tmp} como fallback', () => {
    const hooks = buildHooksSection((s) => `"/repo/.claude/bin/${s}"`);
    const str = JSON.stringify(hooks);
    assert.match(str, /\$\{TMPDIR:-\/tmp\}/, 'sin tmpDir explicito, debe conservar el comportamiento anterior');
  });

  test('SubagentStop incluye los 3 guards de validacion de output', () => {
    const hooks = buildHooksSection((s) => `"${s}"`);
    const str = JSON.stringify(hooks.SubagentStop);
    assert.match(str, /subagent-review\.js/);
    assert.match(str, /cross-verify-gate\.js/);
    assert.match(str, /injection-guard\.js/);
  });

  test('SubagentStop incluye subagent-guard-release.js para liberar el lock de paralelismo al terminar el subagente', () => {
    const hooks = buildHooksSection((s) => `"${s}"`);
    const str = JSON.stringify(hooks.SubagentStop);
    assert.match(str, /subagent-guard-release\.js/);
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

    test('en win32 tambien activa el Permission Model -- confirmado en cmd.exe real (spike de esta sesion)', () => {
      const cmd = nodeConPermiso('"/repo/.claude/bin/destructive-op-guard.js"', {
        fsRead: ['"/repo/.claude/bin/*"'],
      }, 'win32');

      assert.equal(cmd, 'node --permission --allow-fs-read="/repo/.claude/bin/*" "/repo/.claude/bin/destructive-op-guard.js"');
    });

    test('sin permisos declarados, en POSIX solo agrega el flag --permission', () => {
      const cmd = nodeConPermiso('"/repo/.claude/bin/hook.js"', {}, 'linux');
      assert.equal(cmd, 'node --permission "/repo/.claude/bin/hook.js"');
    });
  });
});
