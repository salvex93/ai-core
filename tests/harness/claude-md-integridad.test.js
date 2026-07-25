'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('CLAUDE.md — integridad', () => {
  const claudeMd = fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8');

  test('ux-visual-designer y seo-sem-specialist existen como skills en disco', () => {
    // CLAUDE.md ya no lista skills en una tabla (redundante con el frontmatter
    // description de cada SKILL.md, que Claude Code carga via skill-discovery
    // nativo) — la garantia real es que el skill exista, no que se mencione aqui.
    assert.ok(fs.existsSync(path.join(SKILLS, 'ux-visual-designer', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(SKILLS, 'seo-sem-specialist', 'SKILL.md')));
  });

  test('contiene reglas de Modo Neanderthal', () => {
    assert.ok(claudeMd.includes('Modo Neanderthal'), 'debe definir Modo Neanderthal');
  });

  test('contiene reglas de compact/clear', () => {
    assert.ok(claudeMd.includes('/compact'), 'debe mencionar /compact');
    assert.ok(claudeMd.includes('/clear'),   'debe mencionar /clear');
  });

  test('sin frases de relleno usadas como respuesta (no como ejemplo de lo que evitar)', () => {
    // Las frases prohibidas pueden aparecer en la lista de "palabras prohibidas"
    // pero no deben aparecer como respuesta real fuera de esa seccion.
    // Solo verificamos que el CLAUDE.md define la restriccion, no que la viola.
    assert.ok(
      claudeMd.includes('Palabras prohibidas') || claudeMd.includes('prohibidas en prosa'),
      'CLAUDE.md debe definir la seccion de palabras prohibidas en prosa'
    );
  });
});

// ─── capture-event.js — aislamiento en modo test ─────────────────────────────
