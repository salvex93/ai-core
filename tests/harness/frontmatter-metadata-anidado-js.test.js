'use strict';
/**
 * G5: origin/version/last_updated/rol (skills) y origin/version/last_updated
 * (agentes) migran de campos top-level del frontmatter a un mapa anidado
 * `metadata:` -- spec agentskills.io define metadata como el lugar para
 * campos propios del proyecto. Cubre validate-globals.js, validate-agents.js,
 * audit-market.js y AgentRoles.js, los 4 lectores de estos campos.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, runScript } = require('./_shared');
const { extraerRolDeclarado } = require('../../scripts/services/AgentRoles');

const NOMBRE_SKILL = `zz-test-metadata-anidado-${process.pid}`;
const TEST_SKILL_DIR = path.join(SKILLS, NOMBRE_SKILL);
const NOMBRE_AGENTE = `zz-test-metadata-anidado-agente-${process.pid}`;
const TEST_AGENT = path.join(REPO, '.claude', 'agents', `${NOMBRE_AGENTE}.md`);

function limpiar() {
  fs.rmSync(TEST_SKILL_DIR, { recursive: true, force: true });
  fs.rmSync(TEST_AGENT, { force: true });
}

after(limpiar);

describe('AgentRoles.extraerRolDeclarado — metadata anidada', () => {
  test('lee rol desde metadata.rol anidado', () => {
    const contenido = ['---', 'name: x', 'metadata:', '  rol: auditor', '---', ''].join('\n');
    assert.equal(extraerRolDeclarado(contenido), 'auditor');
  });

  test('retorna null si metadata no declara rol', () => {
    const contenido = ['---', 'name: x', 'metadata:', '  origin: ai-core', '---', ''].join('\n');
    assert.equal(extraerRolDeclarado(contenido), null);
  });
});

describe('validate-globals.js — metadata anidada', () => {
  const SCRIPT = path.join(BIN, 'validate-globals.js');

  function crearSkillDePrueba(hoy) {
    fs.mkdirSync(TEST_SKILL_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_SKILL_DIR, 'SKILL.md'), [
      '---',
      `name: ${NOMBRE_SKILL}`,
      'description: skill de prueba para test unitario, no usar en produccion.',
      'metadata:',
      '  origin: ai-core',
      '  version: 1.0.0',
      `  last_updated: ${hoy}`,
      '  rol: coder',
      '---',
      '# Skill de prueba',
      '',
      '## Cuando Activar Este Perfil',
      'x',
      '## Primera Accion al Activar',
      'x',
      '## Directiva de Interrupcion',
      'x',
      '## ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN',
      'x',
      '## Restricciones del Perfil',
      'Reglas de sesion activas: CLAUDE.md > este skill.',
    ].join('\n'), 'utf8');
  }

  function runValidate() {
    return spawnSync('node', [SCRIPT, '--json'], { encoding: 'utf8', cwd: REPO, maxBuffer: 10 * 1024 * 1024 });
  }

  test('origin/version/last_updated/rol bajo metadata: no generan hallazgos de "falta campo"', () => {
    limpiar();
    crearSkillDePrueba(new Date().toISOString().slice(0, 10));
    const r = runValidate();
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find((x) => x.nombre === NOMBRE_SKILL);
    assert.ok(resultado, 'debe auditar el skill de prueba');
    const descs = resultado.hallazgos.map((h) => h.desc);
    assert.ok(!descs.some((d) => d.includes('falta "origin:"')), descs.join(' | '));
    assert.ok(!descs.some((d) => d.includes('falta "version:"')), descs.join(' | '));
    assert.ok(!descs.some((d) => d.includes('falta "last_updated:"')), descs.join(' | '));
    assert.ok(!descs.some((d) => d.includes('falta "rol:"')), descs.join(' | '));
  });
});

describe('audit-market.js — metadata anidada', () => {
  const SCRIPT = path.join(BIN, 'audit-market.js');

  test('lee last_updated/version desde metadata anidada', () => {
    limpiar();
    fs.mkdirSync(TEST_SKILL_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_SKILL_DIR, 'SKILL.md'), [
      '---',
      `name: ${NOMBRE_SKILL}`,
      'metadata:',
      '  version: 2.0.0',
      '  last_updated: 2026-01-01',
      '---',
      '# x',
    ].join('\n'), 'utf8');

    const r = spawnSync('node', [SCRIPT, '--json', '--skill', NOMBRE_SKILL], { encoding: 'utf8', cwd: REPO, maxBuffer: 10 * 1024 * 1024 });
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find((x) => x.skill === NOMBRE_SKILL);
    assert.ok(resultado, 'debe auditar el skill de prueba');
    assert.notEqual(resultado.status, 'SIN_FRONTMATTER', 'debe leer last_updated desde metadata anidada');
  });
});

describe('validate-agents.js — metadata anidada', () => {
  const SCRIPT = path.join(BIN, 'validate-agents.js');

  function crearAgenteDePrueba(hoy) {
    fs.writeFileSync(TEST_AGENT, [
      '---',
      `name: ${NOMBRE_AGENTE}`,
      'description: agente de prueba para test unitario, no usar en produccion.',
      'metadata:',
      '  origin: ai-core',
      '  version: 1.0.0',
      `  last_updated: ${hoy}`,
      'provider: any',
      'model: sonnet',
      'loop: false',
      'tools: [Read]',
      '---',
      'Reglas de sesion activas: CLAUDE.md > este agente.',
    ].join('\n'), 'utf8');
  }

  test('origin/version/last_updated bajo metadata: no generan hallazgos de "falta campo"', () => {
    limpiar();
    crearAgenteDePrueba(new Date().toISOString().slice(0, 10));
    const r = spawnSync('node', [SCRIPT, '--json'], { encoding: 'utf8', cwd: REPO, maxBuffer: 10 * 1024 * 1024 });
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find((x) => x.nombre === NOMBRE_AGENTE);
    assert.ok(resultado, 'debe auditar el agente de prueba');
    const descs = resultado.hallazgos.map((h) => h.desc);
    assert.ok(!descs.some((d) => d.includes('falta "origin:"')), descs.join(' | '));
    assert.ok(!descs.some((d) => d.includes('falta "version:"')), descs.join(' | '));
    assert.ok(!descs.some((d) => d.includes('falta "last_updated:"')), descs.join(' | '));
  });
});
