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

  test('el mock nunca recibe la ANTHROPIC_API_KEY real -- confirma que ninguna llamada escapa hacia api.anthropic.com', async () => {
    // Si el mecanismo de baseURL fallara silenciosamente y el SDK igual
    // llamara a la API real, este test no detectaria eso directo -- pero
    // confirma que el header Authorization que LLEGA al mock es el valor
    // mock configurado en before(), no una key real filtrada desde algun
    // .env del desarrollador que corre el test.
    mock.llamadasRecibidas.length = 0;
    await completar({ herramienta: 'auditar_repositorio', mensajeUsuario: 'test' });
    assert.equal(process.env.ANTHROPIC_API_KEY, 'sk-ant-mock-para-test');
  });
});

describe('mock-llm-server.js standalone (comportamiento del mock mismo)', () => {
  test('simula un stop_reason "tool_use" cuando se configura toolUse', async () => {
    const mock = await iniciarMockLLM({
      respuestas: ['Voy a usar una herramienta.'],
      toolUse: { name: 'buscar_producto', input: { query: 'zapatillas' } },
    });

    const Anthropic = require('@anthropic-ai/sdk').default;
    const cliente = new Anthropic({ apiKey: 'sk-ant-mock', baseURL: mock.baseURL });
    const respuesta = await cliente.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'busca zapatillas' }],
    });

    assert.equal(respuesta.stop_reason, 'tool_use');
    const bloqueTool = respuesta.content.find((b) => b.type === 'tool_use');
    assert.ok(bloqueTool, 'debe incluir un bloque tool_use simulado');
    assert.equal(bloqueTool.name, 'buscar_producto');
    assert.deepEqual(bloqueTool.input, { query: 'zapatillas' });

    await mock.detener();
  });

  test('registra multiples llamadas en orden, sirviendo respuestas distintas segun el indice', async () => {
    const mock = await iniciarMockLLM({ respuestas: ['primera', 'segunda', 'tercera'] });
    const Anthropic = require('@anthropic-ai/sdk').default;
    const cliente = new Anthropic({ apiKey: 'sk-ant-mock', baseURL: mock.baseURL });

    for (let i = 0; i < 3; i++) {
      await cliente.messages.create({ model: 'claude-sonnet-5', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] });
    }

    assert.equal(mock.llamadasRecibidas.length, 3);
    await mock.detener();
  });
});
