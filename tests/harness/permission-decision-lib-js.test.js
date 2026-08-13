'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { denegarConRazon } = require('../../.claude/bin/lib/permission-decision');

describe('lib/permission-decision.js', () => {
  test('denegarConRazon retorna el JSON con hookSpecificOutput.permissionDecision=deny', () => {
    const json = denegarConRazon('PreToolUse', 'motivo de prueba');
    const parsed = JSON.parse(json);
    assert.deepEqual(parsed, {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'motivo de prueba',
      },
    });
  });

  test('denegarConRazon produce JSON valido y parseable', () => {
    const json = denegarConRazon('PreToolUse', 'razon con "comillas" y saltos\nde linea');
    assert.doesNotThrow(() => JSON.parse(json));
  });
});
