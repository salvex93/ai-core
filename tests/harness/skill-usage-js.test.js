'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO, BIN, tmpFile } = require('./_shared');
const { construirRegistro } = require(path.join(BIN, 'skill-usage.js'));

function ejecutar(evento, salida) {
  return spawnSync('node', [path.join(BIN, 'skill-usage.js')], {
    input: JSON.stringify(evento),
    encoding: 'utf8',
    cwd: REPO,
    env: { ...process.env, AI_CORE_TEST_MODE: '1', AI_CORE_SKILL_USAGE_PATH: salida },
  });
}

test('skill-usage: registra una linea por invocacion de Skill', () => {
  const salida = tmpFile();
  ejecutar({ tool_name: 'Skill', tool_input: { skill: 'qa-engineer' }, session_id: 's1' }, salida);
  const lineas = fs.readFileSync(salida, 'utf8').trim().split('\n').map(JSON.parse);
  assert.strictEqual(lineas.length, 1);
  assert.strictEqual(lineas[0].skill, 'qa-engineer');
  assert.strictEqual(lineas[0].session, 's1');
  fs.unlinkSync(salida);
});

test('skill-usage: ignora eventos que no son Skill o sin nombre', () => {
  assert.strictEqual(construirRegistro({ tool_name: 'Bash', tool_input: { skill: 'x' } }), null);
  assert.strictEqual(construirRegistro({ tool_name: 'Skill', tool_input: {} }), null);
  assert.strictEqual(construirRegistro({}), null);
});
