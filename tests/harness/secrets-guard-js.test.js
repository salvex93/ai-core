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

  test('solo advierte (exit 0) para patron de confianza media', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_USER_PROMPT: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2:f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2',
    });
    assert.ok(r.stdout.includes('[secrets-guard]'), 'debe advertir sobre el patron detectado');
    assert.equal(r.status, 0, 'confianza media no bloquea');
  });
});

// ─── session-summary.js ──────────────────────────────────────────────────────
