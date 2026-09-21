'use strict';

/**
 * mcpserverhandlers-js-cuota.test.js — los handlers capturan el error de
 * Gemini y devuelven { error } en vez de lanzarlo, asi que el catch externo de
 * mcp-gemini.js nunca veia un 429 real y el marcador de cuota no se escribia.
 * Aqui se verifica que el propio handler marque la cuota agotada.
 */

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

const CLIENT_PATH  = require.resolve('../../scripts/services/GeminiApiClient');
const HANDLER_PATH = require.resolve('../../scripts/services/McpServerHandlers');
const { cuotaAgotada } = require('../../.claude/bin/lib/gemini-cuota');

const ERROR_429 = 'You exceeded your current quota. RESOURCE_EXHAUSTED';

function cargarHandlersConFallo(mensaje) {
  const fallo = async () => { throw new Error(mensaje); };
  delete require.cache[HANDLER_PATH];
  require.cache[CLIENT_PATH] = {
    id: CLIENT_PATH,
    filename: CLIENT_PATH,
    loaded: true,
    exports: {
      GEMINI_DEFAULT: 'gemini-3.7-flash',
      getModel: () => ({ generateContent: fallo }),
      isRefusal: () => false,
      extractJson: (raw) => JSON.parse(raw),
      callWithRetry: fallo,
      compactarSiNecesario: async (parsed) => parsed,
    },
  };
  return require(HANDLER_PATH);
}

function dirTemporal() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuota-handlers-'));
  process.env.AI_CORE_GEMINI_CUOTA_DIR = dir;
  return dir;
}

afterEach(() => {
  delete process.env.AI_CORE_GEMINI_CUOTA_DIR;
  delete require.cache[CLIENT_PATH];
  delete require.cache[HANDLER_PATH];
});

describe('McpServerHandlers.js — marcador de cuota', () => {
  test('buscarWeb con 429 devuelve { error } y marca la cuota agotada', async () => {
    const dir = dirTemporal();
    const { buscarWeb } = cargarHandlersConFallo(ERROR_429);
    const res = await buscarWeb({ consulta: 'x', mision: 'y' });
    assert.match(res.error, /quota/);
    assert.equal(cuotaAgotada(Date.now(), dir), true);
  });

  test('analizarContenido con 429 marca la cuota agotada', async () => {
    const dir = dirTemporal();
    const { analizarContenido } = cargarHandlersConFallo(ERROR_429);
    const res = await analizarContenido({ contenido: 'x', mision: 'y' });
    assert.match(res.error, /quota/);
    assert.equal(cuotaAgotada(Date.now(), dir), true);
  });

  test('un error que no es de cuota no marca el marcador', async () => {
    const dir = dirTemporal();
    const { buscarWeb } = cargarHandlersConFallo('fallo de red');
    const res = await buscarWeb({ consulta: 'x', mision: 'y' });
    assert.match(res.error, /fallo de red/);
    assert.equal(cuotaAgotada(Date.now(), dir), false);
  });
});
