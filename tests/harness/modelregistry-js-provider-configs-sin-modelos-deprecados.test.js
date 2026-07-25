'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('ModelRegistry.js — PROVIDER_CONFIGS sin modelos deprecados', () => {
  const { PROVIDER_CONFIGS } = require(path.join(REPO, 'scripts', 'services', 'ModelRegistry.js'));

  // Nombres de modelo confirmados como retirados o con fecha de sunset ya
  // pasada/inminente a julio 2026 -- si alguno reaparece como defaultModel,
  // es una regresion (ver comentarios junto a cada defaultModel en el archivo
  // para el reemplazo vigente y la fuente).
  const DEPRECADOS = ['gpt-4o-mini', 'gpt-4o', 'deepseek-chat', 'deepseek-reasoner', 'moonshot-v1-8k', 'moonshot-v1'];

  test('ningun defaultModel usa un identificador deprecado', () => {
    for (const [proveedor, cfg] of Object.entries(PROVIDER_CONFIGS)) {
      assert.ok(
        !DEPRECADOS.includes(cfg.defaultModel),
        `${proveedor}.defaultModel ("${cfg.defaultModel}") es un modelo deprecado — actualizar`
      );
    }
  });
});

// ─── OpenAICompatAdapter.js — construccion del body ──────────────────────────
