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

const { ALTA_CONFIANZA, buscarCredenciales } = require(path.join(BIN, 'lib', 'patrones-secretos.js'));

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
