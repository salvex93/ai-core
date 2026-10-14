'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('guard-read.js', () => {
  const GUARD = path.join(BIN, 'guard-read.js');

  test('sale con codigo 0 si no se pasa argumento', () => {
    const r = runScript(GUARD, []);
    assert.equal(r.status, 0, 'debe salir sin error cuando no hay argumento');
  });

  test('sale con codigo 0 para extension no vigilada (.png)', () => {
    const f = tmpFile('binary content');
    const pngPath = f.replace('.tmp', '.png');
    fs.renameSync(f, pngPath);
    const r = runScript(GUARD, [pngPath]);
    fs.unlinkSync(pngPath);
    assert.equal(r.status, 0, 'debe ignorar extensiones no de texto');
  });

  test('sale con codigo 0 para archivo .js por debajo del limite', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const f = tmpFile(lines).replace('.tmp', '.js');
    const fjs = f.endsWith('.js') ? f : f + '.js';
    fs.writeFileSync(fjs, lines);
    const r = runScript(GUARD, [fjs]);
    fs.unlinkSync(fjs);
    assert.equal(r.status, 0, 'debe permitir archivos bajo el limite de 200 lineas');
  });

  // El deny por tamaño solo se emite si Gemini esta disponible (ver guard-read.js
  // y test de fallback mas abajo). En CI no hay .env real -- estos tests pasan
  // un .env temporal con GEMINI_API_KEY para ejercitar el camino de bloqueo sin
  // depender del entorno de la maquina que corre la suite.
  const conGeminiEnv = (extra = {}) => {
    const envConKey = tmpFile('GEMINI_API_KEY=fake-key-para-test');
    return { env: { AI_CORE_ENV_PATH: envConKey, GEMINI_API_KEY: '', ...extra }, cleanup: () => fs.unlinkSync(envConKey) };
  };

  test('sale con codigo 0 y emite permissionDecision:deny en stdout para .js con mas de 200 lineas', () => {
    // Friccion operativa (limite de tokens), no riesgo de seguridad -- usa
    // permissionDecision:"deny" (exit 0 + razon en JSON) en vez de exit 2,
    // siguiendo la recomendacion oficial de Anthropic para este caso
    // (code.claude.com/docs/en/hooks): Claude ve el motivo y puede reformular
    // (ej. usar Gemini) sin que el humano tenga que aprobar nada.
    const lines = Array.from({ length: 250 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const fjs = path.join(os.tmpdir(), `guard-test-${Date.now()}.js`);
    fs.writeFileSync(fjs, lines);
    const { env, cleanup } = conGeminiEnv();
    const r = runScript(GUARD, [fjs], env);
    fs.unlinkSync(fjs);
    cleanup();
    assert.equal(r.status, 0, 'permissionDecision:deny exige exit 0, no exit 2');
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /200/);
  });

  test('sale con codigo 0 para archivo inexistente', () => {
    const r = runScript(GUARD, ['/ruta/inexistente/archivo.js']);
    assert.equal(r.status, 0, 'debe no fallar en archivos inexistentes');
  });

  // ─── Fixes red-team 2026-08-15 ───────────────────────────────────────────

  test('extensiones ampliadas (.jsx, .tsx, .mjs, .rs) SI disparan deny con mas de 200 lineas reales', () => {
    const lines = Array.from({ length: 250 }, (_, i) => `const x${i} = ${i};`).join('\n');
    for (const ext of ['.jsx', '.tsx', '.mjs', '.rs']) {
      const f = path.join(os.tmpdir(), `guard-test-ext-${Date.now()}${ext}`);
      fs.writeFileSync(f, lines);
      const { env, cleanup } = conGeminiEnv();
      const r = runScript(GUARD, [f], env);
      fs.unlinkSync(f);
      cleanup();
      assert.equal(r.status, 0, `${ext}: exit debe ser 0`);
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny', `${ext} debia denegar, antes evadia la whitelist cerrada`);
    }
  });

  test('archivo sin ningun separador de linea real (JSON minificado voluminoso) SI dispara deny por tamaño', () => {
    const contenido = JSON.stringify(Array.from({ length: 5000 }, (_, i) => ({ id: i, valor: `dato${i}` })));
    const f = path.join(os.tmpdir(), `guard-test-minificado-${Date.now()}.json`);
    fs.writeFileSync(f, contenido);
    const { env, cleanup } = conGeminiEnv();
    const r = runScript(GUARD, [f], env);
    fs.unlinkSync(f);
    cleanup();
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny', 'JSON minificado sin \\n real debia denegar por tamaño en bytes');
  });

  test('archivo con line-endings CR puro (sin LF) SI cuenta las lineas reales', () => {
    const lines = Array.from({ length: 250 }, (_, i) => `const x${i} = ${i};`).join('\r');
    const f = path.join(os.tmpdir(), `guard-test-cr-${Date.now()}.txt`);
    fs.writeFileSync(f, lines);
    const { env, cleanup } = conGeminiEnv();
    const r = runScript(GUARD, [f], env);
    fs.unlinkSync(f);
    cleanup();
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny', 'CR puro debia contarse como separador de linea real');
  });

  test('archivo con CRLF real (Windows) cuenta cada linea una sola vez, no duplicada', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `const x${i} = ${i};`).join('\r\n');
    const f = path.join(os.tmpdir(), `guard-test-crlf-ok-${Date.now()}.js`);
    fs.writeFileSync(f, lines);
    const r = runScript(GUARD, [f]);
    fs.unlinkSync(f);
    assert.equal(r.status, 0, 'CRLF de 50 lineas reales no debe superar el limite de 200 (evitar doble conteo de \\r\\n)');
  });

  // ─── Fallback sin Gemini disponible (2026-09-01) ─────────────────────────
  // Bloquear Read para forzar analizar_archivo (Gemini) solo tiene sentido
  // si Gemini esta realmente disponible -- sin GEMINI_API_KEY, el deny deja
  // a Claude sin ninguna forma de leer el archivo (degradacion total, peor
  // que gastar los tokens de Read nativo). Decision explicita del usuario:
  // fallback automatico a permitir en vez de bloqueo estricto.

  test('con mas de 200 lineas pero SIN GEMINI_API_KEY: permite Read en vez de bloquear (degradacion con gracia)', () => {
    const lines = Array.from({ length: 250 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const fjs = path.join(os.tmpdir(), `guard-test-sin-key-${Date.now()}.js`);
    fs.writeFileSync(fjs, lines);
    // .env aislado y vacio -- AI_CORE_ENV_PATH evita que loadEnv() caiga al
    // .env real del repo (que si tiene GEMINI_API_KEY configurada).
    const envVacio = tmpFile('');
    const r = runScript(GUARD, [fjs], { AI_CORE_ENV_PATH: envVacio, GEMINI_API_KEY: '' });
    fs.unlinkSync(fjs);
    fs.unlinkSync(envVacio);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'sin GEMINI_API_KEY no debe emitir permissionDecision:deny -- debe dejar pasar Read nativo');
  });

  // ─── Contrato real de hooks: la ruta llega por stdin (2026-09-21) ────────
  // CLAUDE_TOOL_INPUT_file_path nunca existio en runtime real (issue
  // anthropics/claude-code#9567): el hook recibe argv[2] vacio y la ruta solo
  // esta en tool_input.file_path del JSON de stdin. Sin este fallback el guard
  // pasaba sus tests (que inyectan argv) pero nunca bloqueaba un Read real.

  test('sin argv, lee tool_input.file_path del JSON de stdin y deniega archivo de mas de 200 lineas', () => {
    const lines = Array.from({ length: 250 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const fjs = path.join(os.tmpdir(), `guard-test-stdin-${Date.now()}.js`);
    fs.writeFileSync(fjs, lines);
    const { env, cleanup } = conGeminiEnv();
    const evento = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: fjs } });
    const r = spawnSync('node', [GUARD, ''], { encoding: 'utf8', cwd: REPO, input: evento, env: { ...process.env, AI_CORE_TEST_MODE: '1', ...env } });
    fs.unlinkSync(fjs);
    cleanup();
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  });

  // Un Read con limit <= 200 ya acota los tokens que entran al contexto: es
  // la forma correcta de leer un tramo de un archivo grande (y Edit exige una
  // lectura previa), asi que no se deniega.
  const leerConLimit = (limit) => {
    const lines = Array.from({ length: 250 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const fjs = path.join(os.tmpdir(), `guard-test-limit-${Date.now()}-${limit}.js`);
    fs.writeFileSync(fjs, lines);
    const { env, cleanup } = conGeminiEnv();
    const evento = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: fjs, limit } });
    const r = spawnSync('node', [GUARD, ''], { encoding: 'utf8', cwd: REPO, input: evento, env: { ...process.env, AI_CORE_TEST_MODE: '1', ...env } });
    fs.unlinkSync(fjs);
    cleanup();
    return r;
  };

  test('Read con limit <= 200 sobre archivo grande: permite (lectura acotada)', () => {
    const r = leerConLimit(200);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  });

  test('Read con limit > 200 sobre archivo grande: sigue denegando', () => {
    const r = leerConLimit(500);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
  });

  test('sin argv y con evento de stdin sin file_path: sale 0 sin emitir nada', () => {
    const r = spawnSync('node', [GUARD, ''], { encoding: 'utf8', cwd: REPO, input: '{}' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  });

  test('con mas de 200 lineas y CON GEMINI_API_KEY: sigue bloqueando normalmente', () => {
    const lines = Array.from({ length: 250 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const fjs = path.join(os.tmpdir(), `guard-test-con-key-${Date.now()}.js`);
    fs.writeFileSync(fjs, lines);
    const envConKey = tmpFile('GEMINI_API_KEY=fake-key-para-test');
    const r = runScript(GUARD, [fjs], { AI_CORE_ENV_PATH: envConKey, GEMINI_API_KEY: '' });
    fs.unlinkSync(fjs);
    fs.unlinkSync(envConKey);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny', 'con Gemini disponible, el comportamiento original no cambia');
  });
});

// ─── subagent-guard.js ───────────────────────────────────────────────────────

// ─── generate-map.js / validate-map.js / diff-map-trigger.js ────────────────
// Los tres operan sobre "git ls-files" y "git status" del directorio donde
// corren (process.cwd()) -- se prueban contra un repo git temporal real, no
// mocks, para no tocar ni depender del CONTEXT_MAP.json del repo principal.
