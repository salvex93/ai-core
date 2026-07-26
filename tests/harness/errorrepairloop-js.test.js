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

  test('ejecutarCicloReparacion: propaga el error del bridge si este no esta disponible (sin API key)', async () => {
    // Regresion real: este modulo estaba disenado con 3 fases (deteccion,
    // diagnostico, reparacion) pero solo la deteccion (capturarError) estaba
    // conectada en produccion -- ejecutarCicloReparacion no tenia ningun
    // caller. Al conectarlo, debe degradar con gracia si el bridge no puede
    // completar (ej. sin ANTHROPIC_API_KEY), sin colgar el proceso.
    //
    // anthropic-bridge.js relee .env del disco en cada llamada (loadEnv()) Y
    // ANTHROPIC_API_KEY puede estar seteada como variable de entorno real
    // del sistema (no solo en .env) -- loadEnv() solo la setea si NO existe
    // ya en process.env. La unica forma determinista de simular "sin API
    // key" sin gastar tokens reales es renombrar .env Y borrar la variable
    // del propio proceso, restaurando ambos en finally.
    const ENV_PATH = path.join(REPO, '.env');
    const ENV_BAK  = path.join(REPO, '.env.bak-test-tmp');
    const habiaEnv = fs.existsSync(ENV_PATH);
    if (habiaEnv) fs.renameSync(ENV_PATH, ENV_BAK);
    const envPrevio = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      delete require.cache[require.resolve(path.join(REPO, 'scripts', 'services', 'ErrorRepairLoop.js'))];
      delete require.cache[require.resolve(path.join(REPO, 'scripts', 'anthropic-bridge.js'))];
      const { ejecutarCicloReparacion } = require(path.join(REPO, 'scripts', 'services', 'ErrorRepairLoop.js'));
      await assert.rejects(
        () => ejecutarCicloReparacion({ error: new Error('ENOENT: falta el archivo'), herramienta: 'test' }),
        /ANTHROPIC_API_KEY/
      );
    } finally {
      if (envPrevio !== undefined) process.env.ANTHROPIC_API_KEY = envPrevio;
      if (habiaEnv) fs.renameSync(ENV_BAK, ENV_PATH);
    }
  });
});

// ─── mcp-gemini.js — dispatch conecta ejecutarCicloReparacion en el catch ───

describe('mcp-gemini.js — ciclo de reparacion conectado al catch de tools/call', () => {
  const SCRIPT   = path.join(REPO, 'scripts', 'mcp-gemini.js');
  const ENV_PATH = path.join(REPO, '.env');
  const ENV_BAK  = path.join(REPO, '.env.bak-test-tmp2');

  function llamarToolSinApiKey(name, args) {
    // Sin .env real NI ANTHROPIC_API_KEY heredada del entorno del sistema,
    // el ciclo de reparacion no puede completar -- verifica que el error
    // original de la tool siempre llega intacto, con o sin bridge disponible.
    const evento = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) + '\n';
    const habiaEnv = fs.existsSync(ENV_PATH);
    if (habiaEnv) fs.renameSync(ENV_PATH, ENV_BAK);
    try {
      const envSinKey = { ...process.env };
      delete envSinKey.ANTHROPIC_API_KEY;
      const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: evento, env: envSinKey, timeout: 15000 });
      const linea = r.stdout.trim().split('\n').find(Boolean);
      return linea ? JSON.parse(linea) : null;
    } finally {
      if (habiaEnv) fs.renameSync(ENV_BAK, ENV_PATH);
    }
  }

  test('tool que falla con error real: la respuesta de error incluye meta.clasificacion', () => {
    // resumir_backlog con un directorio en vez de archivo fuerza un EISDIR
    // real (fs.readFileSync sobre un directorio), sin necesidad de mocks.
    const respuesta = llamarToolSinApiKey('resumir_backlog', { ruta_backlog: REPO });
    assert.ok(respuesta, 'debe responder algo por stdout');
    assert.ok(respuesta.error, 'debe ser una respuesta de error JSON-RPC');
    assert.ok(respuesta.error.data, 'el error debe incluir data (meta de ErrorRepairLoop)');
    assert.ok(respuesta.error.data.clasificacion, 'debe incluir la clasificacion del error original');
  });

  test('tool que falla y el ciclo de reparacion no puede completar (sin API key): el error original igual llega intacto', () => {
    const respuesta = llamarToolSinApiKey('resumir_backlog', { ruta_backlog: REPO });
    assert.ok(respuesta.error.message, 'el mensaje del error original de la tool no debe perderse');
    assert.ok(
      respuesta.error.data.reparacion === null || respuesta.error.data.reparacion?.fallo,
      'si el ciclo de reparacion no pudo completar, debe reportarlo sin romper la respuesta de error original'
    );
  });
});

// Nota: pre-commit-tdd.js ya tiene cobertura completa en
// tests/intent-classifier.test.js ("pre-commit-tdd.js — gate TDD por
// heuristica de presencia") -- no se duplica aqui.

// ─── hooks-definition.js ──────────────────────────────────────────────────────
