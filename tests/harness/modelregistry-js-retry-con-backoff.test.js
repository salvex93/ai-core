'use strict';

/**
 * ModelRegistry.js — integracion del retry con backoff (gap real detectado
 * por investigacion de mercado 2026-08-15): chatGemini() y
 * chatOpenAICompat() no tenian ningun mecanismo de reintento ante errores
 * transitorios (429, 5xx, timeout de conexion), a diferencia del SDK de
 * Anthropic que ya reintenta por defecto. Se mockean los adapters via
 * require.cache para verificar el comportamiento de chat() sin red real ni
 * esperas largas (base de backoff = 1ms en las opciones de test).
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { REPO } = require('./_shared');

const GEMINI_ADAPTER_PATH = path.join(REPO, 'scripts', 'services', 'model-adapters', 'GeminiAdapter.js');
const OPENAI_ADAPTER_PATH = path.join(REPO, 'scripts', 'services', 'model-adapters', 'OpenAICompatAdapter.js');
const REGISTRY_PATH       = path.join(REPO, 'scripts', 'services', 'ModelRegistry.js');

function limpiarCache() {
  delete require.cache[require.resolve(GEMINI_ADAPTER_PATH)];
  delete require.cache[require.resolve(OPENAI_ADAPTER_PATH)];
  delete require.cache[require.resolve(REGISTRY_PATH)];
}

describe('ModelRegistry.js — retry con backoff en Gemini/OpenAI-compat', () => {
  beforeEach(limpiarCache);
  afterEach(limpiarCache);

  test('chat("gemini", ...) reintenta un error transitorio (status 429) y resuelve al segundo intento', async () => {
    let llamadas = 0;
    require.cache[require.resolve(GEMINI_ADAPTER_PATH)] = {
      id: GEMINI_ADAPTER_PATH,
      filename: GEMINI_ADAPTER_PATH,
      loaded: true,
      exports: {
        chatGemini: async () => {
          llamadas++;
          if (llamadas < 2) { const e = new Error('rate limited'); e.status = 429; throw e; }
          return { content: 'ok', provider: 'gemini', model: 'test', usage: {} };
        },
      },
    };

    process.env.GEMINI_API_KEY = 'test-key';
    const { chat } = require(REGISTRY_PATH);
    const res = await chat('gemini', [{ role: 'user', content: 'hola' }]);
    assert.equal(res.content, 'ok');
    assert.equal(llamadas, 2, 'debe haber reintentado una vez tras el 429');
  });

  test('chat("gemini", ...) NO reintenta un error no transitorio (status 400) -- se propaga de inmediato', async () => {
    let llamadas = 0;
    require.cache[require.resolve(GEMINI_ADAPTER_PATH)] = {
      id: GEMINI_ADAPTER_PATH,
      filename: GEMINI_ADAPTER_PATH,
      loaded: true,
      exports: {
        chatGemini: async () => {
          llamadas++;
          const e = new Error('bad request'); e.status = 400; throw e;
        },
      },
    };

    process.env.GEMINI_API_KEY = 'test-key';
    const { chat } = require(REGISTRY_PATH);
    await assert.rejects(chat('gemini', [{ role: 'user', content: 'hola' }]), /bad request/);
    assert.equal(llamadas, 1, 'un error 400 no debe reintentarse');
  });

  test('chat("openai", ...) reintenta un error transitorio (status 503) via el mismo mecanismo', async () => {
    let llamadas = 0;
    require.cache[require.resolve(OPENAI_ADAPTER_PATH)] = {
      id: OPENAI_ADAPTER_PATH,
      filename: OPENAI_ADAPTER_PATH,
      loaded: true,
      exports: {
        PROVIDER_CONFIGS: { openai: { name: 'openai', apiKeyEnv: 'OPENAI_API_KEY', defaultModel: 'gpt-5.6-luna' } },
        chatOpenAICompat: async () => {
          llamadas++;
          if (llamadas < 2) { const e = new Error('service unavailable'); e.status = 503; throw e; }
          return { content: 'ok', provider: 'openai', model: 'gpt-5.6-luna', usage: {} };
        },
      },
    };

    process.env.OPENAI_API_KEY = 'test-key';
    const { chat } = require(REGISTRY_PATH);
    const res = await chat('openai', [{ role: 'user', content: 'hola' }]);
    assert.equal(res.content, 'ok');
    assert.equal(llamadas, 2, 'debe haber reintentado una vez tras el 503');
  });
});
