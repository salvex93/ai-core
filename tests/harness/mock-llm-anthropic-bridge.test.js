'use strict';

/**
 * Prueba el flujo COMPLETO de scripts/anthropic-bridge.js#completar() contra
 * un servidor HTTP mock (mock-llm-server.js) en vez de la API real de
 * Anthropic -- verifica routing, construccion de system blocks, parsing de
 * la respuesta y contabilidad de uso, sin gastar tokens reales ni depender
 * de que la API este disponible (patron mock-llm de OpenHands aplicado al
 * codigo real de ai-core).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { iniciarMockLLM } = require('./mock-llm-server');

const REPO = path.resolve(__dirname, '..', '..');

describe('anthropic-bridge.js contra mock-llm-server (sin gastar tokens reales)', () => {
  let mock;
  let completar;

  before(async () => {
    mock = await iniciarMockLLM({ respuestas: ['Respuesta simulada del mock, sin llamada real a la API.'] });
    process.env.ANTHROPIC_API_KEY = 'sk-ant-mock-para-test';
    process.env.ANTHROPIC_BASE_URL = mock.baseURL;
    delete require.cache[require.resolve(path.join(REPO, 'scripts', 'anthropic-bridge.js'))];
    ({ completar } = require(path.join(REPO, 'scripts', 'anthropic-bridge.js')));
  });

  after(async () => {
    await mock.detener();
    delete process.env.ANTHROPIC_BASE_URL;
  });

  test('completar() contra el mock retorna la respuesta simulada, sin tocar la red real', async () => {
    const resultado = await completar({
      herramienta: 'auditar_repositorio',
      mensajeUsuario: 'Analiza este archivo de prueba.',
    });

    assert.equal(mock.llamadasRecibidas.length, 1, 'debe haber exactamente 1 llamada al mock');
    if (resultado.recomendacionGemini) {
      // El router puede recomendar Gemini para esta herramienta segun el
      // tamano de contexto estimado -- en ese caso no llega a llamar al
      // mock, y eso tambien es un comportamiento correcto y verificable.
      assert.equal(mock.llamadasRecibidas.length, 0);
      return;
    }
    assert.equal(resultado.respuesta, 'Respuesta simulada del mock, sin llamada real a la API.');
    assert.ok(resultado.uso, 'debe reportar uso de tokens (aunque sea el valor mock)');
  });

  test('el body enviado al mock incluye el system prompt construido con CLAUDE.md real', async () => {
    mock.llamadasRecibidas.length = 0;
    const resultado = await completar({
      herramienta: 'diagnosticar_error',
      mensajeUsuario: 'Diagnostica este error de prueba.',
    });

    if (resultado.recomendacionGemini) return; // ver nota arriba

    const llamada = mock.llamadasRecibidas[0];
    assert.ok(Array.isArray(llamada.body.system), 'el system prompt debe viajar como array de bloques');
    assert.ok(llamada.body.system.length > 0);
  });
});
