'use strict';

const { test, describe } = require('node:test');
const assert  = require('node:assert/strict');
const path    = require('node:path');
const os      = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN } = require('./_shared');

/**
 * Test de humo del sandboxing de hooks propios (Node.js Permission Model).
 * Solo aplica en POSIX -- ver nota de SANDBOX en hooks-definition.js: en
 * Windows el mecanismo no se activa aun (comportamiento de glob de shell no
 * verificado con la misma confianza), asi que este archivo no tiene nada que
 * probar ahi y se salta explicitamente en vez de fallar por una premisa que
 * nunca aplico en esa plataforma.
 */
const ES_POSIX = process.platform !== 'win32';

describe('sandboxing de hooks propios — Node.js Permission Model (smoke test)', { skip: !ES_POSIX && 'solo aplica en POSIX -- ver hooks-definition.js' }, () => {
  test('code-exec-guard.js con --allow-fs-read del directorio correcto: corre y bloquea normalmente', () => {
    // RIESGO_EJECUCION_JS exige un caracter antes de "eval(" que no sea /'"
    // (para no marcar falsos positivos en imports/strings) -- "eval(x)" al
    // inicio absoluto del string no matchea por diseño del propio patron.
    const evento = JSON.stringify({ tool_input: { file_path: 'src/algo.js', content: 'const y = eval(x);' } });
    const dirBin = path.join(BIN, '*');

    const r = spawnSync('node', [
      '--permission',
      `--allow-fs-read=${dirBin}`,
      path.join(BIN, 'code-exec-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.equal(r.status, 2, 'con el permiso correcto, el guard debe bloquear como en produccion (exit 2), no fallar por EPERM');
    assert.match(r.stderr, /CODE-EXEC-GUARD/);
  });

  test('code-exec-guard.js SIN --allow-fs-read: falla de forma controlada (EPERM), no silenciosa', () => {
    const evento = JSON.stringify({ tool_input: { file_path: 'src/algo.js', content: 'const y = eval(x);' } });

    // --permission sin ningun --allow-fs-read: todo acceso a filesystem queda
    // denegado por defecto (comportamiento documentado de Node.js Permission
    // Model). El propio require() de las libs internas del hook debe fallar.
    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'code-exec-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.notEqual(r.status, 0, 'sin permiso de lectura, el hook no debe poder correr silenciosamente con exit 0');
    assert.notEqual(r.status, 2, 'el fallo debe ser por permiso denegado (EPERM), no el bloqueo normal del guard (exit 2)');
    assert.match(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/);
  });

  test('destructive-op-guard.js CON --allow-fs-read: bloquea el patron destructivo normalmente', () => {
    // Regresion real (2026-08-14): este test asumia que destructive-op-guard.js
    // no necesitaba ningun --allow-fs-read porque solo leia stdin (un fd ya
    // abierto, sin permiso de filesystem). Desde que el guard usa
    // require('./lib/break-glass') para el mecanismo de excepcion auditable,
    // SI necesita leer .claude/bin/lib/break-glass.js -- sin el permiso, el
    // require fallaba con ERR_ACCESS_DENIED (exit 1, no exit 2), y Claude
    // Code trata cualquier exit distinto de 2 como no bloqueante. Este mismo
    // gap rompio CI real en ubuntu-latest/macos-latest (el describe se salta
    // en Windows, por eso nunca se detecto localmente antes de pushear).
    const evento = JSON.stringify({ tool_input: { command: 'rm -rf /tmp/algo' } });
    const dirBin = path.join(BIN, '*');

    const r = spawnSync('node', [
      '--permission',
      `--allow-fs-read=${dirBin}`,
      path.join(BIN, 'destructive-op-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.equal(r.status, 2, 'debe bloquear el patron destructivo con el permiso de lectura que su require necesita');
    assert.match(r.stderr, /DESTRUCTIVE-OP-GUARD/);
  });

  test('destructive-op-guard.js SIN --allow-fs-read: falla de forma controlada (EPERM), no silenciosa', () => {
    // Documenta el comportamiento real de fallo -- si algun dia el require
    // de lib/break-glass.js se elimina o se vuelve opcional, este test debe
    // fallar para forzar la actualizacion del smoke test de arriba tambien.
    const evento = JSON.stringify({ tool_input: { command: 'rm -rf /tmp/algo' } });

    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'destructive-op-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.notEqual(r.status, 0, 'sin permiso de lectura, el hook no debe poder correr silenciosamente con exit 0');
    assert.notEqual(r.status, 2, 'sin el permiso que su propio require necesita, el fallo debe ser por EPERM, no el bloqueo normal del guard');
    assert.match(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/);
  });

  test('secrets-guard.js sin --allow-fs-write: el guard sigue bloqueando (emitirReporte es best-effort, nunca lanza)', () => {
    const evento = JSON.stringify({ prompt_text: 'mi token es ghp_1234567890abcdefghij1234567890abcdef' });
    const dirBin = path.join(BIN, '*');

    const r = spawnSync('node', [
      '--permission',
      `--allow-fs-read=${dirBin}`,
      // Deliberadamente SIN --allow-fs-write: guard-report.js debe tragarse
      // el EPERM de fs.appendFileSync (try/catch documentado como best-effort)
      // sin que eso tumbe el guard ni cambie su exit code real.
      path.join(BIN, 'secrets-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO, env: { ...process.env, CLAUDE_USER_PROMPT: '' } });

    assert.equal(r.status, 2, 'el bloqueo del guard no debe depender de si el reporte de telemetria logro escribirse');
    assert.match(r.stderr, /secrets-guard.*BLOQUEADO/);
  });

  test('secrets-guard.js SIN --allow-fs-read: falla de forma controlada (EPERM), no silenciosa', () => {
    // Mismo gap que destructive-op-guard.js: secrets-guard.js usa
    // require('./lib/break-glass') desde esta sesion -- sin permiso de
    // lectura, ese require debe fallar con EPERM, no dejar pasar el prompt
    // con la credencial sin bloquear.
    const evento = JSON.stringify({ prompt_text: 'mi token es ghp_1234567890abcdefghij1234567890abcdef' });

    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'secrets-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO, env: { ...process.env, CLAUDE_USER_PROMPT: '' } });

    assert.notEqual(r.status, 0, 'sin permiso de lectura, el hook no debe poder correr silenciosamente con exit 0');
    assert.notEqual(r.status, 2, 'sin el permiso que su propio require necesita, el fallo debe ser por EPERM, no el bloqueo normal del guard');
    assert.match(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/);
  });

  test('mutating-action-guard.js CON --allow-fs-read: bloquea una accion mutante de subagente normalmente', () => {
    const evento = JSON.stringify({ agent_type: 'test', tool_name: 'mcp__pmo__crear_tarea', tool_input: {} });
    const dirBin = path.join(BIN, '*');

    const r = spawnSync('node', [
      '--permission',
      `--allow-fs-read=${dirBin}`,
      path.join(BIN, 'mutating-action-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.equal(r.status, 2, 'debe bloquear la accion mutante con el permiso de lectura que su require necesita');
    assert.match(r.stderr, /MUTATING-ACTION-GUARD/);
  });

  test('mutating-action-guard.js SIN --allow-fs-read: falla de forma controlada (EPERM), no silenciosa', () => {
    const evento = JSON.stringify({ agent_type: 'test', tool_name: 'mcp__pmo__crear_tarea', tool_input: {} });

    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'mutating-action-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.notEqual(r.status, 0, 'sin permiso de lectura, el hook no debe poder correr silenciosamente con exit 0');
    assert.notEqual(r.status, 2, 'sin el permiso que su propio require necesita, el fallo debe ser por EPERM, no el bloqueo normal del guard');
    assert.match(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/);
  });
});
