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

describe('GeminiAdapter.js y ModelRouter.js — sin modelo Gemini desactualizado, sin SDK deprecado', () => {
  const adapterSrc = fs.readFileSync(
    path.join(REPO, 'scripts', 'services', 'model-adapters', 'GeminiAdapter.js'),
    'utf8'
  );
  const routerSrc = fs.readFileSync(path.join(REPO, 'scripts', 'services', 'ModelRouter.js'), 'utf8');

  // gemini-3.5-flash fue el default hasta 2026-08-03; verificado contra
  // ai.google.dev que gemini-3.6-flash lo reemplaza con mejor pricing de
  // output ($1.50/$7.50 vs $1.50/$9 por 1M) -- ver CLAUDE.md, seccion
  // "Limites operativos Gemini free tier".
  test('GeminiAdapter.js no usa gemini-3.5-flash como default', () => {
    assert.ok(
      !/options\.model\s*\|\|\s*['"]gemini-3\.5-flash['"]/.test(adapterSrc),
      'GeminiAdapter.js sigue usando gemini-3.5-flash como default -- actualizar a gemini-3.6-flash'
    );
  });

  test('ModelRouter.js MODELOS.GEMINI no usa gemini-3.5-flash', () => {
    const { MODELOS } = require(path.join(REPO, 'scripts', 'services', 'ModelRouter.js'));
    assert.notEqual(
      MODELOS.GEMINI,
      'gemini-3.5-flash',
      'ModelRouter.js MODELOS.GEMINI sigue apuntando a gemini-3.5-flash -- actualizar a gemini-3.6-flash'
    );
  });

  // @google/generative-ai fue renombrado por Google a deprecated-generative-ai-js;
  // el sucesor activo es @google/genai (confirmado 2026-08-03).
  test('GeminiAdapter.js no importa el SDK deprecado @google/generative-ai', () => {
    assert.ok(
      !/require\(['"]@google\/generative-ai['"]\)/.test(adapterSrc),
      'GeminiAdapter.js sigue importando @google/generative-ai (deprecado) -- migrar a @google/genai'
    );
  });

  test('package.json declara @google/genai, no el SDK deprecado como dependencia nueva', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    assert.ok(pkg.dependencies['@google/genai'], 'package.json debe declarar @google/genai');
  });
});

// ─── OpenAICompatAdapter.js — construccion del body ──────────────────────────
