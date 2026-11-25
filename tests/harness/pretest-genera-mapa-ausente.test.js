'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { REPO } = require('./_shared');

describe('pretest: bootstrap de clon fresco sin CONTEXT_MAP.json', () => {
  const scripts = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).scripts;

  test('npm test declara un pretest que genera el mapa', () => {
    assert.ok(scripts.pretest, 'pretest debe existir');
    assert.ok(scripts.pretest.includes('CONTEXT_MAP.json'), 'debe comprobar la ausencia del mapa');
    assert.ok(scripts.pretest.includes('npm run map'), 'debe generarlo con npm run map');
  });

  test('el script map referenciado por pretest existe', () => {
    assert.ok(scripts.map, 'npm run map debe estar definido');
  });
});
