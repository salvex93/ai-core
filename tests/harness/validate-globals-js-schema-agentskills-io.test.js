'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('validate-globals.js — schema agentskills.io', () => {
  const SCRIPT   = path.join(BIN, 'validate-globals.js');
  const TEST_DIR = path.join(SKILLS, 'zz-test-agentskills-temp');

  function crearSkillDePrueba(frontmatter) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, 'SKILL.md'), frontmatter, 'utf8');
  }

  function limpiar() {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }

  function runValidate() {
    // maxBuffer explicito: la salida --json de validate-globals.js se trunca
    // en macOS/Node 20 antes del default de 1MB -- confirmado en CI.
    return spawnSync('node', [SCRIPT, '--json'], { encoding: 'utf8', cwd: REPO, maxBuffer: 10 * 1024 * 1024 });
  }

  after(limpiar);

  test('name que no coincide con la carpeta genera hallazgo alta', () => {
    limpiar();
    crearSkillDePrueba([
      '---',
      'name: nombre-incorrecto',
      'description: skill de prueba para test unitario, no usar en produccion.',
      'origin: ai-core',
      'version: 1.0.0',
      'last_updated: 2026-01-01',
      'rol: coder',
      '---',
      '# Skill de prueba',
    ].join('\n'));

    const r = runValidate();
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find(x => x.nombre === 'zz-test-agentskills-temp');
    assert.ok(resultado, 'debe auditar el skill de prueba');
    assert.ok(
      resultado.hallazgos.some(h => h.desc.includes('no coincide con la carpeta')),
      'debe reportar el mismatch name vs carpeta'
    );
  });

  test('name con mayusculas o guiones consecutivos genera hallazgo', () => {
    limpiar();
    crearSkillDePrueba([
      '---',
      'name: zz-test-agentskills-temp',
      'description: skill de prueba para test unitario, no usar en produccion.',
      'origin: ai-core',
      'version: 1.0.0',
      'last_updated: 2026-01-01',
      'rol: coder',
      '---',
      '# Skill de prueba',
    ].join('\n'));
    // name valido aqui (coincide con carpeta) — probar el formato por separado
    // renombrando el frontmatter con guiones consecutivos, invalido segun spec.
    fs.writeFileSync(
      path.join(TEST_DIR, 'SKILL.md'),
      fs.readFileSync(path.join(TEST_DIR, 'SKILL.md'), 'utf8').replace(
        'name: zz-test-agentskills-temp',
        'name: zz--test-agentskills-temp'
      ),
      'utf8'
    );

    const r = runValidate();
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find(x => x.nombre === 'zz-test-agentskills-temp');
    assert.ok(resultado, 'debe auditar el skill de prueba');
    assert.ok(
      resultado.hallazgos.some(h => h.desc.includes('no cumple el formato')),
      'debe reportar el formato invalido por guiones consecutivos'
    );
  });

  test('SKILL.md que documenta la regla de no-atribucion a IA (sin violarla): NO genera hallazgo Co-Authored-By', () => {
    // Falso positivo real detectado en aiops-engineer/SKILL.md: el chequeo
    // VIOLACIONES usa /Co-Authored-By/i.test(content) sobre el SKILL.md
    // completo, sin distinguir si la coincidencia esta dentro de la propia
    // documentacion de la regla que la prohibe (mismo patron ya corregido en
    // standards-guard.js para CLAUDE.md/README.md).
    limpiar();
    const marca = ['Co', 'Authored', 'By'].join('-');
    crearSkillDePrueba([
      '---',
      'name: zz-test-agentskills-temp',
      'description: skill de prueba para test unitario, no usar en produccion.',
      'origin: ai-core',
      'version: 1.0.0',
      'last_updated: 2026-01-01',
      'rol: coder',
      '---',
      '# Skill de prueba',
      `Protocolo de Commits Git: referencia el estandar de autoria unica sin atribucion a herramientas de IA (sin ${marca}).`,
    ].join('\n'));

    const r = runValidate();
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find(x => x.nombre === 'zz-test-agentskills-temp');
    assert.ok(resultado, 'debe auditar el skill de prueba');
    assert.ok(
      !resultado.hallazgos.some(h => h.desc.includes('Co-Authored-By')),
      'documentar la regla no es violarla -- no debe generar el hallazgo'
    );
  });

  test('skill conforme al schema no genera hallazgos de agentskills.io', () => {
    limpiar();
    crearSkillDePrueba([
      '---',
      'name: zz-test-agentskills-temp',
      'description: skill de prueba para test unitario, no usar en produccion.',
      'origin: ai-core',
      'version: 1.0.0',
      'last_updated: 2026-01-01',
      'rol: coder',
      '---',
      '# Skill de prueba',
    ].join('\n'));

    const r = runValidate();
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find(x => x.nombre === 'zz-test-agentskills-temp');
    assert.ok(resultado, 'debe auditar el skill de prueba');
    assert.ok(
      !resultado.hallazgos.some(h => h.desc.startsWith('agentskills.io:')),
      'un skill con name valido y coincidente no debe generar hallazgos de agentskills.io'
    );
  });

  test('skill en ADVERTENCIA (solo hallazgos media/baja): "ESTADO: OK" no debe afirmar "todos conformes"', () => {
    // Bug real: conformes/total y el texto de ESTADO se calculan de forma
    // independiente. Un skill sin last_updated cae en ADVERTENCIA (sev media)
    // pero el texto seguia diciendo "todos los skills son conformes" porque
    // ESTADO: OK solo mira criticos/altos, ignorando ADVERTENCIA.
    limpiar();
    crearSkillDePrueba([
      '---',
      'name: zz-test-agentskills-temp',
      'description: skill de prueba para test unitario, no usar en produccion.',
      'origin: ai-core',
      'version: 1.0.0',
      'rol: coder',
      '---',
      '# Skill de prueba',
    ].join('\n'));

    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, maxBuffer: 10 * 1024 * 1024 });
    limpiar();
    const salida = JSON.parse(
      spawnSync('node', [SCRIPT, '--json'], { encoding: 'utf8', cwd: REPO, maxBuffer: 10 * 1024 * 1024 }).stdout
    );
    // No hay forma de reusar r.stdout con --json y sin --json en la misma
    // corrida; se valida el texto de la corrida sin --json (r.stdout).
    assert.match(r.stdout, /RESUMEN: \d+\/\d+ conformes/, 'debe imprimir el resumen numerico');
    const resumenMatch = r.stdout.match(/RESUMEN: (\d+)\/(\d+) conformes/);
    const [, conformesStr, totalStr] = resumenMatch;
    if (conformesStr !== totalStr) {
      assert.doesNotMatch(
        r.stdout,
        /ESTADO: OK — todos los skills son conformes/,
        'si conformes < total no debe afirmarse que todos los skills son conformes'
      );
    }
  });
});

// ─── CLAUDE.md — integridad del nucleo ───────────────────────────────────────
