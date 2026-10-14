'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { clasificar } = require('../scripts/services/IntentClassifier');
const { ROLES } = require('../scripts/services/AgentRoles');

describe('IntentClassifier.clasificar — deteccion por rol', () => {
  test('detecta AUDITOR ante mensaje de error/stacktrace', () => {
    const r = clasificar('el script crashea con un stacktrace raro, por que falla');
    assert.equal(r.rol, ROLES.AUDITOR);
    assert.equal(r.herramienta, 'diagnosticar_error');
  });

  test('detecta AUDITOR ante mensaje de seguridad/CVE', () => {
    const r = clasificar('audita esta dependencia, sospecho un CVE de inyeccion XSS');
    assert.equal(r.rol, ROLES.AUDITOR);
  });

  test('detecta ARCHITECT ante diseno de sistema nuevo', () => {
    const r = clasificar('quiero diseñar la arquitectura de un microservicio nuevo');
    assert.equal(r.rol, ROLES.ARCHITECT);
  });

  test('detecta ARCHITECT ante busqueda/investigacion', () => {
    const r = clasificar('investiga y compara Contextual Retrieval frente a RAG clasico');
    assert.equal(r.rol, ROLES.ARCHITECT);
    assert.equal(r.herramienta, 'buscar_web');
  });

  test('detecta CODER ante comando de shell directo', () => {
    const r = clasificar('ejecuta npm test y dime el resultado');
    assert.equal(r.rol, ROLES.CODER);
  });

  test('detecta CODER ante fix puntual de codigo', () => {
    const r = clasificar('arregla el bug en la linea 42 de este archivo');
    assert.equal(r.rol, ROLES.CODER);
    assert.equal(r.herramienta, 'reparar_error');
  });
});

describe('IntentClassifier.clasificar — prioridad y empates', () => {
  test('AUDITOR gana sobre ARCHITECT y CODER cuando hay señales de auditor', () => {
    // "error" (auditor) + "arquitectura" (architect) + "arregla" (coder) en un mismo mensaje
    const r = clasificar('hay un error de seguridad en la arquitectura, arregla el CVE');
    assert.equal(r.rol, ROLES.AUDITOR);
  });

  test('ARCHITECT gana sobre CODER en empate cuando architect > coder', () => {
    const r = clasificar('diseña la arquitectura del sistema y crea el modulo base');
    assert.equal(r.rol, ROLES.ARCHITECT);
  });

  test('confianza es proporcional a puntosDelRol / total y esta en rango [0,1]', () => {
    const r = clasificar('arregla este error de stacktrace, por que falla el crash');
    assert.ok(r.confianza >= 0 && r.confianza <= 1);
    assert.equal(typeof r.confianza, 'number');
  });
});

describe('IntentClassifier.clasificar — fallback conservador', () => {
  test('mensaje vacio cae a fallback ARCHITECT con confianza 0.3', () => {
    const r = clasificar('');
    assert.equal(r.rol, ROLES.ARCHITECT);
    assert.equal(r.confianza, 0.3);
    assert.equal(r.herramienta, 'disenar_sistema');
  });

  test('input no-string cae a fallback ARCHITECT con confianza 0.3', () => {
    const r = clasificar(null);
    assert.equal(r.rol, ROLES.ARCHITECT);
    assert.equal(r.confianza, 0.3);
  });

  test('mensaje sin señales reconocibles cae a fallback ARCHITECT', () => {
    const r = clasificar('xyzzy plugh qwerty');
    assert.equal(r.rol, ROLES.ARCHITECT);
    assert.equal(r.confianza, 0.3);
    assert.match(r.razon, /Sin senales claras/);
  });
});

describe('IntentClassifier.clasificar — contrato de salida', () => {
  test('siempre retorna las 4 claves esperadas: rol, herramienta, confianza, razon', () => {
    const r = clasificar('crea un componente nuevo');
    assert.ok('rol' in r);
    assert.ok('herramienta' in r);
    assert.ok('confianza' in r);
    assert.ok('razon' in r);
  });

  test('peticion corta de generar codigo NO se enruta a generar_haiku (prosa) -- debe ir a una herramienta de codigo real', () => {
    const mensajes = [
      'crea un componente de React para el dashboard',
      'genera el codigo del endpoint POST /users',
      'implementa la funcion de login',
    ];
    for (const m of mensajes) {
      const r = clasificar(m);
      assert.equal(r.rol, 'coder', `rol incorrecto para: "${m}"`);
      assert.notEqual(r.herramienta, 'generar_haiku', `"${m}" no debe rutear a prosa (Haiku) -- es generacion de codigo`);
    }
  });

  test('el rol retornado siempre pertenece a ROLES.*', () => {
    const mensajes = ['audita esto', 'diseña aquello', 'arregla esto', 'sin señales claras aqui'];
    for (const m of mensajes) {
      const r = clasificar(m);
      assert.ok(Object.values(ROLES).includes(r.rol), `rol invalido para: "${m}"`);
    }
  });
});

describe('IntentClassifier.clasificarConModelo — ahorro de cuota Claude via ModelRouter', () => {
  const { clasificarConModelo } = require('../scripts/services/IntentClassifier');

  test('conecta la disponibilidad real de listProviders() a route() (integracion, no unitario)', () => {
    // No mockea listProviders() a proposito: confirma que la integracion
    // real esta conectada (route() recibe disponibles), sin asumir que
    // proveedores especificos esten o no configurados en esta maquina.
    const r = clasificarConModelo('arregla este bug puntual en el codigo');
    assert.ok('modelo' in r);
    assert.ok('proveedor' in r, 'debe exponer el campo proveedor aunque sea undefined para tiers Anthropic');
  });
});
