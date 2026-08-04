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
    const evento = JSON.stringify({ tool_input: { file_path: 'src/algo.js', content: 'eval(x)' } });
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
    const evento = JSON.stringify({ tool_input: { file_path: 'src/algo.js', content: 'eval(x)' } });

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

  test('destructive-op-guard.js no requiere --allow-fs-read (solo lee stdin, un fd ya abierto)', () => {
    const evento = JSON.stringify({ tool_input: { command: 'rm -rf /tmp/algo' } });

    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'destructive-op-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.equal(r.status, 2, 'debe bloquear el patron destructivo sin necesitar ningun --allow-fs-*');
    assert.match(r.stderr, /DESTRUCTIVE-OP-GUARD/);
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
});
