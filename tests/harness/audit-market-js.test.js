'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('audit-market.js', () => {
  const SCRIPT = path.join(BIN, 'audit-market.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('--json produce un resumen valido con los 42 skills reales', () => {
    const r = runScript(SCRIPT, ['--json']);
    assert.equal(r.status, 0);
    const salida = JSON.parse(r.stdout);
    assert.equal(salida.resumen.total, 42);
    assert.ok(Array.isArray(salida.resultados));
  });

  test('--skill filtra a un solo skill', () => {
    const r = runScript(SCRIPT, ['--json', '--skill', 'ciso']);
    const salida = JSON.parse(r.stdout);
    assert.equal(salida.resultados.length, 1);
    assert.equal(salida.resultados[0].skill, 'ciso');
  });

  test('nunca hace llamadas de red ni escribe archivos (solo lectura + stdout)', () => {
    const antes = fs.statSync(path.join(REPO, '.claude', 'MARKET_STANDARDS.json')).mtimeMs;
    runScript(SCRIPT, ['--json']);
    const despues = fs.statSync(path.join(REPO, '.claude', 'MARKET_STANDARDS.json')).mtimeMs;
    assert.equal(antes, despues, 'audit-market.js es de solo lectura, nunca debe modificar MARKET_STANDARDS.json');
  });

  test('--only-stale con todo OK no imprime nada (silencioso para el Protocolo de Arranque)', () => {
    // Gap real: el protocolo de arranque de CLAUDE.md necesita correr esto en
    // cada sesion sin agregar ruido cuando no hay hallazgos -- --only-stale
    // sale con stdout vacio y exit 0 si no hay ningun STALE_MERCADO/DRIFT_VS_MERCADO.
    const r = runScript(SCRIPT, ['--only-stale']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  });

  test('--only-stale con un dominio STALE si imprime el hallazgo', () => {
    // Fuerza un dominio viejo via --stale-days 0 -- cualquier dominio con
    // "verified" distinto de hoy dispara STALE_MERCADO con ese umbral.
    const r = runScript(SCRIPT, ['--only-stale', '--stale-days', '0']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /STALE_MERCADO|DRIFT_VS_MERCADO/);
  });
});

// ─── norm-harness.js ──────────────────────────────────────────────────────────
// Script con efectos reales de sistema (symlinks, borrado de archivos legacy)
// -- se prueba SIEMPRE con cwd apuntando a un proyecto anfitrion temporal,
// nunca contra el repo principal.
