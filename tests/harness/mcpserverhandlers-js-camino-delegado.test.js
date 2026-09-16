'use strict';

/**
 * mcpserverhandlers-js-camino-delegado.test.js — cubre el camino de
 * delegacion real a Gemini (analizarArchivo grande, analizarContenido,
 * analizarRepositorio con manifiestos, resumirBacklog y buscarWeb exitosos),
 * ausente en tests/mcp-server-handlers.test.js por decision explicita de no
 * mockear @google/genai. Aqui se mockea GeminiApiClient.js (la capa que
 * McpServerHandlers.js consume via require desestructurado), no el SDK — el
 * mismo nivel de abstraccion que CrossVerifier/SubagentGrader mockean
 * ModelRegistry en vez del SDK de cada proveedor.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

const CLIENT_PATH  = require.resolve('../../scripts/services/GeminiApiClient');
const HANDLER_PATH = require.resolve('../../scripts/services/McpServerHandlers');

function mockearGeminiApiClient(overrides = {}) {
  delete require.cache[HANDLER_PATH];
  require.cache[CLIENT_PATH] = {
    id: CLIENT_PATH,
    filename: CLIENT_PATH,
    loaded: true,
    exports: {
      GEMINI_DEFAULT: 'gemini-3.7-flash',
      getModel: overrides.getModel || (() => ({
        generateContent: async () => ({ response: { text: () => '{}', candidates: [] } }),
      })),
      isRefusal: overrides.isRefusal || (() => false),
      extractJson: overrides.extractJson || ((raw) => JSON.parse(raw)),
      callWithRetry: overrides.callWithRetry || (async () => ({ parsed: {}, warnings: [] })),
      compactarSiNecesario: overrides.compactarSiNecesario || (async (parsed, modelo) => ({ ...parsed, _ia_activa: modelo })),
    },
  };
}

function restaurarModulos() {
  delete require.cache[CLIENT_PATH];
  delete require.cache[HANDLER_PATH];
}

describe('McpServerHandlers.js — camino delegado (Gemini mockeado)', () => {
  test('analizarArchivo: archivo grande delega, incluye metadatos y aplica truncarOutputGemini al resumen', async () => {
    mockearGeminiApiClient({
      callWithRetry: async () => ({
        parsed: { resumen: 'x'.repeat(50), hallazgos_clave: ['h1'], recomendaciones: [], advertencias: [] },
        warnings: ['advertencia de prueba'],
      }),
    });

    const tmp = path.join(os.tmpdir(), `mcp-delegado-${Date.now()}.txt`);
    const contenidoGrande = Array.from({ length: 600 }, (_, i) => `linea ${i}`).join('\n');
    fs.writeFileSync(tmp, contenidoGrande, 'utf8');

    const { analizarArchivo } = require(HANDLER_PATH);
    let resultado;
    try {
      resultado = await analizarArchivo({ ruta: tmp, mision: 'resumir' });
    } finally {
      fs.unlinkSync(tmp);
      restaurarModulos();
    }

    assert.equal(resultado.delegado, true);
    assert.equal(resultado.metadatos.modelo, 'gemini-3.7-flash');
    assert.ok(resultado.metadatos.lineas > 500);
    assert.deepEqual(resultado.calidad_warnings, ['advertencia de prueba']);
    assert.equal(resultado.resumen, 'x'.repeat(50));
  });

  test('analizarArchivo: error de Gemini durante la delegacion se retorna como { error }, sin propagar', async () => {
    mockearGeminiApiClient({
      callWithRetry: async () => { throw new Error('fallo simulado de Gemini'); },
    });

    const tmp = path.join(os.tmpdir(), `mcp-delegado-err-${Date.now()}.txt`);
    fs.writeFileSync(tmp, Array.from({ length: 600 }, (_, i) => `linea ${i}`).join('\n'), 'utf8');

    const { analizarArchivo } = require(HANDLER_PATH);
    let resultado;
    try {
      resultado = await analizarArchivo({ ruta: tmp, mision: 'x' });
    } finally {
      fs.unlinkSync(tmp);
      restaurarModulos();
    }

    assert.match(resultado.error, /Gemini error: fallo simulado de Gemini/);
  });

  test('analizarContenido: delega y retorna metadatos sin campo lineas (a diferencia de analizarArchivo)', async () => {
    mockearGeminiApiClient({
      callWithRetry: async () => ({
        parsed: { resumen: 'resumen de contenido', hallazgos_clave: [], recomendaciones: [], advertencias: [] },
        warnings: [],
      }),
    });

    const { analizarContenido } = require(HANDLER_PATH);
    let resultado;
    try {
      resultado = await analizarContenido({ contenido: 'contenido arbitrario', mision: 'analizar' });
    } finally {
      restaurarModulos();
    }

    assert.equal(resultado.delegado, true);
    assert.equal(resultado.metadatos.lineas, undefined);
    assert.equal(resultado.resumen, 'resumen de contenido');
  });

  test('analizarRepositorio: con manifiestos encontrados, delega y lista los manifiestos analizados', async () => {
    mockearGeminiApiClient({
      callWithRetry: async () => ({
        parsed: { stack: { lenguaje: 'JavaScript' }, resumen: 'repo de prueba' },
        warnings: [],
      }),
    });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-repo-'));
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"test"}', 'utf8');

    const { analizarRepositorio } = require(HANDLER_PATH);
    let resultado;
    try {
      resultado = await analizarRepositorio({ ruta_raiz: dir, mision: 'detectar stack' });
    } finally {
      fs.rmSync(dir, { recursive: true });
      restaurarModulos();
    }

    assert.equal(resultado.delegado, true);
    assert.deepEqual(resultado.metadatos.manifiestos_analizados, ['package.json']);
    assert.equal(resultado.stack.lenguaje, 'JavaScript');
  });

  test('resumirBacklog: camino exitoso parsea el JSON y aplica truncarOutputGemini', async () => {
    mockearGeminiApiClient({
      getModel: () => ({
        generateContent: async () => ({
          response: { text: () => '{"tareas_abiertas":[],"total_abiertas":0,"resumen":"sin tareas"}' },
        }),
      }),
      extractJson: (raw) => JSON.parse(raw),
    });

    const tmp = path.join(os.tmpdir(), `mcp-backlog-${Date.now()}.md`);
    fs.writeFileSync(tmp, '| #Tarea | Estatus |\n|---|---|\n', 'utf8');

    const { resumirBacklog } = require(HANDLER_PATH);
    let resultado;
    try {
      resultado = await resumirBacklog({ ruta_backlog: tmp });
    } finally {
      fs.unlinkSync(tmp);
      restaurarModulos();
    }

    assert.equal(resultado.delegado, true);
    assert.equal(resultado.total_abiertas, 0);
    assert.equal(resultado.resumen, 'sin tareas');
  });

  test('resumirBacklog: Gemini rechaza la solicitud, retorna { error } sin lanzar', async () => {
    mockearGeminiApiClient({
      getModel: () => ({
        generateContent: async () => ({ response: { text: () => 'lo siento, no puedo procesar esto' } }),
      }),
      isRefusal: () => true,
    });

    const tmp = path.join(os.tmpdir(), `mcp-backlog-rechazo-${Date.now()}.md`);
    fs.writeFileSync(tmp, '| #Tarea | Estatus |\n|---|---|\n', 'utf8');

    const { resumirBacklog } = require(HANDLER_PATH);
    let resultado;
    try {
      resultado = await resumirBacklog({ ruta_backlog: tmp });
    } finally {
      fs.unlinkSync(tmp);
      restaurarModulos();
    }

    assert.match(resultado.error, /Gemini rechazo el backlog/);
  });

  test('buscarWeb: camino exitoso incluye fuentes y queries del grounding', async () => {
    mockearGeminiApiClient({
      getModel: () => ({
        generateContent: async () => ({
          response: {
            text: () => 'resultado de la busqueda',
            candidates: [{
              groundingMetadata: {
                groundingChunks: [{ web: { uri: 'https://ejemplo.com/fuente' } }],
                webSearchQueries: ['consulta ejecutada'],
              },
            }],
          },
        }),
      }),
    });

    const { buscarWeb } = require(HANDLER_PATH);
    let resultado;
    try {
      resultado = await buscarWeb({ consulta: 'algo', mision: 'verificar' });
    } finally {
      restaurarModulos();
    }

    assert.equal(resultado.delegado, true);
    assert.deepEqual(resultado.fuentes, ['https://ejemplo.com/fuente']);
    assert.deepEqual(resultado.queries_ejecutadas, ['consulta ejecutada']);
    assert.equal(resultado.metadatos.grounding_activado, true);
  });

  test('buscarWeb: respuesta sin grounding metadata retorna fuentes/queries vacias', async () => {
    mockearGeminiApiClient({
      getModel: () => ({
        generateContent: async () => ({
          response: { text: () => 'respuesta sin grounding', candidates: [{}] },
        }),
      }),
    });

    const { buscarWeb } = require(HANDLER_PATH);
    let resultado;
    try {
      resultado = await buscarWeb({ consulta: 'algo', mision: 'verificar' });
    } finally {
      restaurarModulos();
    }

    assert.deepEqual(resultado.fuentes, []);
    assert.deepEqual(resultado.queries_ejecutadas, []);
    assert.equal(resultado.metadatos.grounding_activado, false);
  });

  test('buscarWeb: Gemini rechaza la busqueda, retorna { error } sin lanzar', async () => {
    mockearGeminiApiClient({
      getModel: () => ({
        generateContent: async () => ({ response: { text: () => 'lo siento, no puedo buscar eso' } }),
      }),
      isRefusal: () => true,
    });

    const { buscarWeb } = require(HANDLER_PATH);
    let resultado;
    try {
      resultado = await buscarWeb({ consulta: 'algo', mision: 'verificar' });
    } finally {
      restaurarModulos();
    }

    assert.match(resultado.error, /Gemini rechazo la busqueda/);
  });
});
