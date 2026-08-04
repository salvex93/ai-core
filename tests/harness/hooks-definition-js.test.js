'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('hooks-definition.js', () => {
  const { buildHooksSection } = require(path.join(BIN, 'hooks-definition.js'));

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
});
