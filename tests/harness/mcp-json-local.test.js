'use strict';

/**
 * .mcp.json lleva rutas absolutas de la maquina que lo genera (cwd de los
 * servidores): versionarlo rompia a cualquier otro equipo. Se genera local con
 * `npm run setup`, igual que .claude/settings.json.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { REPO } = require('./_shared');

const git = (...args) => spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });

test('.mcp.json no esta versionado', () => {
  assert.equal(git('ls-files', '--', '.mcp.json').stdout.trim(), '');
});

test('.mcp.json esta en .gitignore', () => {
  assert.equal(git('check-ignore', '-q', '.mcp.json').status, 0);
});

test('error: un archivo cualquiera no ignorado no se reporta como ignorado', () => {
  assert.equal(git('check-ignore', '-q', 'package.json').status, 1);
});
