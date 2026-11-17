'use strict';

/**
 * Regresion de la auditoria: una fecha ausente o invalida producia NaN, y
 * "NaN >= 60" es falso: el skill quedaba en OK y el gate de vigencia pasaba
 * con datos faltantes. Un --stale-days no numerico tambien daba NaN.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { BIN } = require('./_shared');

const SCRIPT = path.join(BIN, 'audit-market.js');
const hoy = new Date().toISOString().slice(0, 10);
const haceDias = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function correr({ lastUpdated, verified }, args = ['--json']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-market-'));
  fs.mkdirSync(path.join(dir, 'skills', 'demo'), { recursive: true });
  const meta = lastUpdated === undefined ? '' : `metadata:\n  last_updated: ${lastUpdated}\n`;
  fs.writeFileSync(path.join(dir, 'skills', 'demo', 'SKILL.md'), `---\nname: demo\n${meta}---\ncuerpo\n`);
  const dominio = verified === undefined ? { skills: ['demo'] } : { skills: ['demo'], verified };
  fs.writeFileSync(path.join(dir, 'standards.json'), JSON.stringify({ domains: { web: dominio } }));
  const r = spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, AI_CORE_SKILLS_DIR: path.join(dir, 'skills'), AI_CORE_MARKET_STANDARDS_PATH: path.join(dir, 'standards.json') },
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}
const estado = (r) => JSON.parse(r.stdout).resultados[0].status;

describe('audit-market.js: fechas invalidas', () => {
  test('un dominio sin fecha verified se marca FECHA_INVALIDA, no OK', () => {
    assert.equal(estado(correr({ lastUpdated: hoy, verified: undefined })), 'FECHA_INVALIDA');
  });
  test('una fecha verified ilegible se marca FECHA_INVALIDA', () => {
    assert.equal(estado(correr({ lastUpdated: hoy, verified: 'ayer' })), 'FECHA_INVALIDA');
  });
  test('un last_updated ilegible se marca FECHA_INVALIDA', () => {
    assert.equal(estado(correr({ lastUpdated: 'pronto', verified: hoy })), 'FECHA_INVALIDA');
  });
  test('--only-stale lista el hallazgo para que el gate falle (falla con cualquier salida)', () => {
    const r = correr({ lastUpdated: hoy, verified: 'ayer' }, ['--only-stale']);
    assert.match(r.stdout, /demo: FECHA_INVALIDA/);
  });
  test('--stale-days no numerico termina con exit 1 y un mensaje claro', () => {
    const r = correr({ lastUpdated: hoy, verified: hoy }, ['--json', '--stale-days', 'abc']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /stale-days/);
  });
});

describe('audit-market.js: lo valido sigue igual', () => {
  test('fechas recientes y validas dan OK y --only-stale no imprime nada', () => {
    assert.equal(estado(correr({ lastUpdated: hoy, verified: haceDias(1) })), 'OK');
    assert.equal(correr({ lastUpdated: hoy, verified: haceDias(1) }, ['--only-stale']).stdout.trim(), '');
  });
  test('una verificacion de 90 dias da STALE_MERCADO', () => {
    assert.equal(estado(correr({ lastUpdated: hoy, verified: haceDias(90) })), 'STALE_MERCADO');
  });
});
