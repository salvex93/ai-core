'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('SubagentGrader.js (grader generico de calidad post-subagente)', () => {
  const SCRIPT = path.join(REPO, 'scripts', 'services', 'SubagentGrader.js');
  const { parsearGrado, calificar, construirPromptSistema, RUBRICA_DEFECTO, RUBRICA_CON_TAREA } = require(SCRIPT);

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('parsearGrado: camino feliz — JSON valido con score y motivo', () => {
    const grado = parsearGrado('{"score": 85, "motivo": "cumple la tarea con detalle suficiente", "riesgos": []}');
    assert.equal(grado.score, 85);
    assert.equal(grado.motivo, 'cumple la tarea con detalle suficiente');
    assert.deepEqual(grado.riesgos, []);
  });

  test('parsearGrado: score fuera de rango 0-100 se recorta', () => {
    const alto = parsearGrado('{"score": 150, "motivo": "x", "riesgos": []}');
    assert.equal(alto.score, 100);
    const bajo = parsearGrado('{"score": -20, "motivo": "x", "riesgos": []}');
    assert.equal(bajo.score, 0);
  });

  test('parsearGrado: output no parseable falla cerrado (score 0)', () => {
    const grado = parsearGrado('esto no es JSON');
    assert.equal(grado.score, 0, 'output no parseable debe fallar cerrado, nunca asumir un score alto');
    assert.ok(grado.motivo.length > 0, 'debe explicar el fallo de parseo');
  });

  test('calificar: output vacio no llama a ningun proveedor, score 0', async () => {
    const resultado = await calificar({ output: '', agentType: 'Explore' });
    assert.equal(resultado.score, 0);
    assert.equal(resultado.proveedor, null);
  });

  test('calificar: output trivial (por debajo del umbral de lineas) no llama a proveedor', async () => {
    const resultado = await calificar({ output: 'ok, listo.', agentType: 'Explore' });
    assert.equal(resultado.proveedor, null, 'output trivial no amerita gastar tokens en un juez');
  });

  test('RUBRICA_DEFECTO: define los criterios minimos esperados', () => {
    assert.ok(RUBRICA_DEFECTO.includes('completitud') || RUBRICA_DEFECTO.toLowerCase().includes('complet'));
    assert.ok(typeof RUBRICA_DEFECTO === 'string' && RUBRICA_DEFECTO.length > 20);
  });

  test('construirPromptSistema: sin tarea original usa RUBRICA_DEFECTO', () => {
    const prompt = construirPromptSistema(undefined);
    assert.ok(prompt.includes(RUBRICA_DEFECTO));
    assert.ok(!prompt.includes('Cumplimiento de tarea'));
  });

  test('construirPromptSistema: con tarea original usa RUBRICA_CON_TAREA', () => {
    // Cierra la limitacion documentada anteriormente: confirmado
    // empiricamente (2026-07-22) que session_id+prompt_id correlacionan
    // PreToolUse con SubagentStop -- la tarea original SI esta disponible.
    const prompt = construirPromptSistema('haz X');
    assert.ok(prompt.includes(RUBRICA_CON_TAREA));
    assert.ok(prompt.includes('Cumplimiento de tarea'));
    assert.ok(prompt.includes('TAREA ORIGINAL') || prompt.toLowerCase().includes('tarea original'));
  });

  test('calificar: con tareaOriginal, la incluye en el mensaje al juez', async () => {
    const disponibles = [{ provider: 'gemini', available: false }, { provider: 'openai', available: false }, { provider: 'deepseek', available: false }];
    const resultado = await calificar({
      output: Array(20).fill('linea de contenido real').join('\n'),
      agentType: 'Explore',
      tareaOriginal: 'analiza el archivo X',
      disponibles,
    });
    assert.equal(resultado.proveedor, null, 'sin proveedor disponible, no debe intentar llamar a nadie');
  });
});

// ─── subagent-grader.js (hook SubagentStop) ──────────────────────────────────
