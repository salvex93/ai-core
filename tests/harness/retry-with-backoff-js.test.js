'use strict';

/**
 * lib/retry-with-backoff.js — cierra el gap detectado por investigacion de
 * mercado (2026-08-15): platform.claude.com/docs/en/api/errors documenta que
 * los SDKs oficiales reintentan automaticamente errores transitorios (rate
 * limits, 5xx, timeouts de conexion) con backoff exponencial. El SDK de
 * Anthropic ya lo hace por defecto (maxRetries=2 sin configuracion
 * explicita), pero GeminiAdapter.js (@google/genai) y OpenAICompatAdapter.js
 * (https.request crudo) no tenian ningun mecanismo de retry -- un 429/500
 * transitorio se propagaba como fallo definitivo.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { REPO } = require('./_shared');

const {
  esErrorReintentable,
  calcularBackoffMs,
  reintentarConBackoff,
} = require(path.join(REPO, 'scripts', 'services', 'lib', 'retry-with-backoff.js'));

describe('lib/retry-with-backoff.js — esErrorReintentable()', () => {
  test('status 429 (rate limit) es reintentable', () => {
    assert.equal(esErrorReintentable({ status: 429 }), true);
  });

  test('status 500/502/503/529 (errores 5xx del servidor) son reintentables', () => {
    for (const status of [500, 502, 503, 529]) {
      assert.equal(esErrorReintentable({ status }), true, `status ${status} debe ser reintentable`);
    }
  });

  test('status 400/401/403/404 (error del cliente, no transitorio) NO son reintentables', () => {
    for (const status of [400, 401, 403, 404]) {
      assert.equal(esErrorReintentable({ status }), false, `status ${status} no debe reintentarse`);
    }
  });

  test('error de conexion sin status (ECONNRESET, timeout de red) es reintentable', () => {
    assert.equal(esErrorReintentable({ code: 'ECONNRESET' }), true);
    assert.equal(esErrorReintentable({ code: 'ETIMEDOUT' }), true);
  });

  test('error generico sin status ni code reconocido NO es reintentable (evitar retry de bugs logicos)', () => {
    assert.equal(esErrorReintentable(new Error('algo broke')), false);
  });

  test('timeout de SDK colgado (code ETIMEDOUT_SDK_COLGADO) es reintentable -- gap cerrado 2026-09-01', () => {
    // GeminiApiClient.js/GeminiAdapter.js marcan explicitamente este code
    // cuando su propio Promise.race corta un @google/genai colgado (que no
    // es un ECONNRESET/ETIMEDOUT de red real, sino un timeout aplicado por
    // el propio arnes ante un SDK que nunca resuelve ni rechaza) -- sin este
    // marcador explicito, el error generico caeria en la regla de arriba
    // (no reintentable) y el colgado nunca se recuperaria solo, aunque el
    // siguiente intento real casi siempre responda en segundos (confirmado
    // en produccion: la misma llamada via REST directo responde rapido).
    const err = new Error('Gemini no respondio en 30s (timeout real)');
    err.code = 'ETIMEDOUT_SDK_COLGADO';
    assert.equal(esErrorReintentable(err), true);
  });
});

describe('lib/retry-with-backoff.js — calcularBackoffMs()', () => {
  test('crece exponencialmente con el intento (base * 2^intento)', () => {
    const t0 = calcularBackoffMs(0, { base: 500, jitter: false });
    const t1 = calcularBackoffMs(1, { base: 500, jitter: false });
    const t2 = calcularBackoffMs(2, { base: 500, jitter: false });
    assert.equal(t0, 500);
    assert.equal(t1, 1000);
    assert.equal(t2, 2000);
  });

  test('respeta retryAfterMs explicito (header Retry-After) por encima del backoff calculado', () => {
    const t = calcularBackoffMs(0, { base: 500, jitter: false, retryAfterMs: 9000 });
    assert.equal(t, 9000);
  });

  test('nunca excede el techo maximo configurado', () => {
    const t = calcularBackoffMs(10, { base: 500, jitter: false, maxMs: 4000 });
    assert.equal(t, 4000);
  });
});

describe('lib/retry-with-backoff.js — reintentarConBackoff()', () => {
  test('si la funcion resuelve al primer intento, no reintenta', async () => {
    let llamadas = 0;
    const resultado = await reintentarConBackoff(async () => { llamadas++; return 'ok'; }, { maxReintentos: 2, base: 1 });
    assert.equal(resultado, 'ok');
    assert.equal(llamadas, 1);
  });

  test('reintenta un error transitorio (status 429) hasta maxReintentos y luego resuelve', async () => {
    let llamadas = 0;
    const resultado = await reintentarConBackoff(async () => {
      llamadas++;
      if (llamadas < 3) { const e = new Error('rate limited'); e.status = 429; throw e; }
      return 'ok-al-tercer-intento';
    }, { maxReintentos: 3, base: 1 });
    assert.equal(resultado, 'ok-al-tercer-intento');
    assert.equal(llamadas, 3);
  });

  test('un error NO reintentable (status 400) se propaga de inmediato, sin reintentar', async () => {
    let llamadas = 0;
    await assert.rejects(
      reintentarConBackoff(async () => { llamadas++; const e = new Error('bad request'); e.status = 400; throw e; }, { maxReintentos: 3, base: 1 }),
      /bad request/
    );
    assert.equal(llamadas, 1, 'no debe reintentar un error 400');
  });

  test('agota maxReintentos y propaga el ultimo error si el fallo persiste', async () => {
    let llamadas = 0;
    await assert.rejects(
      reintentarConBackoff(async () => { llamadas++; const e = new Error('siempre falla'); e.status = 503; throw e; }, { maxReintentos: 2, base: 1 }),
      /siempre falla/
    );
    assert.equal(llamadas, 3, 'debe intentar 1 vez + 2 reintentos = 3 llamadas totales');
  });
});
