'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('OpenAICompatAdapter.js — construccion del body de la peticion', () => {
  const SCRIPT = path.join(REPO, 'scripts', 'services', 'model-adapters', 'OpenAICompatAdapter.js');
  const { construirBodyOpenAICompat, PROVIDER_CONFIGS } = require(SCRIPT);

  test('openai: comentario de pricing de gpt-5.6-luna coincide con el precio oficial verificado ($0.20/$1.20)', () => {
    // Verificado 2026-08-03 contra developers.openai.com/api/docs/pricing --
    // el comentario previo decia "$1/$6", desactualizado desde el recorte de
    // precio de Luna del 2026-07-30 (OpenAI bajo Luna 80%).
    const src = fs.readFileSync(SCRIPT, 'utf8');
    assert.ok(
      !/\$1\/\$6/.test(src),
      'el comentario de pricing de gpt-5.6-luna sigue con el precio viejo "$1/$6" -- actualizar a $0.20/$1.20'
    );
  });

  test('openai: usa SOLO max_completion_tokens, nunca max_tokens', () => {
    // Regresion real detectada en verificacion en vivo (2026-07-22): la API
    // de OpenAI actual RECHAZA la peticion por completo si max_tokens esta
    // presente ("Unsupported parameter: 'max_tokens' is not supported with
    // this model") -- no es que lo ignore, la llamada falla. Enviar ambos
    // parametros no es viable para este proveedor.
    const body = JSON.parse(construirBodyOpenAICompat([{ role: 'user', content: 'hola' }], { max_tokens: 500 }, PROVIDER_CONFIGS.openai));
    assert.equal(body.max_completion_tokens, 500);
    assert.equal('max_tokens' in body, false, 'openai no debe recibir max_tokens en el body');
  });

  test('deepseek: usa max_tokens (formato clasico, no verificado si migro pero se asume compatibilidad)', () => {
    const body = JSON.parse(construirBodyOpenAICompat([{ role: 'user', content: 'hola' }], { max_tokens: 500 }, PROVIDER_CONFIGS.deepseek));
    assert.equal(body.max_tokens, 500);
    assert.equal('max_completion_tokens' in body, false);
  });

  test('kimi: usa max_tokens (formato clasico, no verificado si migro pero se asume compatibilidad)', () => {
    const body = JSON.parse(construirBodyOpenAICompat([{ role: 'user', content: 'hola' }], { max_tokens: 500 }, PROVIDER_CONFIGS.kimi));
    assert.equal(body.max_tokens, 500);
    assert.equal('max_completion_tokens' in body, false);
  });

  test('sin providerConfig (fallback): usa max_tokens', () => {
    const body = JSON.parse(construirBodyOpenAICompat([{ role: 'user', content: 'hola' }], {}, {}));
    assert.equal(body.max_tokens, 1024);
  });

  test('forzarJSON + soportaJSONMode: agrega response_format json_object', () => {
    // Confirmado en vivo (2026-07-22): OpenAI ignora instrucciones de texto
    // plano pidiendo JSON, pero SI respeta response_format:{type:"json_object"}
    // (parametro estandar de la API de chat completions). Solo se aplica si
    // el proveedor lo soporta explicitamente -- no verificado para
    // DeepSeek/Kimi, no se activa para ellos.
    const body = JSON.parse(construirBodyOpenAICompat(
      [{ role: 'user', content: 'x' }], { forzarJSON: true }, { ...PROVIDER_CONFIGS.openai }
    ));
    assert.deepEqual(body.response_format, { type: 'json_object' });
  });

  test('forzarJSON sin soportaJSONMode en el proveedor: no agrega response_format', () => {
    const body = JSON.parse(construirBodyOpenAICompat(
      [{ role: 'user', content: 'x' }], { forzarJSON: true }, { ...PROVIDER_CONFIGS.deepseek }
    ));
    assert.equal('response_format' in body, false, 'deepseek no confirmado, no debe forzar el parametro');
  });

  test('options.system antepone un mensaje role:system al array messages', () => {
    // Regresion real detectada en verificacion en vivo (2026-07-22): el
    // adapter nunca uso options.system -- cualquier llamada con system
    // prompt lo perdia silenciosamente sin error. Afecta a CrossVerifier.js
    // y SubagentGrader.js, ambos pasan system explicitamente.
    const body = JSON.parse(construirBodyOpenAICompat(
      [{ role: 'user', content: 'x' }], { system: 'eres un juez' }, {}
    ));
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[0].content, 'eres un juez');
    assert.equal(body.messages[1].content, 'x');
  });

  test('sin options.system: messages queda igual, sin mensaje system agregado', () => {
    const body = JSON.parse(construirBodyOpenAICompat([{ role: 'user', content: 'x' }], {}, {}));
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].role, 'user');
  });

  test('usa el modelo y defaultModel de la configuracion del proveedor', () => {
    const body = JSON.parse(construirBodyOpenAICompat([{ role: 'user', content: 'x' }], {}, { defaultModel: 'kimi-k3' }));
    assert.equal(body.model, 'kimi-k3');
  });
});

// ─── CrossVerifier.js ────────────────────────────────────────────────────────
