'use strict';

const { test, describe, after } = require('node:test');
const assert  = require('node:assert/strict');
const path    = require('node:path');
const fs      = require('node:fs');
const os      = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN } = require('./_shared');

// Directorios de lock aislados por test (nunca el tmpdir real compartido) --
// evita que un guard que persiste estado en disco (bypass, cuarentena, lock
// de subagente) contamine sesiones reales concurrentes en la misma maquina.
const dirsTemporales = [];
function nuevoDirTemporal(prefijo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefijo}-`));
  dirsTemporales.push(dir);
  return dir;
}
after(() => {
  for (const dir of dirsTemporales) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});
describe('sandboxing de hooks propios — Node.js Permission Model (smoke test) — subagentes y rutas', () => {

  test('subagent-guard.js CON permisos: permite un spawn normal dentro del limite de paralelismo', () => {
    const lockDir = nuevoDirTemporal('subagent-lock-test');
    const evento = JSON.stringify({ tool_input: { subagent_type: 'code-reviewer' }, session_id: 's1', prompt_id: 'p1' });
    const dirBin = path.join(BIN, '*');
    const dirLock = path.join(lockDir, '**');

    const r = spawnSync('node', [
      '--permission',
      `--allow-fs-read=${dirBin}`,
      `--allow-fs-read=${dirLock}`,
      `--allow-fs-write=${dirLock}`,
      path.join(BIN, 'subagent-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO, env: { ...process.env, AI_CORE_SUBAGENT_LOCK_DIR: lockDir } });

    assert.equal(r.status, 0, 'un spawn normal, dentro del limite de paralelismo y sin recursion, debe pasar');
  });

  test('subagent-guard.js SIN ningun permiso: falla de forma controlada (EPERM), no silenciosa', () => {
    const evento = JSON.stringify({ tool_input: { subagent_type: 'code-reviewer' } });

    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'subagent-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.notEqual(r.status, 0, 'sin permiso de lectura, el hook no debe poder correr silenciosamente con exit 0');
    assert.notEqual(r.status, 2, 'sin el permiso que su propio require necesita, el fallo debe ser por EPERM, no el bloqueo normal del guard');
    assert.match(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/);
  });

  test('tool-repeat-guard.js CON permisos: permite una tool call normal sin historial de repeticion', () => {
    const stateDir = nuevoDirTemporal('tool-repeat-test');
    const evento = JSON.stringify({ session_id: 's1', tool_name: 'Bash', tool_input: { command: 'ls' } });
    const dirBin = path.join(BIN, '*');
    const dirState = path.join(stateDir, '**');

    const r = spawnSync('node', [
      '--permission',
      `--allow-fs-read=${dirBin}`,
      `--allow-fs-read=${dirState}`,
      `--allow-fs-write=${dirState}`,
      path.join(BIN, 'tool-repeat-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO, env: { ...process.env, AI_CORE_TOOL_REPEAT_DIR: stateDir } });

    assert.equal(r.status, 0, 'una tool call sin historial previo de repeticion debe pasar');
  });

  test('tool-repeat-guard.js SIN ningun permiso: falla de forma controlada (EPERM), no silenciosa', () => {
    const evento = JSON.stringify({ session_id: 's1', tool_name: 'Bash', tool_input: { command: 'ls' } });

    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'tool-repeat-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.notEqual(r.status, 0, 'sin permiso de lectura, el hook no debe poder correr silenciosamente con exit 0');
    assert.notEqual(r.status, 2, 'sin el permiso que su propio require necesita, el fallo debe ser por EPERM, no el bloqueo normal del guard');
    assert.match(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/);
  });

  test('subagent-budget-guard.js CON permisos: permite una llamada de subagente sin historial previo', () => {
    const stateDir = nuevoDirTemporal('subagent-budget-test');
    const evento = JSON.stringify({ session_id: 's1', agent_type: 'general-purpose', tool_name: 'Bash', tool_input: { command: 'ls' } });
    const dirBin = path.join(BIN, '*');
    const dirState = path.join(stateDir, '**');

    const r = spawnSync('node', [
      '--permission',
      `--allow-fs-read=${dirBin}`,
      `--allow-fs-read=${dirState}`,
      `--allow-fs-write=${dirState}`,
      path.join(BIN, 'subagent-budget-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO, env: { ...process.env, AI_CORE_BUDGET_DIR: stateDir } });

    assert.equal(r.status, 0, 'una llamada de subagente sin historial previo debe pasar');
  });

  test('subagent-budget-guard.js SIN ningun permiso: falla de forma controlada (EPERM), no silenciosa', () => {
    const evento = JSON.stringify({ session_id: 's1', agent_type: 'general-purpose', tool_name: 'Bash', tool_input: { command: 'ls' } });

    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'subagent-budget-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.notEqual(r.status, 0, 'sin permiso de lectura, el hook no debe poder correr silenciosamente con exit 0');
    assert.notEqual(r.status, 2, 'sin el permiso que su propio require necesita, el fallo debe ser por EPERM, no el bloqueo normal del guard');
    assert.match(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/);
  });

  test('loop-alternante-guard.js CON permisos: permite una tool call de subagente sin historial previo', () => {
    const stateDir = nuevoDirTemporal('loop-alternante-test');
    const evento = JSON.stringify({ session_id: 's1', agent_type: 'general-purpose', tool_name: 'Read', tool_input: { file_path: 'x.js' } });
    const dirBin = path.join(BIN, '*');
    const dirState = path.join(stateDir, '**');

    const r = spawnSync('node', [
      '--permission',
      `--allow-fs-read=${dirBin}`,
      `--allow-fs-read=${dirState}`,
      `--allow-fs-write=${dirState}`,
      path.join(BIN, 'loop-alternante-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO, env: { ...process.env, AI_CORE_ALTERNANTE_DIR: stateDir } });

    assert.equal(r.status, 0, 'una tool call de subagente sin historial previo debe pasar');
  });

  test('loop-alternante-guard.js SIN ningun permiso: falla de forma controlada (EPERM), no silenciosa', () => {
    const evento = JSON.stringify({ session_id: 's1', agent_type: 'general-purpose', tool_name: 'Read', tool_input: { file_path: 'x.js' } });

    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'loop-alternante-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.notEqual(r.status, 0, 'sin permiso de lectura, el hook no debe poder correr silenciosamente con exit 0');
    assert.notEqual(r.status, 2, 'sin el permiso que su propio require necesita, el fallo debe ser por EPERM, no el bloqueo normal del guard');
    assert.match(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/);
  });

  test('web-search-guard.js CON permisos: bloquea WebSearch cuando GEMINI_API_KEY esta disponible', () => {
    const evento = JSON.stringify({ tool_name: 'WebSearch', tool_input: { query: 'algo' } });
    const dirBin = path.join(BIN, '*');
    const dirRepo = path.join(REPO, '**');
    const dirTmp = path.join(require('node:os').tmpdir(), '*');

    const r = spawnSync('node', [
      '--permission',
      `--allow-fs-read=${dirBin}`,
      `--allow-fs-read=${dirRepo}`,
      `--allow-fs-write=${dirRepo}`,
      `--allow-fs-write=${dirTmp}`,
      path.join(BIN, 'web-search-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO, env: { ...process.env, GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'fake-key-para-smoke-test' } });

    assert.equal(r.status, 0, 'permissionDecision:deny exige exit 0, no exit 2');
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  });

  test('web-search-guard.js SIN ningun permiso: falla de forma controlada (EPERM), no silenciosa', () => {
    const evento = JSON.stringify({ tool_name: 'WebSearch', tool_input: { query: 'algo' } });

    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'web-search-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.notEqual(r.status, 0, 'sin permiso de lectura, el hook no debe poder correr silenciosamente con exit 0');
    assert.notEqual(r.status, 2, 'sin el permiso que su propio require necesita, el fallo debe ser por EPERM, no el bloqueo normal del guard');
    assert.match(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/);
  });

  test('agent-paths-guard.js CON permisos: corre y deja pasar una ruta sin paths_allow declarado (retrocompatible)', () => {
    // Requiere lectura de .claude/bin (sus propios requires: hook-stdin,
    // agent-frontmatter, permission-decision, normalizar-texto) ADEMAS de
    // .claude/agents (el frontmatter del agente que evalua).
    const evento = JSON.stringify({ agent_type: 'code-reviewer', tool_name: 'Write', tool_input: { file_path: 'cualquier/ruta.js' } });
    const dirBin = path.join(BIN, '*');
    const dirAgents = path.join(REPO, '.claude', 'agents', '*');

    const r = spawnSync('node', [
      '--permission',
      `--allow-fs-read=${dirBin}`,
      `--allow-fs-read=${dirAgents}`,
      path.join(BIN, 'agent-paths-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.equal(r.status, 0, 'sin paths_allow declarado en el agente, el guard no debe restringir (retrocompatible)');
  });

  test('agent-paths-guard.js SIN ningun permiso: falla de forma controlada (EPERM), no silenciosa', () => {
    const evento = JSON.stringify({ agent_type: 'code-reviewer', tool_name: 'Write', tool_input: { file_path: 'cualquier/ruta.js' } });

    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'agent-paths-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.notEqual(r.status, 0, 'sin permiso de lectura, el hook no debe poder correr silenciosamente con exit 0');
    assert.match(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/);
  });
});
