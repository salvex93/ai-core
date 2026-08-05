'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('issue-reporter.js', () => {
  const SCRIPT = path.join(BIN, 'issue-reporter.js');
  const content = fs.readFileSync(SCRIPT, 'utf8');

  // Labels reales del repo (gh label list --repo salvex93/ai-core). Si esta
  // lista cambia, actualizarla aqui tras confirmar con el comando real —
  // nunca inventar una label nueva sin verificarla contra el repo primero.
  const LABELS_REALES = new Set([
    'bug', 'documentation', 'duplicate', 'enhancement',
    'good first issue', 'help wanted', 'invalid', 'question', 'wontfix',
  ]);

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('openIssue usa execFileSync con array de argumentos, no execSync con template string interpolado', () => {
    // Hallazgo de seguridad real: execSync con un comando de shell construido
    // por interpolacion de string permite inyeccion de comandos si `title`
    // (derivado de evento.tool/evento.error, contenido NO confiable segun
    // CLAUDE.md -- puede venir de un archivo del repo, salida de Gemini o
    // WebFetch) contiene metacaracteres de shell (&, |, &&, ||) que
    // `.replace(/"/g, "'")` no neutraliza. Reproducido: un evento.tool con
    // "a &amp; calc.exe &amp;" ejecuta un comando adicional en cmd.exe incluso
    // dentro de comillas dobles. Fix: execFileSync('gh', [...args]) sin
    // shell -- mismo patron ya usado en syntax-check.js.
    assert.doesNotMatch(
      content,
      /execSync\(\s*`gh issue create/,
      'openIssue no debe construir el comando gh via execSync + template string interpolado'
    );
    assert.match(
      content,
      /execFileSync\(\s*'gh'/,
      'openIssue debe invocar gh via execFileSync con array de argumentos'
    );
  });

  test('todas las labels en ISSUE_META existen en el repo real', () => {
    // gh issue create falla el comando COMPLETO si una sola label no existe,
    // dejando el evento sin marcar reported=true de forma silenciosa. Este
    // test previene reintroducir una label inventada (ej. "bug,hooks").
    const match = content.match(/const ISSUE_META = Object\.freeze\(\{([\s\S]*?)\}\);/);
    assert.ok(match, 'debe encontrar la definicion de ISSUE_META en el archivo');

    const labelMatches = [...match[1].matchAll(/label:\s*'([^']+)'/g)];
    assert.ok(labelMatches.length > 0, 'debe encontrar al menos una label declarada');

    for (const [, labelValue] of labelMatches) {
      for (const label of labelValue.split(',')) {
        assert.ok(
          LABELS_REALES.has(label.trim()),
          `label "${label.trim()}" no existe en el repo — verificar con "gh label list --repo salvex93/ai-core"`
        );
      }
    }
  });

});

// ─── setup-settings.js ───────────────────────────────────────────────────────
