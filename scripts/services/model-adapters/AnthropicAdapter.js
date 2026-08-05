'use strict';

/**
 * Adapter Anthropic — Claude Haiku 4.5 / Sonnet 5 / Opus 4.8 / Fable 5 via @anthropic-ai/sdk.
 */

/**
 * Construye el objeto de parametros para client.messages.create(), separado
 * de la llamada de red para poder testearlo sin API key ni mock del SDK
 * (mismo patron que construirBodyOpenAICompat en OpenAICompatAdapter.js).
 *
 * Prompt caching: convierte `system` en un array de content blocks con
 * cache_control en el bloque de texto -- patron verificado en codigo real
 * de produccion (Portkey-AI/gateway, src/providers/anthropic/chatComplete.ts,
 * Apache 2.0) y en el cookbook oficial de Vercel AI SDK, ademas confirmado
 * contra platform.claude.com/docs/en/build-with-claude/prompt-caching (2026).
 * Anthropic solo necesita el breakpoint en el ultimo bloque para cachear
 * todo el prefijo que lo precede -- un cache hit cuesta ~10% de un input
 * normal. Solo se activa si hay `system` (el contenido que mas se repite
 * entre llamadas) y no fue desactivado explicitamente con `disableCache`.
 *
 * @param {Array}  messages
 * @param {Object} options - { model, max_tokens, system, cacheTtl, disableCache }
 * @returns {Object} params listos para client.messages.create()
 */
function construirParamsAnthropic(messages, options = {}) {
  // Modelos disponibles: claude-haiku-4-5-20251001 | claude-sonnet-5 | claude-opus-4-8 | claude-fable-5
  const model  = options.model || 'claude-haiku-4-5-20251001';
  const maxOut = options.max_tokens || 1024;
  const system = options.system || '';

  const params = { model, max_tokens: maxOut, messages };

  if (system && !options.disableCache) {
    const cacheControl = options.cacheTtl
      ? { type: 'ephemeral', ttl: options.cacheTtl }
      : { type: 'ephemeral' };
    params.system = [{ type: 'text', text: system, cache_control: cacheControl }];
  } else if (system) {
    params.system = system;
  }

  return params;
}

async function chatAnthropic(messages, options = {}) {
  const { Anthropic } = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const params = construirParamsAnthropic(messages, options);
  const res = await client.messages.create(params);
  return {
    content:  res.content[0]?.text || '',
    provider: 'anthropic',
    model:    params.model,
    usage: {
      input_tokens:  res.usage?.input_tokens  || 0,
      output_tokens: res.usage?.output_tokens || 0,
      cache_creation_input_tokens: res.usage?.cache_creation_input_tokens || 0,
      cache_read_input_tokens:     res.usage?.cache_read_input_tokens     || 0,
    },
  };
}

module.exports = { chatAnthropic, construirParamsAnthropic };
