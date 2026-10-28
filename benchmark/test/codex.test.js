'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseCodexJsonl, codexArgs } = require('../lib/codex');
const { ADAPTERS } = require('../lib/adapters');
const { PARSERS } = require('../lib/parsers');

const jsonl = (...events) => events.map((e) => JSON.stringify(e)).join('\n');

test('parseCodexJsonl suma tokens de turn.completed y toma el texto del agente', () => {
  const out = parseCodexJsonl(jsonl(
    { type: 'item.completed', item: { type: 'agent_message', text: 'listo' } },
    { type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 7, reasoning_output_tokens: 3 } },
    { type: 'turn.completed', usage: { input_tokens: 50, output_tokens: 2 } },
  ));
  assert.strictEqual(out.text, 'listo');
  assert.strictEqual(out.turns, 2);
  assert.deepStrictEqual(out.tokens, { input: 150, output: 9, cacheRead: 40, cacheWrite: 0, reasoning: 3 });
  assert.strictEqual(out.costUsd, null);
  assert.strictEqual(out.error, null);
});

test('parseCodexJsonl reporta error en turn.failed y en salida sin turnos', () => {
  const failed = parseCodexJsonl(jsonl({ type: 'turn.failed', error: { message: 'cuota agotada' } }));
  assert.strictEqual(failed.error, 'cuota agotada');
  assert.ok(parseCodexJsonl('basura').error);
});

test('codexArgs aisla la config, acota el sandbox y omite -m con model default', () => {
  const a = codexArgs('haz x', 'gpt-x');
  assert.deepStrictEqual(a.slice(0, 2), ['exec', '--json']);
  for (const f of ['--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules']) assert.ok(a.includes(f), f);
  assert.strictEqual(a[a.indexOf('--sandbox') + 1], 'workspace-write');
  assert.strictEqual(a[a.indexOf('-m') + 1], 'gpt-x');
  assert.strictEqual(a[a.length - 1], 'haz x');
  assert.ok(!codexArgs('p', 'default').includes('-m'));
});

test('adaptadores codex registrados y verificados con su parser', () => {
  for (const n of ['codex-vanilla', 'codex-ai-core']) {
    assert.strictEqual(ADAPTERS[n].verified, true, n);
    assert.strictEqual(ADAPTERS[n].bin, 'codex', n);
    assert.strictEqual(typeof PARSERS[ADAPTERS[n].parser], 'function', n);
  }
});

test('codex-ai-core instala AGENTS.md y codex-vanilla deja el directorio vacio', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
  try {
    ADAPTERS['codex-vanilla'].setup(dir);
    assert.deepStrictEqual(fs.readdirSync(dir), []);
    ADAPTERS['codex-ai-core'].setup(dir);
    assert.ok(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').includes('AI-CORE'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('codexEnv entrega CODEX_API_KEY solo desde la variable ya definida o .env, sin tocar process.env', () => {
  const { codexEnv } = require('../lib/codex');
  const antes = process.env.CODEX_API_KEY;
  delete process.env.CODEX_API_KEY;
  const env = codexEnv();
  assert.ok(!('CODEX_API_KEY' in process.env));
  assert.ok(Object.keys(env).every((k) => k === 'CODEX_API_KEY'));
  if (antes !== undefined) process.env.CODEX_API_KEY = antes;
});
