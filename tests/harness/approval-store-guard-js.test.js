'use strict';

/**
 * approval-store-guard.js: el agente no debe poder escribir en el almacen de
 * locks (aprobaciones de break-glass, contadores de guards) por ninguna de
 * sus herramientas; la unica via legitima de aprobar es el prompt del
 * usuario, que llega por el hook UserPromptSubmit.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { BIN } = require('./_shared');
const { buildHooksSection } = require(path.join(BIN, 'hooks-definition.js'));

const GUARD = path.join(BIN, 'approval-store-guard.js');
const STORE = path.join(os.tmpdir(), 'ai-core-locks', 'break-glass', 'aprobadas');

function correr(evento) {
  return spawnSync('node', [GUARD], { input: JSON.stringify(evento), encoding: 'utf8' });
}
const bash = (command) => correr({ tool_name: 'Bash', tool_input: { command } });
const archivo = (tool_name, file_path) => correr({ tool_name, tool_input: { file_path } });

describe('approval-store-guard.js: Bash', () => {
  for (const cmd of [
    `echo '{"ts":1}' > ${STORE}/abc.json`,
    `cp a.json "$TMPDIR/ai-core-locks/break-glass/aprobadas/"`,
    `ls /tmp/ai-core-'locks'/break-glass`,
    `AI_CORE_BREAK_GLASS_DIR=/x node -e "1"`,
    `node -e "require('fs').writeFileSync('${STORE}/x.json','{}')"`,
    `rm -f ${path.join(os.tmpdir(), 'ai-core-locks')}/subagents/x.lock`,
  ]) {
    test(`bloquea: ${cmd}`, () => {
      const r = bash(cmd);
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /APPROVAL-STORE-GUARD/);
    });
  }

  for (const cmd of [
    'git commit -m "docs: explicar el break-glass"',
    'grep -rn break-glass README.md',
    'ls /tmp',
    'echo hola > salida.txt',
  ]) {
    test(`error: permite ${cmd}`, () => assert.equal(bash(cmd).status, 0));
  }
});

describe('approval-store-guard.js: Write y Edit', () => {
  for (const tool of ['Write', 'Edit', 'NotebookEdit']) {
    test(`bloquea ${tool} dentro del almacen`, () => {
      assert.equal(archivo(tool, path.join(STORE, 'x.json')).status, 2);
    });
  }

  test('bloquea una ruta con segmentos .. que resuelve al almacen', () => {
    assert.equal(archivo('Write', path.join(os.tmpdir(), 'otro', '..', 'ai-core-locks', 'break-glass', 'x.json')).status, 2);
  });

  test('error: permite escribir un archivo normal', () => {
    assert.equal(archivo('Write', '/proyecto/notas.md').status, 0);
  });

  test('error: entrada vacia o JSON invalido no rompe el guard', () => {
    assert.equal(correr({}).status, 0);
    const r = spawnSync('node', [GUARD], { input: 'no es json', encoding: 'utf8' });
    assert.equal(r.status, 0);
  });
});

describe('approval-store-guard.js: registro en los hooks generados', () => {
  const hooks = buildHooksSection((s) => `"${path.join(BIN, s)}"`, os.tmpdir());
  const entrada = hooks.PreToolUse.find((e) => e.hooks.some((h) => h.command.includes('approval-store-guard.js')));

  test('esta registrado en PreToolUse para Bash, Write, Edit y NotebookEdit, con --permission', () => {
    assert.ok(entrada, 'debe estar registrado');
    assert.equal(entrada.matcher, 'Bash|Write|Edit|NotebookEdit');
    assert.match(entrada.hooks[0].command, /^node --permission /);
    assert.doesNotMatch(entrada.hooks[0].command, /\|\| true/, 'un fallo no debe absorberse: el exit 2 es el bloqueo');
  });

  test('con los flags de permisos reales sigue bloqueando (el perfil alcanza para leer stdin y sus libs)', () => {
    const r = spawnSync(entrada.hooks[0].command, { shell: true, input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: path.join(STORE, 'x.json') } }), encoding: 'utf8' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /APPROVAL-STORE-GUARD/);
  });

  test('con los flags de permisos reales permite una accion normal', () => {
    const r = spawnSync(entrada.hooks[0].command, { shell: true, input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls /tmp' } }), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
});
