'use strict';

/**
 * Regresion de la auditoria: destructive-op-guard.js y enmascararComando
 * dejaban pasar comandos destructivos por (a) enmascarar texto que SI se
 * ejecuta (heredoc hacia un interprete, sustitucion dentro de -m, `git commit`
 * en otro segmento) y (b) reglas de git acopladas al orden de las opciones.
 * Los comandos son datos de prueba para el guard: nunca se ejecutan.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { BIN, runScript } = require('./_shared');

const GUARD = path.join(BIN, 'destructive-op-guard.js');
const { enmascararComando } = require(path.join(BIN, 'lib', 'enmascarar-comando.js'));
const run = (cmd) => runScript(GUARD, [], { CLAUDE_TOOL_INPUT_command: cmd });

const RM = ['rm', '-rf', '~'].join(' ');

describe('enmascararComando: solo oculta texto realmente citado', () => {
  test('un heredoc hacia un interprete no se enmascara', () => {
    for (const cmd of [`bash <<EOF\n${RM}\nEOF`, `cat <<EOF | sh\n${RM}\nEOF`, `python3 - <<'PY'\nimport os\nPY`]) {
      assert.equal(enmascararComando(cmd), cmd, cmd);
    }
  });

  test('una sustitucion dentro de -m no se enmascara', () => {
    const cmd = `git commit -m "$(${RM})"`;
    assert.equal(enmascararComando(cmd), cmd);
    const cmd2 = 'git commit -m "`id`"';
    assert.equal(enmascararComando(cmd2), cmd2);
  });

  test('-m de otro comando no se enmascara aunque haya un git commit en otro segmento', () => {
    const cmd = `echo git commit; x -m "; ${RM}"`;
    assert.equal(enmascararComando(cmd), cmd);
  });

  test('el mensaje literal de un git commit real sigue enmascarado', () => {
    assert.match(enmascararComando(`git commit -m "docs: mencionar ${RM}"`), /-m "\.\.\."/);
    assert.match(enmascararComando(`git commit -m 'usa $(${RM}) literal'`), /-m "\.\.\."/);
  });

  test('un heredoc que escribe un archivo sigue enmascarado', () => {
    assert.match(enmascararComando(`cat <<'EOF' > nota.md\n${RM}\nEOF`), /\n\.\.\.\n/);
  });
});

describe('destructive-op-guard.js: bypass por enmascarado', () => {
  test('bloquea el heredoc hacia un interprete', () => {
    assert.equal(run(`bash <<EOF\n${RM}\nEOF`).status, 2);
  });
  test('bloquea la sustitucion dentro de -m', () => {
    assert.equal(run(`git commit -m "$(${RM})"`).status, 2);
  });
  test('bloquea el -m de un comando que no es git commit', () => {
    assert.equal(run(`echo git commit; x -m "; ${RM}"`).status, 2);
  });
  test('error: un commit que solo documenta el comando sigue permitido', () => {
    assert.equal(run('git commit -m "docs: mencionar rm -rf y git branch -D"').status, 0);
  });
  test('error: un heredoc a archivo que documenta el comando sigue permitido', () => {
    assert.equal(run(`cat <<'EOF' > nota.md\n${RM}\nEOF`).status, 0);
  });
});

describe('destructive-op-guard.js: reglas de git con opciones globales y formas cortas', () => {
  for (const cmd of [
    'git -C . reset --hard',
    'git -c core.x=y clean -fd',
    'git push -fu origin x',
    'git push --force --force-with-lease origin x',
    'git branch --delete --force x',
    'git -C /tmp/r push --force origin main',
  ]) {
    test(`bloquea: ${cmd}`, () => assert.equal(run(cmd).status, 2));
  }

  for (const cmd of [
    'git push --force-with-lease origin x',
    'git push --follow-tags origin main',
    'git push origin feat-f',
    'git branch -d x',
    'git -C . status',
  ]) {
    test(`error: permite ${cmd}`, () => assert.equal(run(cmd).status, 0));
  }
});
