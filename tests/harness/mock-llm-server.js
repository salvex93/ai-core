'use strict';

/**
 * mock-llm-server.js — Servidor HTTP minimo que imita el endpoint
 * /v1/messages de la Claude API, para testear el comportamiento COMPLETO de
 * un agente autonomo (loop real, parsing de tool_use, manejo de
 * stop_reason) sin gastar tokens reales ni depender de que la API este
 * disponible.
 *
 * Patron equivalente a mock-llm / mock-llm-docker de OpenHands (hallazgo de
 * auditoria de mercado 2026-08-15): en vez de mockear la funcion de cliente
 * a nivel de codigo (lo que ya cubre agent-testing skill con vi.fn()/
 * unittest.mock), este servidor intercepta la llamada HTTP real -- permite
 * testear codigo que construye su propio cliente `@anthropic-ai/sdk`
 * internamente (como scripts/anthropic-bridge.js) sin tener que inyectar un
 * mock a nivel de import.
 *
 * Mecanismo: el SDK de Anthropic acepta `baseURL` configurable. Levantar
 * este servidor y pasar `ANTHROPIC_BASE_URL=http://localhost:<puerto>` (o
 * pasar baseURL directo al construir el cliente) redirige las llamadas
 * aqui en vez de a api.anthropic.com -- sin tocar el codigo de produccion.
 *
 * Uso:
 *   const { iniciarMockLLM } = require('./mock-llm-server');
 *   const mock = await iniciarMockLLM({ respuestas: ['primera respuesta', 'segunda respuesta'] });
 *   // ... invocar codigo que usa ANTHROPIC_BASE_URL=mock.baseURL ...
 *   assert.equal(mock.llamadasRecibidas.length, 1);
 *   await mock.detener();
 */

const http = require('node:http');

/**
 * @param {Object} opts
 * @param {string[]|function} [opts.respuestas] - textos de respuesta en orden (una por llamada), o funcion (body) => texto
 * @param {number} [opts.status] - status HTTP a devolver (default 200)
 * @param {string} [opts.stopReason] - stop_reason a devolver (default 'end_turn')
 * @param {Array}  [opts.toolUse] - si se define, la primera respuesta incluye un bloque tool_use con este input
 */
function iniciarMockLLM(opts = {}) {
  const {
    respuestas = ['respuesta mock por defecto'],
    status = 200,
    stopReason = 'end_turn',
    toolUse = null,
  } = opts;

  const llamadasRecibidas = [];
  let indiceRespuesta = 0;

  const server = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (chunk) => { cuerpo += chunk; });
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(cuerpo); } catch { /* body no-JSON, se registra igual */ }
      llamadasRecibidas.push({ url: req.url, method: req.method, body: parsed });

      const textoRespuesta = typeof respuestas === 'function'
        ? respuestas(parsed)
        : respuestas[Math.min(indiceRespuesta, respuestas.length - 1)];
      indiceRespuesta++;

      const content = [{ type: 'text', text: textoRespuesta }];
      if (toolUse && indiceRespuesta === 1) {
        content.push({ type: 'tool_use', id: 'mocktool_01', name: toolUse.name, input: toolUse.input });
      }

      const respuestaApi = {
        id: `msg_mock_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content,
        model: parsed.model || 'claude-sonnet-5',
        stop_reason: toolUse && indiceRespuesta === 1 ? 'tool_use' : stopReason,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(respuestaApi));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseURL: `http://127.0.0.1:${port}`,
        llamadasRecibidas,
        detener: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

module.exports = { iniciarMockLLM };
