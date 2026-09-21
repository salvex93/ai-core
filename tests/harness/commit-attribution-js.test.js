'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { BIN } = require('./_shared');

const { tieneRastroDeIA } = require(path.join(BIN, 'lib', 'commit-attribution'));

describe('lib/commit-attribution: tieneRastroDeIA', () => {
  test('detecta el trailer Co-Authored-By con nombre y email', () => {
    assert.equal(tieneRastroDeIA('fix: algo\n\nCo-Authored-By: Alguien <a@b.com>'), true);
  });

  test('detecta atribucion de autoria a una IA', () => {
    assert.equal(tieneRastroDeIA('feat: x\n\nGenerated with Claude Code'), true);
    assert.equal(tieneRastroDeIA('escrito por ChatGPT'), true);
    assert.equal(tieneRastroDeIA('sugerido por Copilot'), true);
  });

  test('un mensaje tecnico limpio no tiene rastro', () => {
    assert.equal(tieneRastroDeIA('fix(guards): degradar a la tool nativa'), false);
  });

  test('hablar DE la regla en prosa no cuenta como atribucion', () => {
    assert.equal(tieneRastroDeIA('docs: prohibir menciones a Claude en commits'), false);
  });

  test('entrada vacia o no-string no tiene rastro', () => {
    assert.equal(tieneRastroDeIA(''), false);
    assert.equal(tieneRastroDeIA(undefined), false);
  });
});
