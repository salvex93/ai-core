'use strict';

/**
 * Adapter generico OpenAI-compatible — cubre OpenAI, DeepSeek y Kimi via HTTP.
 */

const PROVIDER_CONFIGS = Object.freeze({
  openai: {
    name:         'openai',
    baseUrl:      'https://api.openai.com',
    apiKeyEnv:    'OPENAI_API_KEY',
    // GPT-5.6 Luna: tier mas barato de la familia GPT-5.6 (GA 2026-07-09),
    // $1/$6 por 1M tokens. gpt-4o-mini fue retirado (GPT-4o discontinuado
    // febrero 2026) y ya no es la opcion recomendada para proyectos nuevos.
    defaultModel: 'gpt-5.6-luna',
  },
  deepseek: {
    name:         'deepseek',
    baseUrl:      'https://api.deepseek.com',
    apiKeyEnv:    'DEEPSEEK_API_KEY',
    // "deepseek-chat" se deprecha 2026-07-24 15:59 UTC (mapea a modo
    // no-thinking de deepseek-v4-flash) -- usar el nombre nuevo directamente.
    defaultModel: 'deepseek-v4-flash',
  },
  kimi: {
    name:         'kimi',
    baseUrl:      'https://api.moonshot.ai',
    apiKeyEnv:    'KIMI_API_KEY',
    // La serie moonshot-v1 cierra a nuevos usuarios y sunset completo
    // 2026-08-31 -- kimi-k3 (2026-07-16, 1M contexto) es el flagship vigente.
    defaultModel: 'kimi-k3',
  },
});

async function chatOpenAICompat(messages, options = {}, providerConfig = {}) {
  const https = require('https');

  const baseUrl = providerConfig.baseUrl || 'https://api.openai.com';
  const apiKey  = providerConfig.apiKey  || process.env.OPENAI_API_KEY || '';
  const model   = options.model || providerConfig.defaultModel || 'gpt-5.6-luna';
  const maxOut  = options.max_tokens || 1024;

  const body = JSON.stringify({
    model,
    messages,
    max_tokens: maxOut,
    stream: false,
  });

  return new Promise((resolve, reject) => {
    const url     = new URL(`${baseUrl}/v1/chat/completions`);
    const reqOpts = {
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(reqOpts, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve({
            content:  parsed.choices?.[0]?.message?.content || '',
            provider: providerConfig.name || 'openai',
            model,
            usage: {
              input_tokens:  parsed.usage?.prompt_tokens     || 0,
              output_tokens: parsed.usage?.completion_tokens || 0,
            },
          });
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { chatOpenAICompat, PROVIDER_CONFIGS };
