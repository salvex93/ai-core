'use strict';

/**
 * lib/patrones-secretos.js — patrones de credenciales de alta confianza,
 * extraidos como fuente unica compartida entre secrets-guard.js (prompt del
 * usuario, UserPromptSubmit) y git-history-secrets-scan.js (historial de
 * git, nuevo -- gap real detectado por investigacion de mercado 2026-08-15:
 * ningun componente escaneaba git log -p, solo el working tree actual).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { BIN } = require('./_shared');

const { ALTA_CONFIANZA, buscarCredenciales, redactarSecretos } = require(path.join(BIN, 'lib', 'patrones-secretos.js'));

describe('lib/patrones-secretos.js', () => {
  test('ALTA_CONFIANZA incluye los patrones ya validados en secrets-guard.js', () => {
    const etiquetas = ALTA_CONFIANZA.map(p => p.etiqueta);
    assert.ok(etiquetas.includes('OpenAI API key'));
    assert.ok(etiquetas.includes('GitHub Personal Access Token'));
    assert.ok(etiquetas.includes('AWS Access Key ID'));
    assert.ok(etiquetas.includes('Google API key'));
  });

  test('buscarCredenciales() detecta un GitHub PAT real en un texto', () => {
    const texto = 'const token = "ghp_' + 'a'.repeat(36) + '";';
    const hallazgos = buscarCredenciales(texto);
    assert.ok(hallazgos.some(h => h.etiqueta === 'GitHub Personal Access Token'));
  });

  test('buscarCredenciales() no encuentra nada en texto sin credenciales', () => {
    const hallazgos = buscarCredenciales('const x = 1; function suma(a,b) { return a+b; }');
    assert.equal(hallazgos.length, 0);
  });

  test('buscarCredenciales() con input vacio o no-string no lanza excepcion', () => {
    assert.deepEqual(buscarCredenciales(''), []);
    assert.deepEqual(buscarCredenciales(null), []);
    assert.deepEqual(buscarCredenciales(undefined), []);
  });
});

describe('redactarSecretos() — issue #252: token generico expuesto en captura de evento', () => {
  test('redacta un TOKEN="..." hex largo asignado a variable de shell', () => {
    const original = 'TOKEN="908a9927a67bf4fa008bc877e98a8fe03163a2416393ec6a6151331be1d2ee38"\ncurl -H "Authorization: Bearer $TOKEN" https://ejemplo.com';
    const redactado = redactarSecretos(original);
    assert.ok(!redactado.includes('908a9927a67bf4fa008bc877e98a8fe03163a2416393ec6a6151331be1d2ee38'), 'el valor real del token no debe sobrevivir en el texto redactado');
    assert.ok(redactado.includes('REDACTADO'), 'debe marcar explicitamente que hubo redaccion');
    assert.ok(redactado.includes('curl -H'), 'el resto del texto no relacionado con el secreto debe preservarse');
  });

  test('redacta variables API_KEY/SECRET/PASSWORD con valor largo, sin distinguir mayus/minus', () => {
    const original = 'export api_key=abcdef0123456789abcdef0123456789abcdef01';
    const redactado = redactarSecretos(original);
    assert.ok(!redactado.includes('abcdef0123456789abcdef0123456789abcdef01'));
  });

  test('redacta credenciales de ALTA_CONFIANZA ya conocidas (ej. GitHub PAT) dentro del mismo texto', () => {
    const original = 'const token = "ghp_' + 'a'.repeat(36) + '";';
    const redactado = redactarSecretos(original);
    assert.ok(!redactado.includes('ghp_' + 'a'.repeat(36)));
  });

  test('no modifica texto sin secretos', () => {
    const original = 'analizar_archivo llamado con archivo de 800 lineas';
    assert.equal(redactarSecretos(original), original);
  });

  test('con input vacio o no-string retorna cadena vacia sin lanzar', () => {
    assert.equal(redactarSecretos(''), '');
    assert.equal(redactarSecretos(null), '');
    assert.equal(redactarSecretos(undefined), '');
  });
});
