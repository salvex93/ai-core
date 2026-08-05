'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const { execSync } = require('node:child_process');
const { REPO } = require('./_shared');

describe('aiops-auditor.md — Precondicion 1 (quality gates activos)', () => {
  const AGENT_MD = path.join(REPO, '.claude', 'agents', 'aiops-auditor.md');
  const content  = fs.readFileSync(AGENT_MD, 'utf8');

  test('la precondicion 1 no busca la palabra literal "pass" en el output de validate-globals.js', () => {
    // Regresion real: validate-globals.js nunca imprime la palabra "pass" en
    // su output (usa "[OK  ]" y "ESTADO: OK") -- `grep -q "pass"` fallaba
    // siempre, incluso con 42/42 skills conformes, dejando la precondicion 1
    // rota de forma permanente (falso negativo constante).
    const precondicion1 = content.match(/# 1\. Quality gates activos[\s\S]*?(?=\n#|\n```)/);
    assert.ok(precondicion1, 'debe existir la precondicion 1 en el AGENT.md');
    assert.doesNotMatch(precondicion1[0], /grep -q "pass"/, 'no debe depender de la palabra literal "pass" en el output');
  });

  test('la precondicion 1 real, ejecutada contra el repo real, reporta OK cuando validate-globals.js sale con exit 0', () => {
    const bloqueBash = content.match(/```bash\n([\s\S]*?)\n```/);
    assert.ok(bloqueBash, 'debe existir un bloque bash de precondiciones');

    const lineaPrecondicion1 = bloqueBash[1]
      .split('\n')
      .find((l) => l.includes('validate-globals.js') && (l.includes('&&') || l.includes('||')));
    assert.ok(lineaPrecondicion1, 'debe existir la linea de la precondicion 1 con && / ||');

    const resultado = execSync(lineaPrecondicion1, { cwd: REPO, encoding: 'utf8', shell: 'bash' }).trim();
    assert.equal(resultado, 'OK: tests', 'con el repo real (42/42 conformes) la precondicion debe reportar OK, no FALLO');
  });
});
