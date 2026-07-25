'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('health-worker.js', () => {
  const SCRIPT = path.join(BIN, 'health-worker.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('getLocalModels ya no filtra por el string obsoleto "gemini-2.5-flash"', () => {
    // Regresion real: el filtro estaba hardcodeado al nombre viejo del modelo
    // Gemini (gemini-2.5-flash), que ya cambio a gemini-3.5-flash -- el string
    // literal nunca hacia match, dejando el filtro sin efecto silenciosamente.
    const content = fs.readFileSync(SCRIPT, 'utf8');
    assert.ok(!content.includes("'gemini-2.5-flash'"), 'no debe quedar el string hardcodeado obsoleto');
    assert.ok(content.includes('MODELOS_LOCALES.GEMINI'), 'debe filtrar por referencia a MODELOS.GEMINI, no por string');
  });
});

// ─── git-queue-advisor.js ─────────────────────────────────────────────────────
