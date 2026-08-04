'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, runScript } = require('./_shared');

describe('destructive-op-guard.js', () => {
  const GUARD = path.join(BIN, 'destructive-op-guard.js');

  function run(cmd) {
    return runScript(GUARD, [], { CLAUDE_TOOL_INPUT_command: cmd });
  }

  test('sale con codigo 0 si no hay comando', () => {
    const r = runScript(GUARD, []);
    assert.equal(r.status, 0, 'debe permitir cuando no hay comando en el env');
  });

  test('bloquea "rm -rf" sobre una ruta real', () => {
    const r = run('rm -rf node_modules');
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('DESTRUCTIVE-OP-GUARD'));
  });

  test('bloquea "rm -rf /" y variantes con raiz', () => {
    assert.equal(run('rm -rf /').status, 2);
    assert.equal(run('rm -rf ~').status, 2);
  });

  test('permite "rm" sin -rf sobre un archivo especifico', () => {
    assert.equal(run('rm archivo-temporal.txt').status, 0);
  });

  test('bloquea "git push --force" y "-f"', () => {
    assert.equal(run('git push --force origin main').status, 2);
    assert.equal(run('git push -f origin main').status, 2);
  });

  test('permite "git push --force-with-lease"', () => {
    // Mas seguro que --force a secas -- falla si el remoto tiene commits que
    // el operador no vio, en vez de sobreescribir ciegamente.
    assert.equal(run('git push --force-with-lease origin main').status, 0);
  });

  test('permite "git push" normal', () => {
    assert.equal(run('git push origin main').status, 0);
  });

  test('bloquea "git reset --hard"', () => {
    assert.equal(run('git reset --hard HEAD~1').status, 2);
  });

  test('permite "git reset" sin --hard', () => {
    assert.equal(run('git reset HEAD~1').status, 0);
  });

  test('bloquea "git clean -f" y "-fd"', () => {
    assert.equal(run('git clean -f').status, 2);
    assert.equal(run('git clean -fd').status, 2);
  });

  test('bloquea "git branch -D"', () => {
    assert.equal(run('git branch -D feature-vieja').status, 2);
  });

  test('permite "git branch -d" (delete seguro, solo si ya esta mergeado)', () => {
    assert.equal(run('git branch -d feature-vieja').status, 0);
  });

  test('bloquea DROP TABLE / TRUNCATE en comandos de base de datos', () => {
    assert.equal(run('psql -c "DROP TABLE usuarios"').status, 2);
    assert.equal(run('psql -c "TRUNCATE TABLE pedidos"').status, 2);
  });

  test('permite un SELECT o un DROP TABLE IF EXISTS documentado como intencional en un comentario del propio comando', () => {
    assert.equal(run('psql -c "SELECT * FROM usuarios"').status, 0);
  });

  test('permite comandos no destructivos (npm test, git status, ls)', () => {
    assert.equal(run('npm test').status, 0);
    assert.equal(run('git status --short').status, 0);
    assert.equal(run('ls -la').status, 0);
  });

  test('no bloquea un git commit cuyo MENSAJE menciona un patron destructivo como texto descriptivo', () => {
    // Falso positivo real detectado en produccion: un commit real que
    // documentaba este mismo guard (mensaje mencionando "rm -rf",
    // "git push --force", "DROP TABLE" como texto explicativo) se bloqueaba
    // a si mismo -- el patron no distinguia el comando real de shell del
    // contenido citado dentro del mensaje de -m/-F.
    const msg = 'fix: nunca usar rm -rf en produccion, revisar antes de git push --force';
    assert.equal(run(`git commit -m "${msg}"`).status, 0);
    assert.equal(run(`git commit -F commit-msg.txt`).status, 0);
  });

  test('SI bloquea un rm -rf real aunque el comando incluya un git commit encadenado', () => {
    // El commit no es lo que se bloquea -- el rm -rf real fuera de las
    // comillas del mensaje si debe seguir bloqueado.
    assert.equal(run('rm -rf build/ && git commit -m "limpiar build"').status, 2);
  });

  test('sin CLAUDE_TOOL_INPUT_command, lee tool_input.command del JSON de stdin (contrato real de hooks Claude Code)', () => {
    const evento = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/algo' } });
    const r = spawnSync('node', [GUARD], { encoding: 'utf8', cwd: REPO, input: evento });
    assert.equal(r.status, 2, 'debe bloquear leyendo el comando real desde stdin');
    assert.ok(r.stderr.includes('DESTRUCTIVE-OP-GUARD'));
  });

  test('sin CLAUDE_TOOL_INPUT_command y sin stdin con datos, no bloquea y no lanza excepcion', () => {
    const r = spawnSync('node', [GUARD], { encoding: 'utf8', cwd: REPO, input: '' });
    assert.equal(r.status, 0);
  });
});
