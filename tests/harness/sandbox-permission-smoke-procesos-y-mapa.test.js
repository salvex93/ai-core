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
describe('sandboxing de hooks propios — Node.js Permission Model (smoke test) — procesos y mapa', () => {

  test('bash-verbosity-guard.js CON permisos: bloquea un comando de output masivo sin acotar', () => {
    const evento = JSON.stringify({ tool_input: { command: 'git log' } });
    const dirBin = path.join(BIN, '*');

    const r = spawnSync('node', [
      '--permission',
      `--allow-fs-read=${dirBin}`,
      path.join(BIN, 'bash-verbosity-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.equal(r.status, 2, 'debe bloquear git log sin acotar con el permiso que su require necesita');
    assert.match(r.stderr, /BASH-VERBOSITY-GUARD/);
  });

  test('bash-verbosity-guard.js SIN ningun permiso: falla de forma controlada (EPERM), no silenciosa', () => {
    const evento = JSON.stringify({ tool_input: { command: 'git log' } });

    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'bash-verbosity-guard.js'),
    ], { input: evento, encoding: 'utf8', cwd: REPO });

    assert.notEqual(r.status, 0, 'sin permiso de lectura, el hook no debe poder correr silenciosamente con exit 0');
    assert.notEqual(r.status, 2, 'sin el permiso que su propio require necesita, el fallo debe ser por EPERM, no el bloqueo normal del guard');
    assert.match(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/);
  });

  test('process-guard.js CON permisos (incluye --allow-child-process): ejecuta y propaga el exit code del comando envuelto', () => {
    // process-guard.js en si mismo lanza un child_process (spawnSync) -- a
    // diferencia de los demas guards, necesita --allow-child-process ademas
    // de fs-read/fs-write para el lock. Envuelve "node -e process.exit(0)"
    // como comando de prueba, categoria fuera de CATEGORIAS_BLOQUEO para no
    // acoplar este smoke test al comportamiento real de standards-guard.js.
    const lockDir = nuevoDirTemporal('process-guard-lock-test');
    const dirLock = path.join(lockDir, '**');

    const r = spawnSync('node', [
      '--permission',
      '--allow-child-process',
      `--allow-fs-read=${dirLock}`,
      `--allow-fs-write=${dirLock}`,
      path.join(BIN, 'process-guard.js'),
      'health', 'node', '-e', 'process.exit(0)',
    ], { encoding: 'utf8', cwd: REPO, env: { ...process.env, TMPDIR: lockDir, TEMP: lockDir, TMP: lockDir } });

    assert.equal(r.status, 0, 'debe propagar el exit 0 del comando envuelto con los permisos correctos');
  });

  test('process-guard.js SIN --allow-child-process: falla de forma controlada (EPERM), no silenciosa', () => {
    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'process-guard.js'),
      'health', 'node', '-e', 'process.exit(0)',
    ], { encoding: 'utf8', cwd: REPO });

    assert.notEqual(r.status, 0, 'sin --allow-child-process, el guard no debe poder lanzar el comando envuelto silenciosamente');
    assert.match(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/);
  });

  test('validate-map.js CON permisos (incluye --allow-child-process para git/generate-map): corre sin lanzar EPERM', () => {
    // validate-map.js ejecuta "git ls-files" (execSync) y puede relanzar
    // generate-map.js (execFileSync) -- ambos child_process. Se le da acceso
    // de lectura a todo REPO porque compara CONTEXT_MAP.json contra el
    // arbol real del repo, no solo .claude/bin.
    const dirRepo = path.join(REPO, '**');

    const r = spawnSync('node', [
      '--permission',
      '--allow-child-process',
      `--allow-fs-read=${dirRepo}`,
      `--allow-fs-write=${dirRepo}`,
      path.join(BIN, 'validate-map.js'),
    ], { encoding: 'utf8', cwd: REPO });

    assert.notEqual(r.status, null, 'debe terminar (no colgarse) con los permisos correctos');
    assert.doesNotMatch(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/, 'con permisos completos no debe fallar por EPERM');
  });

  test('validate-map.js SIN --allow-child-process: degrada a exit 0 con aviso en stderr, NO lanza excepcion no capturada (hallazgo real, no el mismo patron que los demas guards)', () => {
    // A diferencia de code-exec-guard/destructive-op-guard/etc., el catch de
    // validate-map.js alrededor de "git ls-files" (execSync) trata CUALQUIER
    // fallo -- incluido EPERM del Permission Model -- como "no se puede
    // validar drift" y sale con exit 0. En produccion esto nunca se dispara
    // porque hooks-definition.js siempre invoca este script con
    // childProcess:true (ver repoConGit) -- pero si ese registro llegara a
    // desincronizarse, el guard fallaria en SILENCIO (drift real sin detectar)
    // en vez de visible. Documentado en vez de asumido: no es un false-negative
    // de seguridad (validate-map.js no bloquea nada, solo regenera un indice),
    // pero es un silent-failure real que vale conocer.
    const dirRepo = path.join(REPO, '**');

    const r = spawnSync('node', [
      '--permission',
      `--allow-fs-read=${dirRepo}`,
      `--allow-fs-write=${dirRepo}`,
      path.join(BIN, 'validate-map.js'),
    ], { encoding: 'utf8', cwd: REPO });

    assert.equal(r.status, 0, 'comportamiento real confirmado: degrada a exit 0 en vez de fallar visible (ver nota arriba)');
    assert.match(r.stderr, /no se puede validar drift/, 'debe dejar rastro del fallo en stderr aunque no bloquee');
  });

  test('subagent-guard-release.js CON permisos: borra el lock real y termina exit 0', () => {
    // Unico guard invocado en produccion con readYWriteSubagentLocks
    // (hooks-definition.js linea 181) que no tenia cobertura --permission
    // real -- su propio test (subagent-guard-release-js.test.js) usaba
    // spawnSync sin --permission, el mismo gap ya cerrado para los demas
    // guards en el commit 99413c4.
    const dirLocks = nuevoDirTemporal('subagent-guard-release-con-permiso');
    const lockFile = path.join(dirLocks, 's1__p1.lock');
    fs.writeFileSync(lockFile, '');
    const dirBin = path.join(BIN, '*');
    const dirLocksGlob = path.join(dirLocks, '*');

    const r = spawnSync('node', [
      '--permission',
      `--allow-fs-read=${dirBin},${dirLocksGlob}`,
      `--allow-fs-write=${dirLocksGlob}`,
      path.join(BIN, 'subagent-guard-release.js'),
    ], {
      input: JSON.stringify({ session_id: 's1', prompt_id: 'p1' }),
      encoding: 'utf8',
      cwd: REPO,
      env: { ...process.env, AI_CORE_SUBAGENT_LOCK_DIR: dirLocks },
    });

    assert.equal(r.status, 0, 'con el permiso correcto debe terminar exit 0 como en produccion');
    assert.equal(fs.existsSync(lockFile), false, 'debe haber borrado el lock real, no fallar en silencio sin efecto');
  });

  test('subagent-guard-release.js SIN ningun permiso: falla de forma controlada (EPERM), no cuelga ni lanza excepcion no capturada', () => {
    // En produccion el hook lo invoca con "... 2>/dev/null || true" -- un
    // EPERM aqui ya es tolerado a nivel de invocacion (a diferencia de los
    // demas guards, donde un fallo silencioso seria el riesgo). Lo que este
    // test verifica es que el proceso termine limpio (nunca cuelgue) y que
    // el fallo sea realmente EPERM del Permission Model, no otro error oculto.
    const r = spawnSync('node', [
      '--permission',
      path.join(BIN, 'subagent-guard-release.js'),
    ], {
      input: JSON.stringify({ session_id: 's1', prompt_id: 'p1' }),
      encoding: 'utf8',
      cwd: REPO,
    });

    assert.notEqual(r.status, null, 'no debe colgarse sin terminar');
    assert.notEqual(r.status, 0, 'sin permiso de lectura, el require de lib/hook-stdin no debe poder correr silenciosamente con exit 0');
    assert.match(r.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/);
  });
});
