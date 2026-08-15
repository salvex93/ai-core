'use strict';

/**
 * lib/self-healing-agent-report-format.js — valida el contrato de formato
 * del Paso 4 de .claude/agents/self-healing-agent.md: campo ESTADO
 * enumerado (PROPUESTAS_PENDIENTES_DE_APROBACION | SIN_ERRORES_NUEVOS |
 * BRIDGE_NO_DISPONIBLE). Cierra el gap de scaffolding confirmado por
 * auditoria 2026-08-15 -- ningun test previo ejercia este formato, toda la
 * cobertura bajo el nombre del agente era sobre guards genericos
 * compartidos (agent-paths-guard, agent-tools-guard, agent-snapshot,
 * rollback-agent).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { BIN } = require('./_shared');

const { validarReporte } = require(path.join(BIN, 'lib', 'self-healing-agent-report-format.js'));

describe('lib/self-healing-agent-report-format.js', () => {
  test('ESTADO: SIN_ERRORES_NUEVOS sin ninguna propuesta es valido', () => {
    const reporte = '[SELF-HEALING] 2026-08-15 | 0 errores diagnosticados | 0 propuestas pendientes\n\nESTADO: SIN_ERRORES_NUEVOS';
    const resultado = validarReporte(reporte);
    assert.equal(resultado.valido, true);
    assert.equal(resultado.estado, 'SIN_ERRORES_NUEVOS');
  });

  test('ESTADO: PROPUESTAS_PENDIENTES_DE_APROBACION con al menos 1 propuesta real es valido', () => {
    const reporte = [
      '[SELF-HEALING] 2026-08-15 | 1 errores diagnosticados | 1 propuestas pendientes',
      '',
      'ERROR: gemini-bridge — timeout/rate_limit',
      '  Causa raiz: quota agotada tras 15 RPM',
      '  Archivos afectados: scripts/mcp-gemini.js',
      '  Propuesta (BAJO_RIESGO):',
      '    Agregar backoff exponencial antes del reintento',
      '  Prevencion estructural sugerida: cachear resultados de analizar_archivo',
      '',
      'ESTADO: PROPUESTAS_PENDIENTES_DE_APROBACION',
    ].join('\n');
    const resultado = validarReporte(reporte);
    assert.equal(resultado.valido, true);
    assert.equal(resultado.estado, 'PROPUESTAS_PENDIENTES_DE_APROBACION');
  });

  test('detecta INCONSISTENCIA: ESTADO: SIN_ERRORES_NUEVOS pero hay una seccion ERROR real con propuesta listada', () => {
    const reporte = [
      'ERROR: gemini-bridge — timeout/rate_limit',
      '  Causa raiz: quota agotada',
      '  Propuesta (BAJO_RIESGO): reintentar con backoff',
      'ESTADO: SIN_ERRORES_NUEVOS',
    ].join('\n');
    const resultado = validarReporte(reporte);
    assert.equal(resultado.valido, false, 'declarar SIN_ERRORES_NUEVOS con una seccion ERROR real listada es inconsistente');
  });

  test('cada propuesta debe clasificarse como BAJO_RIESGO o ALTO_RIESGO -- una propuesta sin esa etiqueta falla la validacion', () => {
    const reporte = [
      'ERROR: gemini-bridge — timeout',
      '  Causa raiz: x',
      '  Propuesta:',
      '    hacer algo',
      'ESTADO: PROPUESTAS_PENDIENTES_DE_APROBACION',
    ].join('\n');
    const resultado = validarReporte(reporte);
    assert.equal(resultado.valido, false, 'propuesta sin clasificacion de riesgo (BAJO_RIESGO|ALTO_RIESGO) debe fallar');
  });

  test('ESTADO fuera del enum permitido falla la validacion', () => {
    const reporte = 'ESTADO: EN_PROGRESO';
    const resultado = validarReporte(reporte);
    assert.equal(resultado.valido, false);
  });

  test('reporte sin ninguna linea ESTADO falla con motivo explicito', () => {
    const resultado = validarReporte('sin nada de formato aqui');
    assert.equal(resultado.valido, false);
    assert.match(resultado.motivo, /ESTADO/i);
  });
});
