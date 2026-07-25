'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('skills — conformidad estructural', () => {
  const skillDirs = fs.readdirSync(SKILLS, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  test(`existen ${skillDirs.length} directorios de skills`, () => {
    assert.ok(skillDirs.length >= 30, `debe haber al menos 30 skills, hay ${skillDirs.length}`);
  });

  for (const skill of skillDirs) {
    const skillFile = path.join(SKILLS, skill, 'SKILL.md');

    test(`${skill}: SKILL.md existe`, () => {
      assert.ok(fs.existsSync(skillFile), `${skill}/SKILL.md debe existir`);
    });

    test(`${skill}: tiene sección Directiva de Interrupcion`, () => {
      const content = fs.readFileSync(skillFile, 'utf8');
      assert.ok(
        content.includes('Directiva de Interrupcion'),
        `${skill} debe tener sección "Directiva de Interrupcion"`
      );
    });

    test(`${skill}: tiene sección Primera Accion al Activar`, () => {
      const content = fs.readFileSync(skillFile, 'utf8');
      assert.ok(
        content.includes('Primera Accion al Activar'),
        `${skill} debe tener sección "Primera Accion al Activar"`
      );
    });

    test(`${skill}: tiene sección Restricciones del Perfil`, () => {
      const content = fs.readFileSync(skillFile, 'utf8');
      assert.ok(
        content.includes('Restricciones del Perfil'),
        `${skill} debe tener sección "Restricciones del Perfil"`
      );
    });

    test(`${skill}: tiene referencia inmutable a CLAUDE.md (no copia)`, () => {
      const content = fs.readFileSync(skillFile, 'utf8');
      // El nuevo modelo: referencia en lugar de copia
      assert.ok(
        content.includes('Reglas de sesion activas: CLAUDE.md > este skill.'),
        `${skill} debe tener la referencia inmutable "Reglas de sesion activas: CLAUDE.md > este skill."`
      );
      // No debe tener la copia del bloque (eso seria una regresion al modelo anterior)
      assert.ok(
        !content.includes('Protocolo de Sesion (heredado de CLAUDE.md'),
        `${skill} NO debe copiar el bloque PROTOCOLO DE SESION — debe referenciar`
      );
    });

    test(`${skill}: CLAUDE.md define compact/clear (fuente unica)`, () => {
      // Las reglas de compact/clear viven en CLAUDE.md, no se replican en cada skill.
      // Este test verifica que CLAUDE.md las tiene (se corre una vez, no por skill).
      const claudeContent = fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8');
      assert.ok(
        claudeContent.includes('/compact') && claudeContent.includes('/clear'),
        'CLAUDE.md debe definir las reglas de /compact y /clear'
      );
    });

    test(`${skill}: frontmatter tiene name, origin y version`, () => {
      const content = fs.readFileSync(skillFile, 'utf8');
      assert.ok(content.match(/^name:/m),    `${skill} debe tener "name:" en frontmatter`);
      assert.ok(content.match(/^origin:/m),  `${skill} debe tener "origin:" en frontmatter`);
      assert.ok(content.match(/^version:/m), `${skill} debe tener "version:" en frontmatter`);
    });

    test(`${skill}: sin emojis pictograficos en el contenido`, () => {
      const content = fs.readFileSync(skillFile, 'utf8');
      // Solo pictogramas reales — excluye digitos y ASCII que Unicode clasifica como Emoji
      const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{1FA00}-\u{1FAFF}]/u;
      assert.ok(
        !emojiPattern.test(content),
        `${skill} no debe contener emojis pictograficos`
      );
    });
  }
});

// ─── validate-globals.js — conformidad agentskills.io ────────────────────────
