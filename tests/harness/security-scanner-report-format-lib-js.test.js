'use strict';

/**
 * lib/security-scanner-report-format.js — valida el contrato de formato del
 * reporte de .claude/agents/security-scanner.md (Paso 5): estructura fija
 * con conteos numericos por severidad y un campo ESTADO enumerado. Cierra
 * el gap de scaffolding confirmado por auditoria 2026-08-15: el gate estaba
 * bien definido (formato validable por regex/parser) pero ningun test
 * ejercia el contrato -- toda la cobertura previa bajo el nombre
 * "security-scanner" era sobre guards genericos compartidos con otros
 * agentes (agent-paths-guard, agent-tools-guard, mutating-action-guard),
 * nunca sobre el formato de reporte real que el propio agente promete.
 *
 * No invoca al LLM real (el agente es un prompt de Claude) -- valida el
 * CONTRATO de formato contra fixtures, que es exactamente lo que la propia
 * auditoria recomendo como alcance factible sin gastar tokens.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { BIN } = require('./_shared');

const { validarReporte } = require(path.join(BIN, 'lib', 'security-scanner-report-format.js'));

describe('lib/security-scanner-report-format.js', () => {
  test('reporte SEGURO valido (0 hallazgos en todas las severidades) pasa la validacion', () => {
    const reporte = [
      '[SECURITY-SCAN] 2026-08-15 | main | 0 hallazgos',
      '',
      'CRITICOS (0):',
      'ninguno',
      '',
      'ALTOS (0):',
      'ninguno',
      '',
      'MEDIOS (0):',
      'ninguno',
      '',
      'ESTADO: SEGURO',
    ].join('\n');

    const resultado = validarReporte(reporte);
    assert.equal(resultado.valido, true);
    assert.deepEqual(resultado.conteos, { criticos: 0, altos: 0, medios: 0 });
    assert.equal(resultado.estado, 'SEGURO');
  });

  test('reporte con criticos reales y ESTADO: VULNERABILIDADES_CRITICAS es consistente', () => {
    const reporte = [
      '[SECURITY-SCAN] 2026-08-15 | main | 1 hallazgos',
      'CRITICOS (1):',
      '- .env:3 — credencial AWS real expuesta [OWASP: A02]',
      'ALTOS (0):', 'ninguno', 'MEDIOS (0):', 'ninguno',
      'ESTADO: VULNERABILIDADES_CRITICAS',
    ].join('\n');

    const resultado = validarReporte(reporte);
    assert.equal(resultado.valido, true);
    assert.equal(resultado.estado, 'VULNERABILIDADES_CRITICAS');
  });

  test('detecta INCONSISTENCIA: ESTADO declara SEGURO pero hay 1 critico real listado (vector adversarial via npm audit/Gemini)', () => {
    const reporte = [
      '[SECURITY-SCAN] 2026-08-15 | main | 1 hallazgos',
      'CRITICOS (1):',
      '- .env:3 — credencial AWS real expuesta [OWASP: A02]',
      'ALTOS (0):', 'ninguno', 'MEDIOS (0):', 'ninguno',
      'ESTADO: SEGURO',
    ].join('\n');

    const resultado = validarReporte(reporte);
    assert.equal(resultado.valido, false, 'ESTADO: SEGURO con 1+ criticos reales debe fallar la validacion');
    assert.match(resultado.motivo, /inconsistente|SEGURO/i);
  });

  test('ESTADO fuera del enum permitido (ej. "OK" en vez de "SEGURO") falla la validacion', () => {
    const reporte = [
      'CRITICOS (0):', 'ninguno', 'ALTOS (0):', 'ninguno', 'MEDIOS (0):', 'ninguno',
      'ESTADO: OK',
    ].join('\n');

    const resultado = validarReporte(reporte);
    assert.equal(resultado.valido, false);
  });

  test('reporte sin la seccion CRITICOS falla la validacion con motivo explicito', () => {
    const reporte = 'ESTADO: SEGURO\n';
    const resultado = validarReporte(reporte);
    assert.equal(resultado.valido, false);
    assert.match(resultado.motivo, /CRITICOS/i);
  });

  test('altos > 0 con ESTADO: SEGURO es inconsistente (altos tambien debe implicar al menos VULNERABILIDADES_MENORES)', () => {
    const reporte = [
      'CRITICOS (0):', 'ninguno',
      'ALTOS (1):', '- src/api.js:10 — CVE alto en dependencia',
      'MEDIOS (0):', 'ninguno',
      'ESTADO: SEGURO',
    ].join('\n');

    const resultado = validarReporte(reporte);
    assert.equal(resultado.valido, false);
  });
});
