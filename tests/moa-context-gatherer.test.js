/**
 * moa-context-gatherer.test.js — Tests de regresion para moa-context-gatherer.js
 * Ejecutar: node --test tests/
 * Compatible: Node >= 18 (node:test nativo, sin dependencias externas)
 *
 * Corre el script como proceso hijo (execFileSync) para no contaminar el
 * proceso de test con variables de entorno de API keys ni con el mock de
 * ModelDispatcher via require.cache — cada test define su propio entorno
 * aislado por invocacion.
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO   = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO, '.claude', 'bin', 'moa-context-gatherer.js');
const MOA_CONTEXT = path.join(REPO, '.claude', 'moa_context.md');

function run(env) {
  return execFileSync('node', [SCRIPT], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

// Guarda/restaura GEMINI_API_KEY y DEEPSEEK_API_KEY del proceso de test.
// Restaura por delete (no por asignacion) cuando el valor original era
// undefined — asignar `undefined` a una env var la convierte al string
// literal "undefined" (truthy), contaminando el entorno de tests posteriores.
let envOriginal;
function guardarEnv() {
  envOriginal = { g: process.env.GEMINI_API_KEY, d: process.env.DEEPSEEK_API_KEY };
}
function restaurarEnv() {
  if (envOriginal.g === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = envOriginal.g;
  if (envOriginal.d === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = envOriginal.d;
}

describe('moa-context-gatherer.js — guard de disponibilidad (unidad aislada)', () => {
  // ambasKeysDisponibles() se testea en memoria, sin pasar por loadEnv() ni
  // por el proceso completo: loadEnv() rellena cualquier env var falsy desde
  // .env real (mismo patron usado en todo el arnes), asi que pasar
  // GEMINI_API_KEY='' a un proceso hijo NO deshabilita la key — .env la repone.
  // Aislar la funcion evita ese falso negativo y no hace llamadas de red reales.
  const { ambasKeysDisponibles } = require('../.claude/bin/moa-context-gatherer');

  beforeEach(() => guardarEnv());
  afterEach(() => restaurarEnv());

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('ambas keys presentes: retorna true', () => {
    process.env.GEMINI_API_KEY = 'fake-gemini';
    process.env.DEEPSEEK_API_KEY = 'fake-deepseek';
    assert.equal(ambasKeysDisponibles(), true);
  });

  test('falta DEEPSEEK_API_KEY: retorna false', () => {
    process.env.GEMINI_API_KEY = 'fake-gemini';
    delete process.env.DEEPSEEK_API_KEY;
    assert.equal(ambasKeysDisponibles(), false);
  });

  test('falta GEMINI_API_KEY: retorna false', () => {
    delete process.env.GEMINI_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'fake-deepseek';
    assert.equal(ambasKeysDisponibles(), false);
  });

  test('ninguna key presente: retorna false', () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    assert.equal(ambasKeysDisponibles(), false);
  });
});

describe('moa-context-gatherer.js — proceso completo (E2E, sin red)', () => {
  test('limpia un moa_context.md obsoleto de un turno anterior si el guard bloquea el turno actual', () => {
    fs.writeFileSync(MOA_CONTEXT, 'contenido obsoleto de un turno previo', 'utf8');
    // Bloquea el guard sin ambiguedad de loadEnv(): CLAUDE_USER_PROMPT vacio
    // detiene el flujo ANTES de invocar el dispatcher, sin depender de si
    // .env repone las keys vacias — evita el mismo problema de raiz.
    run({ CLAUDE_USER_PROMPT: '' });
    assert.ok(!fs.existsSync(MOA_CONTEXT), 'no debe quedar un archivo obsoleto cuando el guard bloquea');
  });

  test('CLAUDE_USER_PROMPT vacio: no invoca el dispatcher (no llega a escribir moa_context.md)', () => {
    if (fs.existsSync(MOA_CONTEXT)) fs.unlinkSync(MOA_CONTEXT);
    run({ CLAUDE_USER_PROMPT: '' });
    assert.ok(!fs.existsSync(MOA_CONTEXT));
  });
});

describe('moa-context-gatherer.js — registrado en el hook UserPromptSubmit', () => {
  test('esta registrado en settings.json junto a detect-role.js', () => {
    const settings = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8'));
    const hooks = settings.hooks?.UserPromptSubmit?.[0]?.hooks || [];
    const cmds  = hooks.map(h => h.command || '');
    assert.ok(cmds.some(c => c.includes('moa-context-gatherer.js')));
    assert.ok(cmds.some(c => c.includes('detect-role.js')));
  });

  test('usa una categoria de process-guard distinta a "intent" (evita colision de lock con detect-role.js)', () => {
    const settings = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8'));
    const hooks = settings.hooks?.UserPromptSubmit?.[0]?.hooks || [];
    const cmdMoa = hooks.map(h => h.command || '').find(c => c.includes('moa-context-gatherer.js'));
    assert.match(cmdMoa, /process-guard\.js"\s+moa\s/);
  });
});
