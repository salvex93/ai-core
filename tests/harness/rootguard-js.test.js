'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('RootGuard.js', () => {
  const SCRIPT = path.join(REPO, 'scripts', 'services', 'RootGuard.js');
  const { verificar, assertNoMasivaSinMapa, estaBloqueado, escanearRaizLocal, _cargarRaizMapa } = require(SCRIPT);

  test('verificar: no bloquea cuando cwd coincide con la raiz del mapa (repo real)', () => {
    const r = verificar();
    assert.equal(r.bloqueado, false);
    assert.equal(estaBloqueado(), false);
  });

  test('assertNoMasivaSinMapa: no lanza cuando el guard no esta activado', () => {
    verificar(); // asegura estado desbloqueado (cwd real coincide con el mapa)
    assert.doesNotThrow(() => assertNoMasivaSinMapa('test'));
  });

  test('escanearRaizLocal: retorna entradas reales del directorio', () => {
    const entradas = escanearRaizLocal(REPO);
    assert.ok(entradas.includes('CLAUDE.md'));
    assert.ok(entradas.includes('package.json'));
  });

  test('escanearRaizLocal: retorna array vacio para directorio inexistente (no lanza)', () => {
    assert.deepEqual(escanearRaizLocal('/ruta/que/no/existe/jamas'), []);
  });

  test('_cargarRaizMapa: JSON corrupto distingue la causa raiz de "archivo ausente" (console.warn con candidato + mensaje)', () => {
    const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rootguard-test-'));
    const candidatoCorrupto = path.join(dirTmp, '.claude', 'CONTEXT_MAP.json');
    fs.mkdirSync(path.dirname(candidatoCorrupto), { recursive: true });
    fs.writeFileSync(candidatoCorrupto, '{ json invalido sin cerrar', 'utf8');

    const warnOriginal = console.warn;
    const llamadas = [];
    console.warn = (msg) => llamadas.push(msg);
    try {
      const raiz = _cargarRaizMapa([candidatoCorrupto]);
      assert.equal(raiz, null, 'candidato corrupto no debe resolver una raiz');
    } finally {
      console.warn = warnOriginal;
      fs.rmSync(dirTmp, { recursive: true, force: true });
    }

    assert.ok(llamadas.length > 0, 'debe loguear el candidato invalido');
    assert.match(llamadas[0], /candidato invalido/);
    assert.match(llamadas[0], new RegExp(candidatoCorrupto.replace(/\\/g, '\\\\')));
  });
});

// ─── StyleProfiler.js ─────────────────────────────────────────────────────────
