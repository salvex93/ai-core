'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('CrossVerifier.js (verificacion cross-model)', () => {
  const SCRIPT = path.join(REPO, 'scripts', 'services', 'CrossVerifier.js');
  const { seleccionarVerificador, parsearVeredicto, verificar, resolverConDesempate, PROVEEDORES_VERIFICADOR, TAREAS_CRITICAS_CON_DESEMPATE } = require(SCRIPT);

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'CrossVerifier.js debe existir en scripts/services/');
  });

  test('seleccionarVerificador: elige proveedor distinto al actor', () => {
    const disponibles = [
      { provider: 'anthropic', available: true },
      { provider: 'deepseek',  available: true },
      { provider: 'openai',    available: true },
    ];
    const elegido = seleccionarVerificador('anthropic', disponibles);
    assert.notEqual(elegido, 'anthropic', 'el verificador nunca debe ser el mismo proveedor que el actor');
    assert.ok(PROVEEDORES_VERIFICADOR.includes(elegido), 'debe elegir de la lista de proveedores validos');
  });

  test('seleccionarVerificador: lanza error si no hay proveedor distinto disponible', () => {
    const disponibles = [{ provider: 'anthropic', available: true }];
    assert.throws(
      () => seleccionarVerificador('anthropic', disponibles),
      /Sin proveedor verificador disponible/,
      'debe fallar explicitamente en vez de usar el mismo proveedor del actor'
    );
  });

  test('parsearVeredicto: camino feliz — JSON valido con pass true', () => {
    const veredicto = parsearVeredicto('{"pass": true, "hallazgos": []}');
    assert.equal(veredicto.pass, true);
    assert.deepEqual(veredicto.hallazgos, []);
  });

  test('parsearVeredicto: detecta regresion con hallazgos', () => {
    const texto = '{"pass": false, "hallazgos": [{"severidad": "alta", "descripcion": "rompe test X"}]}';
    const veredicto = parsearVeredicto(texto);
    assert.equal(veredicto.pass, false);
    assert.equal(veredicto.hallazgos.length, 1);
    assert.equal(veredicto.hallazgos[0].severidad, 'alta');
  });

  test('parsearVeredicto: output no parseable falla cerrado (pass=false)', () => {
    const veredicto = parsearVeredicto('esto no es JSON');
    assert.equal(veredicto.pass, false, 'output no parseable debe fallar cerrado, nunca asumir pass=true');
    assert.ok(veredicto.hallazgos.length > 0, 'debe reportar el fallo de parseo como hallazgo');
  });

  test('verificar: diff vacio pasa sin llamar a ningun proveedor', async () => {
    const resultado = await verificar({ diff: '', tarea: 'tarea sin cambios' });
    assert.equal(resultado.pass, true);
    assert.equal(resultado.proveedor, null);
  });

  test('verificar: sin proveedor disponible distinto al actor, propaga el error', async () => {
    await assert.rejects(
      () => verificar({
        diff: '+ const x = 1;',
        tarea: 'agregar constante',
        proveedorActor: 'anthropic',
        disponibles: [{ provider: 'anthropic', available: true }],
      }),
      /Sin proveedor verificador disponible/
    );
  });

  test('ModelRouter: tier verificador no asigna modelo Anthropic', () => {
    const { route } = require(path.join(REPO, 'scripts', 'services', 'ModelRouter.js'));
    const resultado = route('verificar_diff');
    assert.equal(resultado.tier, 'verificador');
    assert.equal(resultado.modelo, null, 'la seleccion de proveedor se delega a CrossVerifier, no al router de costo');
  });

  test('verificar: cuando el proveedor elegido es openai, usa gpt-5.6-sol (mas capaz), no el defaultModel barato', async () => {
    const ModelRegistry = require(path.join(REPO, 'scripts', 'services', 'ModelRegistry.js'));
    const llamadasChat = [];
    const chatOriginal = ModelRegistry.chat;
    ModelRegistry.chat = async (provider, messages, options) => {
      llamadasChat.push({ provider, options });
      return { content: '{"pass": true, "hallazgos": []}', provider, model: options?.model };
    };

    try {
      await verificar({
        diff: '+ const x = 1;',
        tarea: 'agregar constante',
        proveedorActor: 'anthropic',
        disponibles: [
          { provider: 'anthropic', available: true },
          { provider: 'openai',    available: true },
        ],
      });
    } finally {
      ModelRegistry.chat = chatOriginal;
    }

    assert.equal(llamadasChat.length, 1);
    assert.equal(llamadasChat[0].provider, 'openai');
    assert.equal(
      llamadasChat[0].options.model,
      'gpt-5.6-sol',
      'la verificacion de diffs criticos debe forzar el modelo mas capaz de OpenAI, no heredar el defaultModel barato de tareas delegables'
    );
  });

  describe('resolverConDesempate — consenso automatico 2-de-3 en tareas criticas', () => {
    const DISPONIBLES_3 = [
      { provider: 'anthropic', available: true },
      { provider: 'deepseek',  available: true },
      { provider: 'openai',    available: true },
      { provider: 'gemini',    available: true },
    ];

    function mockearRespuestasSecuenciales(respuestas) {
      const ModelRegistry = require(path.join(REPO, 'scripts', 'services', 'ModelRegistry.js'));
      const llamadas = [];
      const original = ModelRegistry.chat;
      let i = 0;
      ModelRegistry.chat = async (provider, messages, options) => {
        llamadas.push({ provider, options });
        const content = respuestas[i++];
        return { content, provider, model: options?.model };
      };
      return { llamadas, restaurar: () => { ModelRegistry.chat = original; } };
    }

    test('herramienta no critica: no activa desempate aunque el primer verificador rechace', async () => {
      const { llamadas, restaurar } = mockearRespuestasSecuenciales([
        '{"pass": false, "hallazgos": [{"severidad":"alta","descripcion":"problema"}]}',
      ]);
      try {
        const resultado = await resolverConDesempate({
          diff: '+ x',
          tarea: 'tarea simple',
          nombreHerramienta: 'reparar_error', // no esta en TAREAS_CRITICAS_CON_DESEMPATE
          proveedorActor: 'anthropic',
          disponibles: DISPONIBLES_3,
        });
        assert.equal(resultado.desempate, false);
        assert.equal(resultado.pass, false);
        assert.equal(llamadas.length, 1, 'no debe consultar a un segundo proveedor en tareas no criticas');
      } finally {
        restaurar();
      }
    });

    test('herramienta critica con primer verificador pass=true: no activa desempate', async () => {
      assert.ok(TAREAS_CRITICAS_CON_DESEMPATE.includes('disenar_sistema'));
      const { llamadas, restaurar } = mockearRespuestasSecuenciales([
        '{"pass": true, "hallazgos": []}',
      ]);
      try {
        const resultado = await resolverConDesempate({
          diff: '+ x',
          tarea: 'diseno nuevo',
          nombreHerramienta: 'disenar_sistema',
          proveedorActor: 'anthropic',
          disponibles: DISPONIBLES_3,
        });
        assert.equal(resultado.desempate, false);
        assert.equal(resultado.pass, true);
        assert.equal(llamadas.length, 1, 'no debe gastar un segundo voto si el primero ya aprueba');
      } finally {
        restaurar();
      }
    });

    test('herramienta critica + primer verificador rechaza + tercer proveedor disponible: hace desempate real', async () => {
      const { llamadas, restaurar } = mockearRespuestasSecuenciales([
        '{"pass": false, "hallazgos": [{"severidad":"critica","descripcion":"vulnerabilidad"}]}',
        '{"pass": false, "hallazgos": [{"severidad":"critica","descripcion":"confirma vulnerabilidad"}]}',
      ]);
      try {
        const resultado = await resolverConDesempate({
          diff: '+ x',
          tarea: 'auditoria',
          nombreHerramienta: 'auditar_seguridad_critica',
          proveedorActor: 'anthropic',
          disponibles: DISPONIBLES_3,
        });
        assert.equal(resultado.desempate, true);
        assert.equal(resultado.pass, false, 'ambos verificadores rechazan -- el rechazo se sostiene');
        assert.equal(llamadas.length, 2, 'debe consultar a un segundo proveedor distinto del primero');
        assert.notEqual(llamadas[0].provider, llamadas[1].provider);
        assert.equal(resultado.hallazgos.length, 2, 'combina los hallazgos de ambos verificadores');
        assert.ok(Array.isArray(resultado.votos) && resultado.votos.length === 2);
      } finally {
        restaurar();
      }
    });

    test('herramienta critica + primer verificador rechaza + segundo aprueba: revierte el rechazo (desempate real, no AND)', async () => {
      const { restaurar } = mockearRespuestasSecuenciales([
        '{"pass": false, "hallazgos": [{"severidad":"media","descripcion":"posible problema"}]}',
        '{"pass": true, "hallazgos": []}',
      ]);
      try {
        const resultado = await resolverConDesempate({
          diff: '+ x',
          tarea: 'refactor',
          nombreHerramienta: 'refactorizar_arquitectura',
          proveedorActor: 'anthropic',
          disponibles: DISPONIBLES_3,
        });
        assert.equal(resultado.desempate, true);
        assert.equal(resultado.pass, true, 'el segundo verificador decide el desempate -- un solo rechazo inicial no debe bloquear para siempre');
      } finally {
        restaurar();
      }
    });

    test('herramienta critica + primer verificador rechaza + sin tercer proveedor disponible: degrada con gracia al veredicto unico', async () => {
      const { llamadas, restaurar } = mockearRespuestasSecuenciales([
        '{"pass": false, "hallazgos": [{"severidad":"alta","descripcion":"problema"}]}',
      ]);
      try {
        const resultado = await resolverConDesempate({
          diff: '+ x',
          tarea: 'diseno',
          nombreHerramienta: 'disenar_sistema',
          proveedorActor: 'anthropic',
          // Solo 2 proveedores en total -- tras elegir el primer verificador
          // (deepseek), no queda un tercero distinto de anthropic y deepseek.
          disponibles: [
            { provider: 'anthropic', available: true },
            { provider: 'deepseek',  available: true },
          ],
        });
        assert.equal(resultado.desempate, false, 'sin tercer proveedor no debe intentar desempate');
        assert.equal(resultado.pass, false, 'mantiene el veredicto del unico verificador disponible');
        assert.equal(llamadas.length, 1, 'no debe intentar una segunda llamada sin proveedor disponible');
      } finally {
        restaurar();
      }
    });

    test('diff vacio: pasa sin llamar a ningun proveedor, sin desempate', async () => {
      const resultado = await resolverConDesempate({ diff: '', tarea: 'sin cambios', nombreHerramienta: 'disenar_sistema' });
      assert.equal(resultado.pass, true);
      assert.equal(resultado.desempate, false);
      assert.equal(resultado.proveedor, null);
    });
  });
});
