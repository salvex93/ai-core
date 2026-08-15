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

  describe('umbral de 20 eventos pendientes -> ALERTA_ARQUITECTONICA (gap de scaffolding cerrado 2026-08-15)', () => {
    // Hallazgo de auditoria: .claude/agents/issue-tracker.md documentaba
    // "si pending.length supera 20, emitir ALERTA_ARQUITECTONICA" citando
    // este mismo archivo como la fuente del comportamiento -- pero el
    // umbral nunca estaba implementado aqui. El .md describia una
    // salvaguarda que no existia en codigo real.
    function crearColaConNPendientes(n) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-reporter-umbral-'));
      const queuePath = path.join(dir, 'EVENTS_QUEUE.json');
      const eventos = Array.from({ length: n }, (_, i) => ({
        id: `ev-${i}`, type: 'hook_failure', tool: 'test-tool', error: 'error de prueba',
        ts: new Date().toISOString(), reported: false,
      }));
      fs.writeFileSync(queuePath, JSON.stringify(eventos), 'utf8');
      return { dir, queuePath };
    }

    test('con 21 eventos pendientes (> 20) y gh no disponible: emite ALERTA_ARQUITECTONICA en stderr', () => {
      const { dir, queuePath } = crearColaConNPendientes(21);
      // PATH vacio -> "gh" no se resuelve (simula gh no instalado); node se
      // invoca por ruta absoluta (process.execPath) para que spawnSync igual
      // encuentre el binario de node pese al PATH vacio.
      const r = spawnSync(process.execPath, [SCRIPT], {
        encoding: 'utf8',
        env: { ...process.env, AI_CORE_EVENTS_QUEUE_PATH: queuePath, PATH: '' },
      });
      fs.rmSync(dir, { recursive: true, force: true });
      assert.match(r.stderr, /ALERTA_ARQUITECTONICA/, 'debe emitir la alerta cuando la cola supera 20 pendientes sin poder reportar');
      assert.match(r.stderr, /21/, 'debe incluir la cifra exacta de eventos pendientes');
    });

    test('con 5 eventos pendientes (<= 20) y gh no disponible: NO emite ALERTA_ARQUITECTONICA', () => {
      const { dir, queuePath } = crearColaConNPendientes(5);
      const r = spawnSync(process.execPath, [SCRIPT], {
        encoding: 'utf8',
        env: { ...process.env, AI_CORE_EVENTS_QUEUE_PATH: queuePath, PATH: '' },
      });
      fs.rmSync(dir, { recursive: true, force: true });
      assert.doesNotMatch(r.stderr, /ALERTA_ARQUITECTONICA/, 'no debe alertar con una cola pequena, aunque gh no este disponible');
    });
  });

});

// ─── setup-settings.js ───────────────────────────────────────────────────────
