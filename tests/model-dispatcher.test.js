/**
 * model-dispatcher.test.js — Tests de regresion para ModelDispatcher.js
 * Ejecutar: node --test tests/
 * Compatible: Node >= 18 (node:test nativo, sin dependencias externas)
 *
 * Mockea ModelRegistry.chat() via require.cache — sin llamadas HTTP reales
 * a Gemini/DeepSeek/Anthropic. El proyecto no usa un framework de mocking:
 * se inyecta el modulo falso en la ruta resuelta antes de requerir
 * ModelDispatcher.js, siguiendo el mecanismo nativo de CommonJS.
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');

const REGISTRY_PATH   = require.resolve('../scripts/services/ModelRegistry');
const DISPATCHER_PATH = require.resolve('../scripts/services/ModelDispatcher');

// Reemplaza ModelRegistry en el cache de require con un mock controlable,
// y limpia tambien ModelDispatcher para forzar que vuelva a resolver el
// require('./ModelRegistry') contra el mock recien inyectado.
function mockearRegistry(chatMock) {
  delete require.cache[DISPATCHER_PATH];
  require.cache[REGISTRY_PATH] = {
    id: REGISTRY_PATH,
    filename: REGISTRY_PATH,
    loaded: true,
    exports: { chat: chatMock },
  };
}

function restaurarModulos() {
  delete require.cache[REGISTRY_PATH];
  delete require.cache[DISPATCHER_PATH];
}

describe('ModelDispatcher.executeMoATask — fan-out/fan-in con fallback aislado', () => {
  afterEach(() => restaurarModulos());

  test('ambos workers resuelven: combina ContextGathering y SyntaxDrafting en el string final', async () => {
    mockearRegistry(async (provider) => {
      if (provider === 'gemini')   return { content: 'CONTEXTO-GEMINI-OK', provider };
      if (provider === 'deepseek') return { content: 'BORRADOR-DEEPSEEK-OK', provider };
      throw new Error(`proveedor inesperado en el test: ${provider}`);
    });

    const { executeMoATask } = require('../scripts/services/ModelDispatcher');
    const { resultado, fallos } = await executeMoATask('implementa la funcion X');

    assert.equal(fallos.length, 0);
    assert.match(resultado, /CONTEXTO-GEMINI-OK/);
    assert.match(resultado, /BORRADOR-DEEPSEEK-OK/);
  });

  test('ContextGathering (Gemini) falla: SyntaxDrafting sigue presente y se reporta el fallo aislado', async () => {
    mockearRegistry(async (provider) => {
      if (provider === 'gemini')   throw new Error('rate limit excedido');
      if (provider === 'deepseek') return { content: 'BORRADOR-DEEPSEEK-OK', provider };
      throw new Error(`proveedor inesperado: ${provider}`);
    });

    const { executeMoATask } = require('../scripts/services/ModelDispatcher');
    const { resultado, fallos } = await executeMoATask('implementa la funcion X');

    assert.equal(fallos.length, 1);
    assert.match(fallos[0], /ContextGathering/);
    assert.match(fallos[0], /rate limit excedido/);
    assert.match(resultado, /sin contexto disponible/);
    assert.match(resultado, /BORRADOR-DEEPSEEK-OK/);
  });

  test('SyntaxDrafting (DeepSeek) falla: ContextGathering sigue presente y se reporta el fallo aislado', async () => {
    mockearRegistry(async (provider) => {
      if (provider === 'gemini')   return { content: 'CONTEXTO-GEMINI-OK', provider };
      if (provider === 'deepseek') throw new Error('DEEPSEEK_API_KEY no configurada en .env');
      throw new Error(`proveedor inesperado: ${provider}`);
    });

    const { executeMoATask } = require('../scripts/services/ModelDispatcher');
    const { resultado, fallos } = await executeMoATask('implementa la funcion X');

    assert.equal(fallos.length, 1);
    assert.match(fallos[0], /SyntaxDrafting/);
    assert.match(fallos[0], /DEEPSEEK_API_KEY/);
    assert.match(resultado, /CONTEXTO-GEMINI-OK/);
    assert.match(resultado, /sin borrador disponible/);
  });

  test('ambos workers fallan: el orquestador no crashea, degrada a contexto base vacio', async () => {
    mockearRegistry(async (provider) => {
      throw new Error(`timeout en ${provider}`);
    });

    const { executeMoATask } = require('../scripts/services/ModelDispatcher');
    const { resultado, fallos } = await executeMoATask('implementa la funcion X');

    assert.equal(fallos.length, 2);
    assert.match(resultado, /sin contexto disponible/);
    assert.match(resultado, /sin borrador disponible/);
  });

  test('el orquestador nunca rechaza (siempre resuelve), incluso con ambos workers caidos', async () => {
    mockearRegistry(async () => { throw new Error('proveedor caido'); });

    const { executeMoATask } = require('../scripts/services/ModelDispatcher');
    await assert.doesNotReject(executeMoATask('cualquier prompt'));
  });

  test('las dos sub-tareas se ejecutan concurrentemente, no en serie', async () => {
    // Verificar concurrencia por ORDEN DE EVENTOS, no por umbral de tiempo
    // real -- un assert basado en "duracion < Nms" es flaky bajo carga de
    // CPU (falla intermitentemente cuando toda la suite corre junto con
    // muchos spawnSync reales, aunque la ejecucion SI sea concurrente).
    const eventos = [];
    let resueltos = 0;
    mockearRegistry(async (provider) => {
      eventos.push(`inicio:${provider}`);
      await new Promise(r => setTimeout(r, 20));
      resueltos++;
      eventos.push(`fin:${provider}`);
      return { content: `ok-${provider}`, provider };
    });

    const { executeMoATask } = require('../scripts/services/ModelDispatcher');
    await executeMoATask('prompt');

    // Si fuera serial: inicio:A, fin:A, inicio:B, fin:B (el primer "fin"
    // ocurre antes del segundo "inicio"). Si es concurrente: ambos "inicio"
    // ocurren antes de cualquier "fin".
    const indiceInicios = eventos.map((e, i) => e.startsWith('inicio:') ? i : -1).filter(i => i >= 0);
    const indicePrimerFin = eventos.findIndex(e => e.startsWith('fin:'));
    assert.equal(indiceInicios.length, 2, 'ambas sub-tareas deben haber iniciado');
    assert.ok(
      indiceInicios.every(i => i < indicePrimerFin),
      `ejecucion serial detectada: ${eventos.join(', ')}`
    );
  });
});
