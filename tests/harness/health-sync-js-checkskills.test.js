'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('health-sync.js — checkSkills', () => {
  const { checkSkills } = require(path.join(BIN, 'health-sync.js'));

  test('el repo real: todos los skills existentes tienen frontmatter valido', () => {
    // Regresion real detectada en esta sesion: checkSkills() dependia de una
    // tabla de skills en CLAUDE.md que ya no existe (routing via frontmatter
    // description) -- reportaba 36/38 skills como "huerfanos" falsamente.
    // No fijar el conteo como constante -- crece con el repo (43 tras sumar
    // product-lifecycle-orchestrator); se verifica contra los directorios
    // reales de .claude/skills/, que es la fuente de verdad.
    const totalSkillsReal = fs.readdirSync(SKILLS, { withFileTypes: true })
      .filter((d) => d.isDirectory()).length;
    const r = checkSkills(REPO);
    assert.equal(r.ok, true, `no debe haber skills invalidos: ${JSON.stringify(r.invalid)}`);
    assert.equal(r.count, totalSkillsReal);
    assert.deepEqual(r.invalid, []);
  });

  // Los 2 tests siguientes escriben/borran un directorio dentro de
  // .claude/skills/ real (compartido con el repo). Nombre unico por pid
  // para no colisionar entre si si algun dia corren en paralelo, aunque el
  // riesgo real que motivo este fix era distinto: otro archivo de test
  // (health-check-js-gate-de-sesion.test.js) invoca checkSkills() a traves
  // de health-check.js real mientras este directorio existe a medias --
  // ver fix de TOCTOU en checkSkills() (health-sync.js) que ahora tolera
  // que el directorio desaparezca entre el readdirSync y el statSync.
  test('detecta un skill con name que no coincide con la carpeta', () => {
    const testDir = path.join(SKILLS, `zz-test-health-sync-temp-${process.pid}`);
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'SKILL.md'), [
      '---',
      'name: nombre-incorrecto',
      'description: skill de prueba para test unitario.',
      '---',
      '# prueba',
    ].join('\n'));

    const r = checkSkills(REPO);
    fs.rmSync(testDir, { recursive: true, force: true });

    assert.equal(r.ok, false);
    assert.ok(r.invalid.includes(`zz-test-health-sync-temp-${process.pid}`));
  });

  test('detecta un skill sin description', () => {
    const testDir = path.join(SKILLS, `zz-test-health-sync-temp-${process.pid}`);
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'SKILL.md'), [
      '---',
      `name: zz-test-health-sync-temp-${process.pid}`,
      'description:',
      '---',
      '# prueba',
    ].join('\n'));

    const r = checkSkills(REPO);
    fs.rmSync(testDir, { recursive: true, force: true });

    assert.equal(r.ok, false);
    assert.ok(r.invalid.includes(`zz-test-health-sync-temp-${process.pid}`));
  });
});
