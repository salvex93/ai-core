'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('moa-context-gatherer.js (fan-out MoA en UserPromptSubmit)', () => {
  const SCRIPT = path.join(BIN, 'moa-context-gatherer.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'moa-context-gatherer.js debe existir en .claude/bin/');
  });

  test('sin ambas API keys, sale con 0 sin invocar la red', () => {
    const r = runScript(SCRIPT, [], { GEMINI_API_KEY: '', DEEPSEEK_API_KEY: '' });
    assert.equal(r.status, 0);
  });

  test('sin CLAUDE_USER_PROMPT ni stdin con datos, sale con 0 sin invocar la red', () => {
    // Regresion real: CLAUDE_USER_PROMPT nunca existio como variable de
    // entorno real -- el prompt llega por stdin (prompt). Sin el fix,
    // userPrompt siempre era '' y el guard de "no hay prompt" enmascaraba
    // el bug de raiz (parecia funcionar porque nunca intentaba la red).
    const r = spawnSync('node', [SCRIPT], {
      encoding: 'utf8', cwd: REPO, input: '',
      env: { ...process.env, GEMINI_API_KEY: 'x', DEEPSEEK_API_KEY: 'x' },
    });
    assert.equal(r.status, 0);
  });
});

// ─── moa-context-gatherer.js — validacion de contenido antes de escribir ─────
// Un proveedor puede responder 200 OK con string vacio/whitespace; sin este
// filtro, ese "exito" vacio se escribia igual en moa_context.md, indistinguible
// de un worker que si aporto contenido util. Funciones puras, sin red.
describe('moa-context-gatherer.js — contenidoUtil / construirContenidoMoA', () => {
  const { contenidoUtil, construirContenidoMoA } = require(
    path.join(BIN, 'moa-context-gatherer.js')
  );

  test('contenidoUtil rechaza vacio, whitespace y no-string', () => {
    assert.equal(contenidoUtil(''), false);
    assert.equal(contenidoUtil('   \n\t  '), false);
    assert.equal(contenidoUtil(null), false);
    assert.equal(contenidoUtil(undefined), false);
    assert.equal(contenidoUtil(42), false);
  });

  test('contenidoUtil acepta contenido real', () => {
    assert.equal(contenidoUtil('analisis del contexto: ...'), true);
  });

  test('construirContenidoMoA siempre marca el archivo como contenido no confiable', () => {
    const out = construirContenidoMoA({ resultado: 'contexto real de gemini', fallos: [] });
    assert.match(out, /CONTENIDO EXTERNO NO CONFIABLE/);
    assert.match(out, /regla 11 del ANCLA/);
  });

  test('contenido vacio/whitespace de ambos workers se registra como fallo, nunca se escribe crudo', () => {
    const out = construirContenidoMoA({ resultado: '   ', fallos: [] });
    assert.match(out, /MoA parcial/);
    assert.match(out, /vacio o solo whitespace/);
    assert.doesNotMatch(out, /^\s*<!-- CONTENIDO EXTERNO NO CONFIABLE.*-->\n\s*$/s, 'no debe quedar solo el aviso sin cuerpo util');
  });

  test('conserva los fallos existentes del fan-out y agrega el propio si aplica', () => {
    const out = construirContenidoMoA({ resultado: '', fallos: ['deepseek: timeout tras 8s'] });
    assert.match(out, /deepseek: timeout tras 8s/);
    assert.match(out, /vacio o solo whitespace/);
  });

  test('contenido largo se trunca via truncarOutputProveedor antes de escribirse', () => {
    const largo = 'z'.repeat(10_000);
    const out = construirContenidoMoA({ resultado: largo, fallos: [] });
    assert.ok(out.length < largo.length + 500, 'debe truncar, no concatenar el original completo sin limite');
    assert.match(out, /OUTPUT MOA TRUNCADO/);
  });

  test('contenido corto y valido pasa integro (mas encabezados)', () => {
    const corto = 'resumen breve del repositorio';
    const out = construirContenidoMoA({ resultado: corto, fallos: [] });
    assert.match(out, new RegExp(corto));
    assert.doesNotMatch(out, /MoA parcial/, 'sin fallos no debe aparecer el encabezado de fallos');
  });
});

// ─── health-sync.js — checkSkills / checkDependencies ────────────────────────
