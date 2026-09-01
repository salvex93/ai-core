/**
 * gemini-api-client.test.js — Tests de regresion para GeminiApiClient.js
 * Ejecutar: node --test tests/
 * Compatible: Node >= 18 (node:test nativo, sin dependencias externas)
 *
 * Cubre solo las funciones puras exportadas (sin llamada de red real):
 * isRefusal y extractJson. getModel/callWithRetry/compactarSiNecesario
 * requieren GEMINI_API_KEY y una respuesta real del SDK — fuera del
 * alcance de un test unitario aislado sin mocking del SDK de Google.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { GEMINI_DEFAULT, isRefusal, extractJson, parseEnvContent } = require('../scripts/services/GeminiApiClient');

describe('GeminiApiClient — constantes', () => {
  test('GEMINI_DEFAULT es el modelo esperado', () => {
    assert.equal(GEMINI_DEFAULT, 'gemini-3.7-flash');
  });
});

describe('parseEnvContent', () => {
  test('parsea lineas con terminador LF (Unix)', () => {
    const resultado = parseEnvContent('GEMINI_API_KEY=abc123\nOTRA=valor');
    assert.deepEqual(resultado, { GEMINI_API_KEY: 'abc123', OTRA: 'valor' });
  });

  test('parsea lineas con terminador CRLF (Windows) — issue #254', () => {
    const resultado = parseEnvContent('GEMINI_API_KEY=abc123\r\nOTRA=valor\r\n');
    assert.deepEqual(resultado, { GEMINI_API_KEY: 'abc123', OTRA: 'valor' });
  });

  test('ignora comentarios y lineas vacias', () => {
    const resultado = parseEnvContent('# comentario\r\nCLAVE=valor\r\n\r\n');
    assert.deepEqual(resultado, { CLAVE: 'valor' });
  });

  test('quita comillas envolventes del valor', () => {
    const resultado = parseEnvContent('CLAVE="valor con espacios"\r\n');
    assert.deepEqual(resultado, { CLAVE: 'valor con espacios' });
  });
});

describe('isRefusal', () => {
  test('detecta rechazo en espanol ("lo siento", "no puedo")', () => {
    assert.equal(isRefusal('Lo siento, no puedo ayudar con eso'), true);
  });

  test('detecta rechazo en ingles ("i cannot", "sorry")', () => {
    assert.equal(isRefusal('Sorry, I cannot process this request'), true);
  });

  test('detecta mensaje de error de API', () => {
    assert.equal(isRefusal('Error de API: cuota excedida'), true);
  });

  test('respuesta normal no se marca como rechazo', () => {
    assert.equal(isRefusal('{"resumen": "El archivo implementa un patron Factory"}'), false);
  });
});

describe('getModel — timeout real ante SDK colgado', () => {
  const GENAI_PATH  = require.resolve('@google/genai');
  const CLIENT_PATH = require.resolve('../scripts/services/GeminiApiClient');

  // Inyecta un mock de @google/genai en require.cache antes de cargar
  // GeminiApiClient.js -- mismo mecanismo ya usado en model-dispatcher.test.js
  // para ModelRegistry. Sin esto, el test dependeria de una llamada de red
  // real y no reproduciria de forma determinista el colgado observado en
  // produccion (confirmado 2026-09-01: la misma llamada via REST directo a
  // la API de Gemini responde en segundos, pero @google/genai puede quedarse
  // sin resolver ni rechazar indefinidamente).
  function mockearGenaiColgado() {
    delete require.cache[CLIENT_PATH];
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
    delete require.cache[CLIENT_PATH];
  }

  test('generateContent() corta con error explicito en vez de colgarse indefinidamente', async () => {
    mockearGenaiColgado();
    process.env.GEMINI_API_KEY = 'test-key-fake';
    process.env.AI_CORE_GEMINI_TIMEOUT_MS = '200'; // timeout corto solo para este test

    const { getModel } = require('../scripts/services/GeminiApiClient');
    const model = getModel({ model: 'gemini-3.7-flash' });

    await assert.rejects(
      () => model.generateContent('di solo OK'),
      /timeout|no respondio|colgad/i,
      'debe rechazar con error explicito en vez de colgarse indefinidamente'
    );

    delete process.env.AI_CORE_GEMINI_TIMEOUT_MS;
    restaurarModulos();
  });

  test('generateContent() se recupera solo si el colgado es transitorio (falla 1 vez, responde bien despues) -- patron de industria: timeout + retry con backoff, no timeout de intento unico', async () => {
    // Escenario real confirmado en produccion: la primera llamada al SDK se
    // cuelga, pero el siguiente intento responde en segundos (verificado
    // contra la API real via REST directo). Sin retry, ese primer colgado
    // se propagaba como fallo definitivo aunque el problema fuera transitorio.
    delete require.cache[CLIENT_PATH];
    let intento = 0;
    require.cache[GENAI_PATH] = {
      id: GENAI_PATH,
      filename: GENAI_PATH,
      loaded: true,
      exports: {
        GoogleGenAI: class GoogleGenAIIntermitente {
          constructor() {
            this.models = {
              generateContent: () => {
                intento++;
                if (intento === 1) return new Promise(() => {}); // primer intento se cuelga
                return Promise.resolve({ text: 'OK segundo intento', candidates: [] });
              },
            };
          }
        },
      },
    };

    process.env.GEMINI_API_KEY = 'test-key-fake';
    process.env.AI_CORE_GEMINI_TIMEOUT_MS = '150';

    const { getModel } = require('../scripts/services/GeminiApiClient');
    const model = getModel({ model: 'gemini-3.7-flash' });
    const result = await model.generateContent('di solo OK');

    assert.equal(result.response.text(), 'OK segundo intento', 'debe recuperarse en el reintento sin propagar el timeout del primer intento');
    assert.equal(intento, 2, 'debe haber intentado exactamente 2 veces (1 colgado + 1 exitoso)');

    delete process.env.AI_CORE_GEMINI_TIMEOUT_MS;
    restaurarModulos();
  });
});

describe('extractJson', () => {
  test('parsea JSON plano sin markdown fence', () => {
    const resultado = extractJson('{"resumen": "ok", "hallazgos_clave": []}');
    assert.deepEqual(resultado, { resumen: 'ok', hallazgos_clave: [] });
  });

  test('extrae JSON envuelto en markdown fence ```json', () => {
    const raw = '```json\n{"resumen": "ok"}\n```';
    assert.deepEqual(extractJson(raw), { resumen: 'ok' });
  });

  test('extrae JSON envuelto en fence generico sin especificar lenguaje', () => {
    const raw = '```\n{"resumen": "ok"}\n```';
    assert.deepEqual(extractJson(raw), { resumen: 'ok' });
  });

  test('lanza error si el texto es un rechazo de Gemini', () => {
    assert.throws(() => extractJson('Lo siento, no puedo procesar eso'), /rechazo la solicitud/);
  });

  test('lanza error si el contenido no es JSON valido', () => {
    assert.throws(() => extractJson('esto no es json'));
  });
});
