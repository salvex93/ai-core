'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('dev-loop skill', () => {
  const SKILL_PATH = path.join(SKILLS, 'dev-loop', 'SKILL.md');

  test('el archivo SKILL.md existe', () => {
    assert.ok(fs.existsSync(SKILL_PATH), 'dev-loop/SKILL.md debe existir en .claude/skills/');
  });

  test('el frontmatter tiene name, version, origin y last_updated', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('name: dev-loop'),        'debe tener name: dev-loop');
    assert.ok(/version:\s*\d+\.\d+\.\d+/.test(content), 'debe tener version semantica');
    assert.ok(content.includes('origin: ai-core'),       'debe tener origin: ai-core');
    assert.ok(/last_updated:\s*\d{4}-\d{2}-\d{2}/.test(content), 'debe tener last_updated');
  });

  test('contiene las 5 fases obligatorias', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    const fases = ['SPEC', 'DESIGN', 'PLAN', 'BUILD', 'REVIEW'];
    for (const fase of fases) {
      assert.ok(content.includes(`Fase.*${fase}`) || content.includes(`— ${fase}`),
        `debe contener la fase ${fase}`);
    }
  });

  test('contiene secciones Cuando Activar y Cuando NO Activar', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('Cuando Activar Este Perfil'),    'debe tener seccion Cuando Activar');
    assert.ok(content.includes('Cuando NO Activar Este Perfil'), 'debe tener seccion Cuando NO Activar');
  });

  test('contiene referencia inmutable a CLAUDE.md', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('CLAUDE.md > este skill'), 'debe tener referencia inmutable a CLAUDE.md');
  });

  test('contiene Directiva de Interrupcion con ALERTA_ARQUITECTONICA', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('ALERTA_ARQUITECTONICA'), 'debe tener directiva de interrupcion');
  });

  test('define formato de artefacto para cada fase', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('SPEC:'),   'debe definir formato de artefacto SPEC');
    assert.ok(content.includes('DESIGN:'), 'debe definir formato de artefacto DESIGN');
    assert.ok(content.includes('PLAN:'),   'debe definir formato de artefacto PLAN');
    assert.ok(content.includes('REVIEW:'), 'debe definir formato de artefacto REVIEW');
  });

  test('define telemetria de ciclo por fase', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('[DEV-LOOP'), 'debe definir telemetria de ciclo con prefijo DEV-LOOP');
  });

  test('no contiene emojis pictograficos', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    const EMOJI = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{1FA00}-\u{1FAFF}]/u;
    assert.ok(!EMOJI.test(content), 'el skill no debe contener emojis');
  });
});
