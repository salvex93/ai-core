'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('StyleProfiler.js', () => {
  const { registrar, generarBloqueEstilo, obtenerPerfil, limpiar } =
    require(path.join(REPO, 'scripts', 'services', 'StyleProfiler.js'));

  test('sin muestras: generarBloqueEstilo retorna null', () => {
    limpiar();
    assert.equal(generarBloqueEstilo(), null);
  });

  test('menos de 3 muestras: sigue retornando null', () => {
    limpiar();
    registrar('mensaje de prueba suficientemente largo');
    registrar('otro mensaje de prueba suficientemente largo');
    assert.equal(generarBloqueEstilo(), null);
  });

  test('mensajes muy cortos (< 5 chars) no se registran', () => {
    limpiar();
    registrar('hi');
    assert.equal(obtenerPerfil().muestras, 0);
  });

  test('con 3+ muestras: genera bloque de estilo con reglas inamovibles', () => {
    limpiar();
    registrar('mensaje uno de prueba tecnica con API y token');
    registrar('mensaje dos de prueba tecnica con schema y endpoint');
    registrar('mensaje tres de prueba tecnica con commit y branch');

    const bloque = generarBloqueEstilo();
    assert.ok(bloque);
    assert.match(bloque, /PERFIL DE ESTILO/);
    assert.match(bloque, /Nunca emojis ni iconos/);
    assert.match(bloque, /Nunca responder en ingles/);
  });

  test('obtenerPerfil: detecta alta densidad tecnica', () => {
    limpiar();
    registrar('API MCP LLM SQL token prompt schema endpoint');
    registrar('API MCP LLM SQL token prompt schema endpoint');
    registrar('API MCP LLM SQL token prompt schema endpoint');
    const perfil = obtenerPerfil();
    assert.ok(perfil.densidadTecnicaMedia > 0.05);
  });

  test('limpiar: resetea el buffer de muestras', () => {
    registrar('mensaje de prueba suficientemente largo para contar');
    assert.ok(obtenerPerfil().muestras > 0);
    limpiar();
    assert.equal(obtenerPerfil().muestras, 0);
  });

  test('ventana de MAX_MUESTRAS: no crece indefinidamente', () => {
    limpiar();
    for (let i = 0; i < 25; i++) registrar(`mensaje numero ${i} de prueba con longitud suficiente`);
    assert.ok(obtenerPerfil().muestras <= 20, 'el buffer debe estar acotado a MAX_MUESTRAS');
    limpiar();
  });
});

// ─── ErrorRepairLoop.js ───────────────────────────────────────────────────────
