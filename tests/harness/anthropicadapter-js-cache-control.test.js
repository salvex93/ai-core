'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { REPO } = require('./_shared');

describe('AnthropicAdapter.js — cache_control (prompt caching)', () => {
  const SCRIPT = path.join(REPO, 'scripts', 'services', 'model-adapters', 'AnthropicAdapter.js');
  const { construirParamsAnthropic } = require(SCRIPT);

  test('con options.system: convierte system a array de content blocks con cache_control en el bloque', () => {
    // Patron verificado en codigo real de produccion (Portkey-AI/gateway,
    // src/providers/anthropic/chatComplete.ts, Apache 2.0) y en el cookbook
    // oficial de Vercel AI SDK: system pasa de string a
    // [{type:'text', text, cache_control:{type:'ephemeral'}}] -- Anthropic
    // solo necesita el breakpoint en el ultimo bloque para cachear todo el
    // prefijo que lo precede. Confirmado tambien contra
    // platform.claude.com/docs/en/build-with-claude/prompt-caching (2026).
    const params = construirParamsAnthropic(
      [{ role: 'user', content: 'hola' }],
      { system: 'eres un asistente util', model: 'claude-sonnet-5', max_tokens: 500 }
    );
    assert.deepEqual(params.system, [
      { type: 'text', text: 'eres un asistente util', cache_control: { type: 'ephemeral' } },
    ]);
    assert.equal('cache_control' in params, false, 'cache_control va en el bloque, no top-level');
  });

  test('sin options.system: no hay bloque que cachear, system queda ausente', () => {
    const params = construirParamsAnthropic([{ role: 'user', content: 'hola' }], { model: 'claude-sonnet-5' });
    assert.equal('system' in params, false);
  });

  test('options.cacheTtl: "1h" propaga el ttl extendido dentro del bloque cache_control', () => {
    const params = construirParamsAnthropic(
      [{ role: 'user', content: 'hola' }],
      { system: 'contexto largo reutilizado', cacheTtl: '1h' }
    );
    assert.deepEqual(params.system[0].cache_control, { type: 'ephemeral', ttl: '1h' });
  });

  test('options.disableCache: system vuelve a ser un string plano sin cache_control', () => {
    const params = construirParamsAnthropic(
      [{ role: 'user', content: 'hola' }],
      { system: 'x', disableCache: true }
    );
    assert.equal(params.system, 'x');
  });

  test('model y max_tokens se preservan igual que antes del cambio', () => {
    const params = construirParamsAnthropic(
      [{ role: 'user', content: 'hola' }],
      { model: 'claude-opus-5', max_tokens: 2048 }
    );
    assert.equal(params.model, 'claude-opus-5');
    assert.equal(params.max_tokens, 2048);
  });

  test('sin options.max_tokens: usa el default de 1024 (mismo comportamiento previo)', () => {
    const params = construirParamsAnthropic([{ role: 'user', content: 'hola' }], {});
    assert.equal(params.max_tokens, 1024);
  });
});
