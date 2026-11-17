'use strict';

/**
 * Regresion del red team sobre destructive-op-guard: evasiones por ofuscacion
 * del nombre del comando, push --mirror y borrados de rama con opciones
 * globales, operaciones sobre discos y bases, y falsos positivos de uso
 * diario (nombres de archivo con guiones, dry-run, .pem en un nombre).
 * Los comandos son datos de prueba para el guard: nunca se ejecutan.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { BIN, runScript } = require('./_shared');

const GUARD = path.join(BIN, 'destructive-op-guard.js');
const run = (cmd) => runScript(GUARD, [], { CLAUDE_TOOL_INPUT_command: cmd });

const BLOQUEAR = [
  'r\\m -rf /tmp/x',
  '"rm" -rf /tmp/x',
  "'rm' -rf /tmp/x",
  'git push origin main --mirror',
  'git push --mirror',
  'git -C /tmp push origin :main',
  'git --git-dir=/x push origin :main',
  'git push -d origin main',
  'git push origin HEAD --delete',
  'dd if=/dev/zero of=/dev/sda',
  'mkfs.ext4 /dev/sda1',
  'chmod -R 777 /',
  'shred -u file',
  'find /tmp/x -delete',
  'psql -c "DELETE FROM users WHERE 1=1"',
  'psql -c "DROP SCHEMA public CASCADE"',
  'kubectl delete ns prod',
  'docker volume prune -f',
  'docker system prune -af',
  'git clean -n; git clean -fd',
];

const PERMITIR = [
  'rm release-for-review.log',
  'rm -f a-fr-b',
  'git clean -n -f',
  'git clean -nfd',
  'git clean --dry-run -f',
  'git add keys.pem.md',
  'git push origin main',
  'git push origin HEAD:main',
  'psql -c "DELETE FROM users WHERE id = 1"',
  'kubectl delete pod web-1',
  'docker volume ls',
  "find . -name '*.js'",
  'chmod -R 755 ./dist',
];

describe('destructive-op-guard.js: evasiones demostradas por el red team', () => {
  for (const cmd of BLOQUEAR) test(`bloquea: ${cmd}`, () => assert.equal(run(cmd).status, 2, cmd));
});

describe('destructive-op-guard.js: falsos positivos y usos legitimos', () => {
  for (const cmd of PERMITIR) test(`error: permite ${cmd}`, () => assert.equal(run(cmd).status, 0, `${cmd}\n${run(cmd).stderr}`));
});
