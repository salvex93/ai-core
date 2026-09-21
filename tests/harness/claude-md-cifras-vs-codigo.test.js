'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const { REPO, BIN, SKILLS } = require('./_shared');

const { REGLAS } = require(path.join(BIN, 'lib', 'destructive-rules'));

const CLAUDE_MD = fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8');

function cifrasDeclaradas(patron) {
  return [...CLAUDE_MD.matchAll(patron)].map(m => Number(m[1]));
}

function assertTodasIguales(declaradas, real, etiqueta) {
  assert.ok(declaradas.length > 0, `CLAUDE.md ya no menciona la cifra de ${etiqueta}: actualizar el patron del test`);
  for (const n of declaradas) {
    assert.equal(n, real, `CLAUDE.md declara ${n} ${etiqueta} y el codigo tiene ${real}`);
  }
}

describe('cifras de CLAUDE.md contra el codigo', () => {
  test('reglas break-glass de destructive-rules.js', () => {
    const real = REGLAS.filter(r => r.breakGlass === true).length;
    assertTodasIguales(cifrasDeclaradas(/las (\d+) reglas sin alternativa segura/g), real, 'reglas break-glass');
  });

  test('skills en .claude/skills/', () => {
    const real = fs.readdirSync(SKILLS, { withFileTypes: true }).filter(d => d.isDirectory()).length;
    assertTodasIguales(cifrasDeclaradas(/(\d+) skills(?: con| en|\))/g), real, 'skills');
  });

  test('agentes en .claude/agents/', () => {
    const dir = path.join(REPO, '.claude', 'agents');
    const real = fs.readdirSync(dir).filter(f => f.endsWith('.md')).length;
    assertTodasIguales(cifrasDeclaradas(/los (\d+) agentes/g), real, 'agentes');
  });
});
