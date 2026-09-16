'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const { REPO, BIN } = require('./_shared');

describe('SubagentGrader.js (calificacion de subagentes via LLM-as-judge)', () => {
  const SCRIPT = path.join(REPO, 'scripts', 'services', 'SubagentGrader.js');
  const MODEL_REGISTRY_PATH = path.join(REPO, 'scripts', 'services', 'ModelRegistry.js');
  const { calificar, parsearGrado, seleccionarJuez, construirPromptSistema, PROVEEDORES_JUEZ } = require(SCRIPT);

  const OUTPUT_LARGO = Array.from({ length: 20 }, (_, i) => `linea ${i} del output real del subagente`).join('\n');

  // SubagentGrader.js desestructura `chat` de ModelRegistry en el require
  // (const { chat } = require('./ModelRegistry')), asi que mutar la propiedad
  // del objeto exportado no alcanza -- hay que invalidar el cache de ambos
  // modulos para que SubagentGrader vuelva a desestructurar el chat mockeado.
  function calificarConChatMockeado(chatMock, params) {
    delete require.cache[MODEL_REGISTRY_PATH];
    delete require.cache[SCRIPT];
    const ModelRegistry = require(MODEL_REGISTRY_PATH);
    const original = ModelRegistry.chat;
    ModelRegistry.chat = chatMock;
    try {
      const { calificar: calificarMockeado } = require(SCRIPT);
      return calificarMockeado(params);
    } finally {
      ModelRegistry.chat = original;
      delete require.cache[MODEL_REGISTRY_PATH];
      delete require.cache[SCRIPT];
    }
  }

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('seleccionarJuez: elige el primero disponible en orden de preferencia deepseek > openai > gemini', () => {
    const disponibles = [
      { provider: 'gemini',   available: true },
      { provider: 'openai',   available: true },
      { provider: 'deepseek', available: true },
    ];
    assert.equal(seleccionarJuez(disponibles), 'deepseek');
  });

  test('seleccionarJuez: salta proveedores no disponibles', () => {
    const disponibles = [
      { provider: 'deepseek', available: false },
      { provider: 'openai',   available: false },
      { provider: 'gemini',   available: true },
    ];
    assert.equal(seleccionarJuez(disponibles), 'gemini');
  });

  test('seleccionarJuez: retorna null si ningun proveedor de la lista esta disponible', () => {
    assert.equal(seleccionarJuez([{ provider: 'anthropic', available: true }]), null);
  });

  test('parsearGrado: JSON valido se acota a [0,100] y redondea', () => {
    const grado = parsearGrado('{"score": 87.6, "motivo": "bien", "riesgos": ["r1"]}');
    assert.equal(grado.score, 88);
    assert.equal(grado.motivo, 'bien');
    assert.deepEqual(grado.riesgos, ['r1']);
  });

  test('parsearGrado: score fuera de rango se acota a 0-100', () => {
    assert.equal(parsearGrado('{"score": 150}').score, 100);
    assert.equal(parsearGrado('{"score": -20}').score, 0);
  });

  test('parsearGrado: output no parseable falla cerrado (score 0)', () => {
    const grado = parsearGrado('esto no es JSON');
    assert.equal(grado.score, 0);
    assert.match(grado.motivo, /no parseable/);
    assert.ok(grado.riesgos.length > 0);
  });

  test('parsearGrado: JSON sin campo score numerico falla cerrado', () => {
    const grado = parsearGrado('{"motivo": "sin score"}');
    assert.equal(grado.score, 0);
  });

  test('construirPromptSistema: incluye rubrica de cumplimiento de tarea solo si se provee tareaOriginal', () => {
    assert.match(construirPromptSistema('hacer X'), /Cumplimiento de tarea/);
    assert.doesNotMatch(construirPromptSistema(undefined), /Cumplimiento de tarea/);
  });

  test('calificar: output trivial (menos de 15 lineas) no invoca ningun proveedor', async () => {
    const resultado = await calificar({ output: 'listo', agentType: 'Explore' });
    assert.equal(resultado.proveedor, null);
    assert.equal(resultado.score, 0);
    assert.match(resultado.motivo, /trivial/);
  });

  test('calificar: output vacio no invoca ningun proveedor', async () => {
    const resultado = await calificar({ output: '', agentType: 'Explore' });
    assert.equal(resultado.proveedor, null);
  });

  test('calificar: output largo pero sin proveedor juez disponible', async () => {
    const resultado = await calificar({
      output: OUTPUT_LARGO,
      agentType: 'Explore',
      disponibles: [{ provider: 'anthropic', available: true }],
    });
    assert.equal(resultado.proveedor, null);
    assert.match(resultado.motivo, /sin proveedor juez disponible/);
  });

  test('calificar: con proveedor disponible, invoca chat() con forzarJSON y devuelve el score parseado', async () => {
    const llamadas = [];
    const resultado = await calificarConChatMockeado(
      async (provider, messages, options) => {
        llamadas.push({ provider, messages, options });
        return { content: '{"score": 92, "motivo": "output completo y coherente", "riesgos": []}' };
      },
      {
        output: OUTPUT_LARGO,
        agentType: 'code-reviewer',
        disponibles: [{ provider: 'deepseek', available: true }],
      }
    );
    assert.equal(resultado.proveedor, 'deepseek');
    assert.equal(resultado.score, 92);
    assert.equal(resultado.riesgos.length, 0);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].provider, 'deepseek');
    assert.equal(llamadas[0].options.forzarJSON, true);
    assert.match(llamadas[0].messages[0].content, /OUTPUT A EVALUAR/);
  });

  test('calificar: con tareaOriginal, el contenido enviado al juez la incluye y el prompt de sistema pide cumplimiento de tarea', async () => {
    const llamadas = [];
    const resultado = await calificarConChatMockeado(
      async (provider, messages, options) => {
        llamadas.push({ messages, options });
        return { content: '{"score": 40, "motivo": "se desvio de la tarea", "riesgos": ["ignoro parte del pedido"]}' };
      },
      {
        output: OUTPUT_LARGO,
        agentType: 'Explore',
        tareaOriginal: 'buscar todos los usos de X',
        disponibles: [{ provider: 'openai', available: true }],
      }
    );
    assert.equal(resultado.score, 40);
    assert.equal(resultado.riesgos.length, 1);
    assert.match(llamadas[0].messages[0].content, /TAREA ORIGINAL:\nbuscar todos los usos de X/);
    assert.match(llamadas[0].options.system, /Cumplimiento de tarea/);
  });

  test('calificar: veredicto del juez no parseable falla cerrado (score 0) sin lanzar excepcion', async () => {
    const resultado = await calificarConChatMockeado(
      async () => ({ content: 'respuesta no-JSON del proveedor' }),
      {
        output: OUTPUT_LARGO,
        agentType: 'Explore',
        disponibles: [{ provider: 'gemini', available: true }],
      }
    );
    assert.equal(resultado.score, 0);
    assert.equal(resultado.proveedor, 'gemini');
  });

  test('PROVEEDORES_JUEZ: orden de preferencia es deepseek, openai, gemini (mas barato primero)', () => {
    assert.deepEqual(PROVEEDORES_JUEZ, ['deepseek', 'openai', 'gemini']);
  });
});
