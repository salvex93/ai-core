'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const att = require('../../.claude/bin/lib/session-attestation.js');
const pc = require('../../.claude/bin/lib/policy-compliance.js');

const POLITICA = {
  commit: { author: 'Andrew Arizmendi', bannedTerms: ['co-authored-by', 'claude', 'IA'] },
  code: { maxLines: 300 },
};
const ok = { hash: 'aaa1111', autor: 'Andrew Arizmendi', mensaje: 'fix(app): corrige el calculo' };
const porRegla = (res, regla) => res.find(r => r.regla === regla);

describe('policy-compliance: evaluarCumplimiento', () => {
  test('commit valido: cumple en autor y terminos', () => {
    const res = pc.evaluarCumplimiento({ commits: [ok], archivos: [], politica: POLITICA });
    assert.equal(porRegla(res, 'commit.author').estado, 'cumple');
    assert.equal(porRegla(res, 'commit.bannedTerms').estado, 'cumple');
  });

  test('autor distinto: incumple y la evidencia es solo el hash', () => {
    const res = pc.evaluarCumplimiento({ commits: [{ ...ok, hash: 'bbb2222', autor: 'Pedro Gomez' }], archivos: [], politica: POLITICA });
    const r = porRegla(res, 'commit.author');
    assert.equal(r.estado, 'incumple');
    assert.deepEqual(r.evidencia, ['bbb2222']);
  });

  test('termino prohibido en el mensaje: incumple; "IA" solo como palabra completa', () => {
    const malo = { ...ok, hash: 'ccc3333', mensaje: 'feat: x\n\nCo-Authored-By: Claude <n@a.com>' };
    assert.equal(porRegla(pc.evaluarCumplimiento({ commits: [malo], archivos: [], politica: POLITICA }), 'commit.bannedTerms').estado, 'incumple');
    const palabra = { ...ok, mensaje: 'fix: la variable historia queda definida' };
    assert.equal(porRegla(pc.evaluarCumplimiento({ commits: [palabra], archivos: [], politica: POLITICA }), 'commit.bannedTerms').estado, 'cumple');
  });

  test('archivo de codigo sobre el tope: incumple con la ruta como evidencia', () => {
    const res = pc.evaluarCumplimiento({ commits: [], archivos: [{ ruta: 'a/big.js', lineas: 301 }, { ruta: 'a/ok.js', lineas: 300 }], politica: POLITICA });
    const r = porRegla(res, 'code.maxLines');
    assert.equal(r.estado, 'incumple');
    assert.deepEqual(r.evidencia, ['a/big.js']);
  });

  test('sin artefactos que evaluar: sin_datos, no cumple', () => {
    const res = pc.evaluarCumplimiento({ commits: [], archivos: [], politica: POLITICA });
    assert.ok(res.every(r => r.estado === 'sin_datos'));
  });

  test('el resultado nunca contiene el mensaje ni el nombre del autor', () => {
    const malo = { hash: 'ddd4444', autor: 'Pedro Gomez', mensaje: 'secreto-interno Claude' };
    const texto = JSON.stringify(pc.evaluarCumplimiento({ commits: [malo], archivos: [], politica: POLITICA }));
    assert.ok(!texto.includes('Pedro') && !texto.includes('secreto-interno'));
  });
});

describe('policy-compliance: informe firmado', () => {
  const claves = att.generarParDeClaves();
  const base = { sessionId: 's1', version: '1.0.0', emitidoEn: '2026-11-04T00:00:00.000Z' };

  test('el informe incluye el hash de la politica y el cumplimiento', () => {
    const cumplimiento = pc.evaluarCumplimiento({ commits: [ok], archivos: [], politica: POLITICA });
    const informe = att.construirInforme({ ...base, politicaHash: pc.hashPolitica(POLITICA), cumplimiento });
    assert.equal(informe.politica.hash, pc.hashPolitica(POLITICA));
    assert.deepEqual(informe.cumplimiento, cumplimiento);
  });

  test('alterar cualquier campo nuevo rompe la verificacion', () => {
    const cumplimiento = pc.evaluarCumplimiento({ commits: [{ ...ok, autor: 'Otro' }], archivos: [], politica: POLITICA });
    const sobre = att.firmarInforme(att.construirInforme({ ...base, politicaHash: pc.hashPolitica(POLITICA), cumplimiento }), claves.privada);
    assert.equal(att.verificarSobre(sobre, claves.publica), true);

    const lavado = structuredClone(sobre);
    lavado.informe.cumplimiento.find(r => r.regla === 'commit.author').estado = 'cumple';
    assert.equal(att.verificarSobre(lavado, claves.publica), false);

    const otraPolitica = structuredClone(sobre);
    otraPolitica.informe.politica.hash = 'f'.repeat(64);
    assert.equal(att.verificarSobre(otraPolitica, claves.publica), false);
  });

  test('sin politica el informe conserva su forma anterior', () => {
    const informe = att.construirInforme(base);
    assert.equal('politica' in informe, false);
    assert.equal('cumplimiento' in informe, false);
  });

  test('hashPolitica es estable ante el orden de claves', () => {
    assert.equal(pc.hashPolitica({ a: 1, b: 2 }), pc.hashPolitica({ b: 2, a: 1 }));
  });
});
