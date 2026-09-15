'use strict';

/**
 * geminiadapter-js-respuesta-exitosa.test.js — camino feliz de chatGemini(),
 * no cubierto por geminiadapter-js-timeout-colgado.test.js (que solo ejerce
 * el rechazo por timeout). Cubre construccion de contents/systemInstruction
 * y el fallback de usage a 0 cuando usageMetadata viene ausente.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const GENAI_PATH   = require.resolve('@google/genai');
const ADAPTER_PATH = require.resolve('../../scripts/services/model-adapters/GeminiAdapter');

function mockearGenaiExitoso(resultado, capturarLlamada) {
  delete require.cache[ADAPTER_PATH];
  require.cache[GENAI_PATH] = {
    id: GENAI_PATH,
    filename: GENAI_PATH,
    loaded: true,
    exports: {
      GoogleGenAI: class GoogleGenAIExitoso {
        constructor() {
          this.models = {
            generateContent: async (params) => {
              if (capturarLlamada) capturarLlamada(params);
              return resultado;
            },
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

describe('GeminiAdapter.chatGemini — camino exitoso', () => {
  test('con usageMetadata presente, mapea input/output tokens reales', async () => {
    mockearGenaiExitoso({
      text: 'respuesta de prueba',
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 34 },
    });
    process.env.GEMINI_API_KEY = 'test-key-fake';

    const { chatGemini } = require('../../scripts/services/model-adapters/GeminiAdapter');
    const resultado = await chatGemini([{ role: 'user', content: 'hola' }]);

    assert.equal(resultado.content, 'respuesta de prueba');
    assert.equal(resultado.provider, 'gemini');
    assert.equal(resultado.model, 'gemini-3.7-flash');
    assert.equal(resultado.usage.input_tokens, 12);
    assert.equal(resultado.usage.output_tokens, 34);

    restaurarModulos();
  });

  test('sin usageMetadata, hace fallback a 0 tokens sin lanzar excepcion', async () => {
    mockearGenaiExitoso({ text: 'ok' });
    process.env.GEMINI_API_KEY = 'test-key-fake';

    const { chatGemini } = require('../../scripts/services/model-adapters/GeminiAdapter');
    const resultado = await chatGemini([{ role: 'user', content: 'hola' }]);

    assert.equal(resultado.usage.input_tokens, 0);
    assert.equal(resultado.usage.output_tokens, 0);

    restaurarModulos();
  });

  test('separa mensajes system de user/assistant y arma systemInstruction', async () => {
    let paramsCapturados;
    mockearGenaiExitoso({ text: 'ok' }, (params) => { paramsCapturados = params; });
    process.env.GEMINI_API_KEY = 'test-key-fake';

    const { chatGemini } = require('../../scripts/services/model-adapters/GeminiAdapter');
    await chatGemini([
      { role: 'system', content: 'eres un asistente tecnico' },
      { role: 'user', content: 'pregunta' },
      { role: 'assistant', content: 'respuesta previa' },
    ]);

    assert.equal(paramsCapturados.config.systemInstruction, 'eres un asistente tecnico');
    assert.equal(paramsCapturados.contents.length, 2);
    assert.equal(paramsCapturados.contents[0].role, 'user');
    assert.equal(paramsCapturados.contents[1].role, 'model');

    restaurarModulos();
  });

  test('sin mensaje system, no incluye config.systemInstruction', async () => {
    let paramsCapturados;
    mockearGenaiExitoso({ text: 'ok' }, (params) => { paramsCapturados = params; });
    process.env.GEMINI_API_KEY = 'test-key-fake';

    const { chatGemini } = require('../../scripts/services/model-adapters/GeminiAdapter');
    await chatGemini([{ role: 'user', content: 'pregunta sin system' }]);

    assert.equal(paramsCapturados.config, undefined);

    restaurarModulos();
  });

  test('respeta options.model en vez del default cuando se provee', async () => {
    let paramsCapturados;
    mockearGenaiExitoso({ text: 'ok' }, (params) => { paramsCapturados = params; });
    process.env.GEMINI_API_KEY = 'test-key-fake';

    const { chatGemini } = require('../../scripts/services/model-adapters/GeminiAdapter');
    const resultado = await chatGemini(
      [{ role: 'user', content: 'hola' }],
      { model: 'gemini-3.1-pro-preview' }
    );

    assert.equal(paramsCapturados.model, 'gemini-3.1-pro-preview');
    assert.equal(resultado.model, 'gemini-3.1-pro-preview');

    restaurarModulos();
  });
});
