'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { REPO, BIN } = require('./_shared');

const SCRIPT = path.join(BIN, 'session-attest.js');
const autorHead = () => execFileSync('git', ['log', '-1', '--format=%an'], { cwd: REPO, encoding: 'utf8' }).trim();

describe('session-attest: cumplimiento de la politica en el sobre', () => {
  let tmp;
  before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'attest-cumple-')); });

  function sesion(nombre, politica) {
    const dir = path.join(tmp, nombre);
    fs.mkdirSync(dir);
    const archivoPolitica = path.join(dir, 'policy.json');
    fs.writeFileSync(archivoPolitica, JSON.stringify(politica));
    const env = {
      ...process.env,
      AI_CORE_ATTEST_DIR: dir,
      AI_CORE_ATTEST_CHAIN: path.join(dir, 'cadena.jsonl'),
      AI_CORE_ATTEST_BREAK_GLASS: path.join(dir, 'bg.jsonl'),
      AI_CORE_GUARD_REPORT_PATH: path.join(dir, 'guards.jsonl'),
      AI_CORE_POLICY: archivoPolitica,
      CLAUDE_CODE_SESSION_ID: `sesion-${nombre}`,
    };
    const run = (cmd) => spawnSync('node', [SCRIPT, cmd], { encoding: 'utf8', cwd: REPO, env });
    assert.equal(run('keygen').status, 0);
    assert.equal(run('sign').status, 0);
    const sobres = fs.readFileSync(env.AI_CORE_ATTEST_CHAIN, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    return { sobres, verificar: () => run('verify') };
  }

  const politica = (autor) => ({ commit: { author: autor, bannedTerms: ['zzz-termino-inexistente'] }, code: { maxLines: 1000000 } });

  test('commit que cumple: sobre con cumple, hash de politica y cadena valida', () => {
    const { sobres, verificar } = sesion('cumple', politica(autorHead()));
    const informe = sobres[0].informe;
    assert.match(informe.politica.hash, /^[0-9a-f]{64}$/);
    assert.equal(informe.cumplimiento.find(r => r.regla === 'commit.author').estado, 'cumple');
    assert.equal(verificar().status, 0);
  });

  test('commit que viola la politica: sobre con incumple y solo el hash como evidencia', () => {
    const { sobres } = sesion('incumple', politica('Nadie Mas'));
    const r = sobres[0].informe.cumplimiento.find(x => x.regla === 'commit.author');
    assert.equal(r.estado, 'incumple');
    assert.match(r.evidencia[0], /^[0-9a-f]{7,}$/);
    assert.ok(!JSON.stringify(sobres[0]).includes(autorHead()), 'el nombre del autor no debe aparecer en el sobre');
  });
});
