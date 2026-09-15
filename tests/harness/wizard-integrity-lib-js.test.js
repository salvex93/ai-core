'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { REPO } = require('./_shared');

describe('lib/wizard-integrity.js', () => {
  const { verificarIntegridad } = require(
    path.join(REPO, '.claude', 'bin', 'lib', 'wizard-integrity.js')
  );

  function depsBase(overrides = {}) {
    return {
      runDetox: () => ({ ok: true, salida: '[OK] nada que limpiar' }),
      runValidateGlobals: () => ({ ok: true, salida: '45/45 skills conformes' }),
      runAuditMarketStale: () => ({ ok: true, salida: '' }),
      esSubmoduloDeHostImpl: () => ({ esSubmodulo: false, hostDir: null, razon: 'sin padre con .gitmodules' }),
      leerVersionPkg: () => '3.39.0',
      leerUltimaVersionChangelog: () => '3.39.0',
      hostDir: null,
      ...overrides,
    };
  }

  test('todo conforme: instalado standalone, versiones sincronizadas, sin hallazgos', () => {
    const r = verificarIntegridad(depsBase());

    assert.equal(r.conforme, true);
    assert.deepEqual(r.hallazgos, []);
    assert.equal(r.submodulo.esSubmodulo, false);
  });

  test('detox reporta codigo legacy eliminado: se refleja como hallazgo informativo, no bloqueante', () => {
    const r = verificarIntegridad(depsBase({
      runDetox: () => ({ ok: true, salida: '[OK] purgados 2 archivo(s) legacy' }),
    }));

    assert.equal(r.conforme, true);
    assert.ok(r.hallazgos.some((h) => /purgados 2/.test(h.detalle)));
  });

  test('validate-globals falla: hallazgo bloqueante, conforme=false', () => {
    const r = verificarIntegridad(depsBase({
      runValidateGlobals: () => ({ ok: false, salida: '2 skills con drift critico' }),
    }));

    assert.equal(r.conforme, false);
    assert.ok(r.hallazgos.some((h) => h.bloqueante && /drift critico/.test(h.detalle)));
  });

  test('audit-market reporta stale: hallazgo bloqueante', () => {
    const r = verificarIntegridad(depsBase({
      runAuditMarketStale: () => ({ ok: false, salida: 'gemini-3.5-flash: 95 dias sin verificar' }),
    }));

    assert.equal(r.conforme, false);
    assert.ok(r.hallazgos.some((h) => h.bloqueante && /gemini-3\.5-flash/.test(h.detalle)));
  });

  test('instalado como submodulo: detecta hostDir y lo reporta sin marcarlo como hallazgo', () => {
    const r = verificarIntegridad(depsBase({
      esSubmoduloDeHostImpl: () => ({ esSubmodulo: true, hostDir: '/proyectos/host', razon: '.gitmodules declara ai-core' }),
      hostDir: '/proyectos/host',
    }));

    assert.equal(r.conforme, true);
    assert.equal(r.submodulo.esSubmodulo, true);
    assert.equal(r.submodulo.hostDir, '/proyectos/host');
  });

  test('version de package.json desincronizada del CHANGELOG: hallazgo bloqueante', () => {
    const r = verificarIntegridad(depsBase({
      leerVersionPkg: () => '3.40.0',
      leerUltimaVersionChangelog: () => '3.39.0',
    }));

    assert.equal(r.conforme, false);
    assert.ok(r.hallazgos.some((h) => h.bloqueante && /3\.40\.0.*3\.39\.0|CHANGELOG/.test(h.detalle)));
  });

  test('multiples fallos: todos aparecen en hallazgos, no solo el primero', () => {
    const r = verificarIntegridad(depsBase({
      runValidateGlobals: () => ({ ok: false, salida: 'drift' }),
      runAuditMarketStale: () => ({ ok: false, salida: 'stale' }),
    }));

    assert.equal(r.conforme, false);
    const bloqueantes = r.hallazgos.filter((h) => h.bloqueante);
    assert.equal(bloqueantes.length, 2);
  });
});
