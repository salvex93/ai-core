'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { REPO, BIN, runScript } = require('./_shared');

describe('verify-audit-log.js', () => {
  const SCRIPT = path.join(BIN, 'verify-audit-log.js');

  function dirAislado() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'verify-audit-log-test-'));
  }

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('log inexistente: sale 0 con mensaje "nada que verificar"', () => {
    const dir = dirAislado();
    const logPath = path.join(dir, 'BREAK_GLASS_LOG.jsonl');
    const r = runScript(SCRIPT, [], { AI_CORE_BREAK_GLASS_LOG: logPath });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /nada que verificar/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('log con cadena integra (generado via el modulo real): sale 0 con conteo de entradas', () => {
    const dir = dirAislado();
    const logPath = path.join(dir, 'BREAK_GLASS_LOG.jsonl');
    process.env.AI_CORE_BREAK_GLASS_LOG = logPath;
    process.env.AI_CORE_BREAK_GLASS_DIR = path.join(dir, 'locks');
    delete require.cache[require.resolve('../../.claude/bin/lib/break-glass')];
    const mod = require('../../.claude/bin/lib/break-glass');
    const { id } = mod.solicitarBreakGlass('test-guard', 'comando de prueba');
    mod.confirmarBreakGlass(id);
    delete process.env.AI_CORE_BREAK_GLASS_LOG;
    delete process.env.AI_CORE_BREAK_GLASS_DIR;

    const r = runScript(SCRIPT, [], { AI_CORE_BREAK_GLASS_LOG: logPath });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /OK -- 1 entrada\(s\), cadena de hashes integra/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('log con una entrada editada a mano: sale 1 y reporta el indice roto', () => {
    const dir = dirAislado();
    const logPath = path.join(dir, 'BREAK_GLASS_LOG.jsonl');
    process.env.AI_CORE_BREAK_GLASS_LOG = logPath;
    process.env.AI_CORE_BREAK_GLASS_DIR = path.join(dir, 'locks');
    delete require.cache[require.resolve('../../.claude/bin/lib/break-glass')];
    const mod = require('../../.claude/bin/lib/break-glass');
    const { id } = mod.solicitarBreakGlass('test-guard', 'comando de prueba');
    mod.confirmarBreakGlass(id);
    delete process.env.AI_CORE_BREAK_GLASS_LOG;
    delete process.env.AI_CORE_BREAK_GLASS_DIR;

    const entrada = JSON.parse(fs.readFileSync(logPath, 'utf8').trim());
    entrada.contexto = 'contexto manipulado';
    fs.writeFileSync(logPath, JSON.stringify(entrada) + '\n', 'utf8');

    const r = runScript(SCRIPT, [], { AI_CORE_BREAK_GLASS_LOG: logPath });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /CADENA ROTA -- entrada #0 de 1/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
