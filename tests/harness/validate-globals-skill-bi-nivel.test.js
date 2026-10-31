'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, dirAislado } = require('./_shared');

describe('validate-globals.js — skills bi-nivel (manifest.json + rules.md)', () => {
  const SCRIPT = path.join(BIN, 'validate-globals.js');
  const BASE_DIR = dirAislado('skills-bi-nivel');
  const ENV = { ...process.env, AI_CORE_SKILLS_DIR: BASE_DIR };
  const NOMBRE = `zz-test-bi-nivel-${process.pid}`;
  const DIR = path.join(BASE_DIR, NOMBRE);

  const manifestValido = () => ({
    id: NOMBRE,
    triggers: ['disparador de prueba'],
    tools: [],
    summary: 'Resumen de prueba del skill bi-nivel.',
  });

  function crear({ manifest, rules }) {
    fs.rmSync(DIR, { recursive: true, force: true });
    fs.mkdirSync(DIR, { recursive: true });
    if (manifest !== undefined) fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(manifest), 'utf8');
    if (rules !== undefined) fs.writeFileSync(path.join(DIR, 'rules.md'), rules, 'utf8');
  }

  function resultado() {
    const r = spawnSync('node', [SCRIPT, '--json'], { encoding: 'utf8', cwd: REPO, env: ENV, maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(r.stdout).resultados.find(x => x.nombre === NOMBRE);
  }

  after(() => fs.rmSync(BASE_DIR, { recursive: true, force: true }));

  test('camino feliz: manifest valido y rules.md no vacio es CONFORME sin SKILL.md', () => {
    crear({ manifest: manifestValido(), rules: '## Invariantes\n- regla\n' });
    const r = resultado();
    assert.equal(r.status, 'CONFORME');
    assert.deepEqual(r.hallazgos, []);
  });

  test('error: id del manifest distinto de la carpeta genera hallazgo alta', () => {
    crear({ manifest: { ...manifestValido(), id: 'otro-id' }, rules: '## Invariantes\n- regla\n' });
    const r = resultado();
    assert.ok(r.hallazgos.some(h => h.sev === 'alta' && h.desc.includes('id')));
  });

  test('error: manifest con campos invalidos genera hallazgos alta', () => {
    crear({ manifest: { id: NOMBRE, triggers: [], tools: 'x', summary: '' }, rules: '## Invariantes\n- regla\n' });
    const r = resultado();
    assert.ok(r.hallazgos.filter(h => h.sev === 'alta').length >= 3);
  });

  test('error: sin rules.md es critico', () => {
    crear({ manifest: manifestValido() });
    const r = resultado();
    assert.ok(r.hallazgos.some(h => h.sev === 'critica' && h.desc.includes('rules.md')));
  });

  test('error: manifest.json con JSON invalido es critico', () => {
    crear({ rules: '## Invariantes\n- regla\n' });
    fs.writeFileSync(path.join(DIR, 'manifest.json'), '{no es json', 'utf8');
    const r = resultado();
    assert.ok(r.hallazgos.some(h => h.sev === 'critica' && h.desc.includes('manifest.json')));
  });

  test('error: sin SKILL.md ni manifest.json sigue siendo critico', () => {
    crear({ rules: '## Invariantes\n- regla\n' });
    const r = resultado();
    assert.ok(r.hallazgos.some(h => h.sev === 'critica' && h.desc.includes('SKILL.md no existe')));
  });
});
