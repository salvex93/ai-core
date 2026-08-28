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
    assert.equal(GEMINI_DEFAULT, 'gemini-3.6-flash');
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
