'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('ErrorRepairLoop.js', () => {
  const { clasificarError, buildPromptDiagnostico, buildPromptReparacion, capturarError, LoopGuard } =
    require(path.join(REPO, 'scripts', 'services', 'ErrorRepairLoop.js'));

  test('clasificarError: detecta ENOENT como sistema_de_archivos/ALTO', () => {
    const r = clasificarError(new Error('ENOENT: no such file or directory'));
    assert.equal(r.severidad, 'ALTO');
    assert.equal(r.categoria, 'sistema_de_archivos');
  });

  test('clasificarError: detecta timeout de red como CRITICO', () => {
    const r = clasificarError(new Error('connect ECONNREFUSED 127.0.0.1:443'));
    assert.equal(r.severidad, 'CRITICO');
    assert.equal(r.categoria, 'red_conectividad');
  });

  test('clasificarError: detecta rate limit como api_quota/MEDIO', () => {
    const r = clasificarError(new Error('429 rate limit exceeded'));
    assert.equal(r.categoria, 'api_quota');
  });

  test('clasificarError: sin patron conocido cae a BAJO/desconocido', () => {
    const r = clasificarError(new Error('algo raro paso'));
    assert.deepEqual(r, { severidad: 'BAJO', categoria: 'desconocido' });
  });

  test('clasificarError: acepta string ademas de Error', () => {
    const r = clasificarError('EACCES: permission denied');
    assert.equal(r.categoria, 'permisos');
  });

  test('buildPromptDiagnostico: incluye severidad, categoria y mensaje', () => {
    const prompt = buildPromptDiagnostico({ error: new Error('ENOENT: falta el archivo'), herramienta: 'test-tool' });
    assert.match(prompt, /Severidad: ALTO/);
    assert.match(prompt, /Herramienta que fallo: test-tool/);
    assert.match(prompt, /ENOENT/);
  });

  test('buildPromptReparacion: incluye causa raiz y accion correctiva del informe', () => {
    const prompt = buildPromptReparacion({
      causa_raiz: 'variable no definida',
      archivos_afectados: ['a.js:10'],
      accion_correctiva: 'definir la variable antes de usarla',
    });
    assert.match(prompt, /variable no definida/);
    assert.match(prompt, /a\.js:10/);
    assert.match(prompt, /definir la variable/);
  });

  test('capturarError: retorna clasificacion + prompt de diagnostico + roles correctos', () => {
    const r = capturarError(new Error('ENOENT: no such file'), { herramienta: 'test' });
    assert.equal(r.clasificacion.categoria, 'sistema_de_archivos');
    assert.equal(r.prompts.reparacion_pendiente, true);
    assert.equal(r.rol_diagnostico, 'auditor');
    assert.equal(r.rol_reparacion, 'architect');
  });

  test('LoopGuard: no escala dentro del presupuesto normal', () => {
    const guard = new LoopGuard({ maxIntentos: 5 });
    const r = guard.registrarCheckpoint({ avance: true });
    assert.equal(r.escalar, false);
  });

  test('LoopGuard: escala al superar el presupuesto de intentos', () => {
    const guard = new LoopGuard({ maxIntentos: 2 });
    guard.registrarCheckpoint({ avance: true });
    const r = guard.registrarCheckpoint({ avance: true });
    assert.equal(r.escalar, true);
    assert.match(r.razon, /PRESUPUESTO_EXCEDIDO/);
  });

  test('LoopGuard: escala tras 2 checkpoints consecutivos sin avance', () => {
    const guard = new LoopGuard({ maxIntentos: 10 });
    guard.registrarCheckpoint({ avance: false });
    const r = guard.registrarCheckpoint({ avance: false });
    assert.equal(r.escalar, true);
    assert.match(r.razon, /SIN_AVANCE/);
  });

  test('LoopGuard: escala ante el mismo error repetido 2 veces', () => {
    const guard = new LoopGuard({ maxIntentos: 10 });
    guard.registrarCheckpoint({ avance: false, error: 'TypeError: x is undefined' });
    const r = guard.registrarCheckpoint({ avance: true, error: 'TypeError: x is undefined' });
    assert.equal(r.escalar, true);
    assert.match(r.razon, /ERROR_REPETIDO/);
  });

  test('LoopGuard: reset() reinicia el estado para reutilizar el guard', () => {
    const guard = new LoopGuard({ maxIntentos: 2 });
    guard.registrarCheckpoint({ avance: true });
    guard.registrarCheckpoint({ avance: true });
    guard.reset();
    assert.equal(guard.intentos, 0);
    assert.deepEqual(guard.checkpoints, []);
    assert.deepEqual(guard.historialErrores, []);
  });
});

// Nota: pre-commit-tdd.js ya tiene cobertura completa en
// tests/intent-classifier.test.js ("pre-commit-tdd.js — gate TDD por
// heuristica de presencia") -- no se duplica aqui.

// ─── hooks-definition.js ──────────────────────────────────────────────────────
