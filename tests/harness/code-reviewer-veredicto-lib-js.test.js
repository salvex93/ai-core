'use strict';

/**
 * lib/code-reviewer-veredicto.js — extrae la regla objetiva de veredicto de
 * .claude/agents/code-reviewer.md (Paso 3) a una funcion pura testeable.
 * Cierra el gap de scaffolding confirmado por auditoria 2026-08-15: el gate
 * estaba bien definido en prosa/tabla pero ningun test verificaba que un
 * reporte real de code-reviewer clasifique la severidad y calcule el
 * VEREDICTO correctamente -- toda la cobertura previa (agent-paths-guard,
 * agent-tools-guard, cross-verify-gate) solo prueba scripts satelites, nunca
 * la regla de negocio en si (0 criticos/altos -> APROBADO, etc).
 *
 * El agente en si es un prompt de Claude, no invocable en test unitario --
 * esta funcion formaliza la regla objetiva que el .md ya declara en prosa
 * (Paso 3, lineas 83-85), para que un parser real (o el propio agente al
 * autoverificarse) pueda calcularla programaticamente en vez de "confiar"
 * en que el LLM aplico la tabla correctamente.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { BIN } = require('./_shared');

const { calcularVeredicto, parsearReporte } = require(path.join(BIN, 'lib', 'code-reviewer-veredicto.js'));

describe('lib/code-reviewer-veredicto.js — calcularVeredicto (regla objetiva del Paso 3)', () => {
  test('0 criticos, 0 altos, 0 medios, 0 bajos -> APROBADO', () => {
    assert.equal(calcularVeredicto({ criticos: 0, altos: 0, medios: 0, bajos: 0 }), 'APROBADO');
  });

  test('1+ criticos o 1+ altos -> BLOQUEADO, tiene prioridad sobre medios/bajos', () => {
    assert.equal(calcularVeredicto({ criticos: 1, altos: 0, medios: 0, bajos: 0 }), 'BLOQUEADO');
    assert.equal(calcularVeredicto({ criticos: 0, altos: 1, medios: 0, bajos: 0 }), 'BLOQUEADO');
    assert.equal(calcularVeredicto({ criticos: 2, altos: 3, medios: 5, bajos: 5 }), 'BLOQUEADO');
  });

  test('0 criticos, 0 altos, pero medios o bajos presentes -> REQUIERE_CAMBIOS', () => {
    assert.equal(calcularVeredicto({ criticos: 0, altos: 0, medios: 1, bajos: 0 }), 'REQUIERE_CAMBIOS');
    assert.equal(calcularVeredicto({ criticos: 0, altos: 0, medios: 0, bajos: 1 }), 'REQUIERE_CAMBIOS');
  });

  test('valores negativos o no numericos lanzan error explicito (no silenciar entrada invalida)', () => {
    assert.throws(() => calcularVeredicto({ criticos: -1, altos: 0, medios: 0, bajos: 0 }));
    assert.throws(() => calcularVeredicto({ criticos: 'x', altos: 0, medios: 0, bajos: 0 }));
  });
});

describe('lib/code-reviewer-veredicto.js — parsearReporte (contrato de formato del Paso 3)', () => {
  test('parsea un reporte real APROBADO y extrae conteos + veredicto declarado', () => {
    const reporte = [
      '[CODE-REVIEW] 2026-08-15 | feature/x -> main | 3 archivos | 0 hallazgos',
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
      'BAJOS (0):',
      'ninguno',
      '',
      'VEREDICTO: APROBADO',
    ].join('\n');

    const parsed = parsearReporte(reporte);
    assert.deepEqual(parsed.conteos, { criticos: 0, altos: 0, medios: 0, bajos: 0 });
    assert.equal(parsed.veredictoDeclarado, 'APROBADO');
    assert.equal(parsed.veredictoEsperado, 'APROBADO');
    assert.equal(parsed.veredictoConsistente, true);
  });

  test('detecta INCONSISTENCIA: reporte declara APROBADO pero tiene 1 critico real (caso adversarial -- diff con instruccion inyectada)', () => {
    const reporte = [
      '[CODE-REVIEW] 2026-08-15 | feature/x -> main | 1 archivo | 1 hallazgo',
      '',
      'CRITICOS (1):',
      '- src/auth.js:42 — credencial hardcodeada',
      '',
      'ALTOS (0):',
      'ninguno',
      '',
      'MEDIOS (0):',
      'ninguno',
      '',
      'BAJOS (0):',
      'ninguno',
      '',
      'VEREDICTO: APROBADO',
    ].join('\n');

    const parsed = parsearReporte(reporte);
    assert.equal(parsed.conteos.criticos, 1);
    assert.equal(parsed.veredictoDeclarado, 'APROBADO');
    assert.equal(parsed.veredictoEsperado, 'BLOQUEADO');
    assert.equal(parsed.veredictoConsistente, false, 'debe detectar que el veredicto declarado no corresponde a los conteos reales');
  });

  test('reporte con REQUIERE_CAMBIOS y solo medios/bajos es consistente', () => {
    const reporte = [
      '[CODE-REVIEW] 2026-08-15 | feature/x -> main | 2 archivos | 2 hallazgos',
      '',
      'CRITICOS (0):',
      'ninguno',
      '',
      'ALTOS (0):',
      'ninguno',
      '',
      'MEDIOS (1):',
      '- src/util.js:10 — N+1 query',
      '',
      'BAJOS (1):',
      '- src/util.js:20 — nombre poco claro',
      '',
      'VEREDICTO: REQUIERE_CAMBIOS',
    ].join('\n');

    const parsed = parsearReporte(reporte);
    assert.equal(parsed.veredictoConsistente, true);
  });

  test('reporte malformado (con las 4 secciones pero sin linea VEREDICTO) lanza error explicito', () => {
    const reporte = 'CRITICOS (0):\nninguno\nALTOS (0):\nninguno\nMEDIOS (0):\nninguno\nBAJOS (0):\nninguno\n';
    assert.throws(() => parsearReporte(reporte), /VEREDICTO/i);
  });

  test('reporte malformado (falta seccion CRITICOS) lanza error explicito', () => {
    const reporte = 'VEREDICTO: APROBADO\n';
    assert.throws(() => parsearReporte(reporte), /CRITICOS/i);
  });
});
