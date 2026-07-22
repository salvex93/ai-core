'use strict';

/**
 * Adapter Anthropic — Claude Haiku 4.5 / Sonnet 5 / Opus 4.8 / Fable 5 via @anthropic-ai/sdk.
 */

async function chatAnthropic(messages, options = {}) {
  const { Anthropic } = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Modelos disponibles: claude-haiku-4-5-20251001 | claude-sonnet-5 | claude-opus-4-8 | claude-fable-5
  const model  = options.model || 'claude-haiku-4-5-20251001';
  const maxOut = options.max_tokens || 1024;
  const system = options.system || '';

  const params = { model, max_tokens: maxOut, messages };
  if (system) params.system = system;

  const res = await client.messages.create(params);
  return {
    content:  res.content[0]?.text || '',
    provider: 'anthropic',
    model,
    usage: {
      input_tokens:  res.usage?.input_tokens  || 0,
      output_tokens: res.usage?.output_tokens || 0,
    },
  };
}

module.exports = { chatAnthropic };
