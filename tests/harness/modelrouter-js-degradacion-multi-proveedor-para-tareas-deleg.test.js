'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('ModelRouter.js — degradacion multi-proveedor para tareas delegables (ahorro de cuota Claude)', () => {
  const { route } = require(path.join(REPO, 'scripts', 'services', 'ModelRouter.js'));

  const SOLO_ANTHROPIC = [{ provider: 'anthropic', available: true }];
  const CON_GEMINI      = [{ provider: 'anthropic', available: true }, { provider: 'gemini', available: true }];
  const CON_OPENAI      = [{ provider: 'anthropic', available: true }, { provider: 'openai', available: true }];
  const TODOS           = [
    { provider: 'anthropic', available: true },
    { provider: 'gemini', available: true },
    { provider: 'openai', available: true },
  ];

  test('sin disponibles (default): comportamiento identico al actual, Claude siempre es la constante', () => {
    // Degradacion con gracia al minimo viable: si nadie pasa el parametro
    // nuevo (proyectos existentes, otros usuarios del arnes), route() se
    // comporta exactamente igual que antes de este cambio.
    const r = route('reparar_error');
    assert.equal(r.tier, 'haiku');
    assert.equal(r.modelo, 'claude-haiku-4-5-20251001');
  });

  test('tarea delegable de tier Haiku, solo Anthropic disponible: cae en Haiku (linea base, un solo proveedor)', () => {
    const r = route('reparar_error', 0, { disponibles: SOLO_ANTHROPIC });
    assert.equal(r.tier, 'haiku');
    assert.equal(r.modelo, 'claude-haiku-4-5-20251001');
  });

  test('tarea delegable de tier Haiku, Gemini disponible: prefiere Gemini (ya era el comportamiento existente)', () => {
    const r = route('reparar_error', 0, { disponibles: CON_GEMINI });
    assert.equal(r.tier, 'gemini');
  });

  test('tarea delegable de tier Haiku, sin Gemini pero con OpenAI: enruta a OpenAI en vez de gastar cuota de Claude', () => {
    const r = route('reparar_error', 0, { disponibles: CON_OPENAI });
    assert.equal(r.tier, 'openai');
    assert.equal(r.proveedor, 'openai');
  });

  test('tarea delegable de tier Haiku, solo DeepSeek disponible: enruta a DeepSeek (preparado, aunque el usuario actual no lo tenga configurado)', () => {
    const disponibles = [{ provider: 'anthropic', available: true }, { provider: 'deepseek', available: true }];
    const r = route('reparar_error', 0, { disponibles });
    assert.equal(r.tier, 'deepseek');
    assert.equal(r.proveedor, 'deepseek');
  });

  test('tarea delegable de tier Haiku, solo Kimi disponible: enruta a Kimi', () => {
    const disponibles = [{ provider: 'anthropic', available: true }, { provider: 'kimi', available: true }];
    const r = route('reparar_error', 0, { disponibles });
    assert.equal(r.tier, 'kimi');
    assert.equal(r.proveedor, 'kimi');
  });

  test('con multiples pagados disponibles (sin Gemini): respeta el orden de PROVEEDORES_DELEGABLES', () => {
    const { PROVEEDORES_DELEGABLES } = require(path.join(REPO, 'scripts', 'services', 'ModelRouter.js'));
    const disponibles = [
      { provider: 'anthropic', available: true },
      { provider: 'kimi', available: true },
      { provider: 'openai', available: true },
    ];
    const r = route('reparar_error', 0, { disponibles });
    assert.equal(r.tier, 'openai', 'openai precede a kimi en PROVEEDORES_DELEGABLES');
    assert.ok(PROVEEDORES_DELEGABLES.indexOf('openai') < PROVEEDORES_DELEGABLES.indexOf('kimi'));
  });

  test('tarea delegable de tier Haiku, todos disponibles: Gemini (gratis) tiene prioridad sobre OpenAI (pagado)', () => {
    const r = route('reparar_error', 0, { disponibles: TODOS });
    assert.equal(r.tier, 'gemini', 'Gemini es gratis, debe preferirse sobre OpenAI pagado cuando ambos aplican');
  });

  test('tareas NO delegables (Sonnet/Opus/Fable) nunca se enrutan a OpenAI, aunque este disponible', () => {
    // El ahorro de cuota solo aplica a tareas de bajo riesgo ya delegables
    // hoy a Haiku/Gemini -- razonamiento complejo sigue siendo Claude.
    const r = route('disenar_sistema', 0, { disponibles: TODOS });
    assert.equal(r.tier, 'fable');
    assert.equal(r.modelo, 'claude-fable-5');
  });

  test('tier verificador ignora el parametro disponibles (logica propia de CrossVerifier)', () => {
    const r = route('verificar_diff', 0, { disponibles: TODOS });
    assert.equal(r.tier, 'verificador');
    assert.equal(r.modelo, null);
  });
});

// ─── SubagentGrader.js — grader generico de calidad (Performance Outcomes) ───
