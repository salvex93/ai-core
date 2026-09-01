'use strict';

/**
 * geminiadapter-js-timeout-colgado.test.js — Regresion del mismo bug real
 * de GeminiApiClient.js (colgado confirmado en produccion 2026-09-01):
 * @google/genai puede quedarse sin resolver ni rechazar indefinidamente,
 * pese a que la misma llamada via REST directo a la API de Gemini responde
 * en segundos. GeminiAdapter.js (usado por ModelRegistry.chat() -> chat
 * general del proyecto, incluido CrossVerifier.js y SubagentGrader.js) tenia
 * el mismo await ai.models.generateContent() sin ningun timeout.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const GENAI_PATH   = require.resolve('@google/genai');
const ADAPTER_PATH = require.resolve('../../scripts/services/model-adapters/GeminiAdapter');

function mockearGenaiColgado() {
  delete require.cache[ADAPTER_PATH];
  require.cache[GENAI_PATH] = {
    id: GENAI_PATH,
    filename: GENAI_PATH,
    loaded: true,
    exports: {
      GoogleGenAI: class GoogleGenAIColgado {
        constructor() {
          this.models = {
            generateContent: () => new Promise(() => {}), // nunca resuelve ni rechaza
          };
        }
      },
    },
  };
}

function restaurarModulos() {
  delete require.cache[GENAI_PATH];
  delete require.cache[ADAPTER_PATH];
}

describe('GeminiAdapter.chatGemini — timeout real ante SDK colgado', () => {
  test('rechaza con error explicito en vez de colgarse indefinidamente', async () => {
    mockearGenaiColgado();
    process.env.GEMINI_API_KEY = 'test-key-fake';
    process.env.AI_CORE_GEMINI_TIMEOUT_MS = '200';

    const { chatGemini } = require('../../scripts/services/model-adapters/GeminiAdapter');

    await assert.rejects(
      () => chatGemini([{ role: 'user', content: 'di solo OK' }]),
      /timeout|no respondio|colgad/i,
      'debe rechazar con error explicito en vez de colgarse indefinidamente'
    );

    delete process.env.AI_CORE_GEMINI_TIMEOUT_MS;
    restaurarModulos();
  });
});
