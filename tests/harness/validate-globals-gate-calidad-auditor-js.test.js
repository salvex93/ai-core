'use strict';

/**
 * validate-globals.js — Gate de Calidad Medible obligatorio para skills
 * rol:auditor (hallazgo de auditoria de scaffolding 2026-08-15). Antes de
 * este fix, borrar la seccion "Gate de Calidad Medible" de un skill auditor
 * por error no lo detectaba ningun hook ni script -- SECCIONES_OBLIGATORIAS
 * exigia "Directiva de Interrupcion" pero nunca el gate cuantitativo.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS } = require('./_shared');

describe('validate-globals.js — Gate de Calidad Medible obligatorio para rol:auditor', () => {
  const SCRIPT = path.join(BIN, 'validate-globals.js');
  const NOMBRE_SKILL = `zz-test-gate-auditor-${process.pid}`;
  const TEST_DIR = path.join(SKILLS, NOMBRE_SKILL);

  function frontmatterBase(rol, cuerpoExtra = '') {
    return [
      '---',
      `name: ${NOMBRE_SKILL}`,
      'description: skill de prueba para test unitario, no usar en produccion.',
      'origin: ai-core',
      'version: 1.0.0',
      'last_updated: 2026-01-01',
      `rol: ${rol}`,
      '---',
      '# Skill de prueba',
      '',
      '## Cuando Activar Este Perfil',
      'prueba',
      '## Primera Accion al Activar',
      'prueba',
      '## Directiva de Interrupcion',
      'ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN',
      '## Restricciones del Perfil',
      'Reglas de sesion activas: CLAUDE.md > este skill.',
      cuerpoExtra,
    ].join('\n');
  }

  function crearSkillDePrueba(contenido) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, 'SKILL.md'), contenido, 'utf8');
  }

  function limpiar() {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }

  function runValidate() {
    return spawnSync('node', [SCRIPT, '--json'], { encoding: 'utf8', cwd: REPO, maxBuffer: 10 * 1024 * 1024 });
  }

  after(limpiar);

  test('skill rol:auditor SIN Gate de Calidad Medible genera hallazgo', () => {
    limpiar();
    crearSkillDePrueba(frontmatterBase('auditor'));
    const r = runValidate();
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find(x => x.nombre === NOMBRE_SKILL);
    assert.ok(resultado, 'debe auditar el skill de prueba');
    assert.ok(
      resultado.hallazgos.some(h => /gate de calidad medible/i.test(h.desc)),
      'debe reportar la ausencia del Gate de Calidad Medible'
    );
  });

  test('skill rol:auditor CON "Gate de Calidad Medible" no genera ese hallazgo', () => {
    limpiar();
    crearSkillDePrueba(frontmatterBase('auditor', '## Gate de Calidad Medible\n| Metrica | Umbral |\n|---|---|\n| Ejemplo | 100% |\n'));
    const r = runValidate();
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find(x => x.nombre === NOMBRE_SKILL);
    assert.ok(
      !resultado.hallazgos.some(h => /gate de calidad medible/i.test(h.desc)),
      'no debe reportar ausencia si la seccion existe'
    );
  });

  test('skill rol:auditor CON variante "Gate de evaluacion medible" tambien es aceptado (nombre flexible)', () => {
    limpiar();
    crearSkillDePrueba(frontmatterBase('auditor', '## Gate de evaluacion medible\n| Metrica | Umbral |\n|---|---|\n| Ejemplo | 100% |\n'));
    const r = runValidate();
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find(x => x.nombre === NOMBRE_SKILL);
    assert.ok(
      !resultado.hallazgos.some(h => /gate de calidad medible/i.test(h.desc)),
      'la variante "evaluacion" debe ser equivalente a "calidad"'
    );
  });

  test('skill rol:coder SIN Gate de Calidad Medible NO genera hallazgo (el requisito es solo para rol:auditor)', () => {
    limpiar();
    crearSkillDePrueba(frontmatterBase('coder'));
    const r = runValidate();
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find(x => x.nombre === NOMBRE_SKILL);
    assert.ok(
      !resultado.hallazgos.some(h => /gate de calidad medible/i.test(h.desc)),
      'rol:coder no debe exigir el gate cuantitativo'
    );
  });

  test('skill rol:architect SIN Gate de Calidad Medible NO genera hallazgo', () => {
    limpiar();
    crearSkillDePrueba(frontmatterBase('architect'));
    const r = runValidate();
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find(x => x.nombre === NOMBRE_SKILL);
    assert.ok(
      !resultado.hallazgos.some(h => /gate de calidad medible/i.test(h.desc)),
      'rol:architect no debe exigir el gate cuantitativo'
    );
  });
});
