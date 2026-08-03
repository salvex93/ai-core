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
    // $0.20/$1.20 por 1M tokens (verificado 2026-08-03 contra
    // developers.openai.com/api/docs/pricing -- OpenAI recorto el precio de
    // Luna 80% el 2026-07-30). gpt-4o-mini fue retirado (GPT-4o discontinuado
    // febrero 2026) y ya no es la opcion recomendada para proyectos nuevos.
    defaultModel: 'gpt-5.6-luna',
    // GPT-5.6 Sol: tier mas capaz de la familia, $5.00/$30.00 por 1M tokens
    // (verificado 2026-08-03). Usar solo cuando la tarea amerita el modelo
    // mas fuerte de OpenAI (ej. verificacion cross-model de diffs criticos
    // en CrossVerifier.js) -- nunca como defaultModel de tareas delegables
    // simples, seria pagar de mas por capacidad que no se necesita.
    modeloVerificador: 'gpt-5.6-sol',
    // Confirmado en vivo (2026-07-22): la API de OpenAI actual RECHAZA la
    // peticion por completo si recibe max_tokens ("Unsupported parameter").
    maxTokensParam: 'max_completion_tokens',
    // Confirmado en vivo (2026-07-22): OpenAI ignora instrucciones de texto
    // plano pidiendo "responde solo JSON" pero SI respeta el parametro
    // estandar response_format:{type:"json_object"}.
    soportaJSONMode: true,
  },
  deepseek: {
    name:         'deepseek',
    baseUrl:      'https://api.deepseek.com',
    apiKeyEnv:    'DEEPSEEK_API_KEY',
    // "deepseek-chat" se deprecha 2026-07-24 15:59 UTC (mapea a modo
    // no-thinking de deepseek-v4-flash) -- usar el nombre nuevo directamente.
    defaultModel: 'deepseek-v4-flash',
    // No verificado contra fuente oficial si DeepSeek migro a
    // max_completion_tokens (limite de uso de API alcanzado) -- se asume
    // que sigue con el formato clasico max_tokens hasta confirmar lo contrario.
    maxTokensParam: 'max_tokens',
  },
  kimi: {
    name:         'kimi',
    baseUrl:      'https://api.moonshot.ai',
    apiKeyEnv:    'KIMI_API_KEY',
    // La serie moonshot-v1 cierra a nuevos usuarios y sunset completo
    // 2026-08-31 -- kimi-k3 (2026-07-16, 1M contexto) es el flagship vigente.
    defaultModel: 'kimi-k3',
    // No verificado contra fuente oficial (mismo motivo que deepseek) --
    // se asume formato clasico max_tokens hasta confirmar lo contrario.
    maxTokensParam: 'max_tokens',
  },
});

/**
 * Construye el body JSON de la peticion de chat completions.
 *
 * El nombre del parametro de limite de tokens de salida varia por proveedor
 * (providerConfig.maxTokensParam, default 'max_tokens'): confirmado en vivo
 * (2026-07-22) que la API de OpenAI actual RECHAZA la peticion por completo
 * si recibe max_tokens ("Unsupported parameter"), no solo lo ignora -- por
 * eso no se envian ambos nombres a la vez, hay que usar el correcto segun
 * el proveedor real.
 *
 * options.forzarJSON + providerConfig.soportaJSONMode activa
 * response_format:{type:"json_object"} -- solo para proveedores donde se
 * confirmo explicitamente que lo soportan (evita fallar la llamada en
 * proveedores no verificados que podrian no reconocer el parametro).
 *
 * options.system antepone un mensaje {role:"system", content} al array
 * messages -- regresion real detectada en vivo (2026-07-22): este adapter
 * nunca uso options.system, cualquier llamada con system prompt (ej.
 * CrossVerifier.js, SubagentGrader.js) lo perdia silenciosamente sin error,
 * ademas de romper response_format:json_object (OpenAI exige que la
 * palabra "json" aparezca en algun mensaje para aceptar ese parametro).
 *
 * @param {Array}  messages - formato Messages API
 * @param {Object} options - { model, max_tokens, forzarJSON, system }
 * @param {Object} providerConfig - { defaultModel, maxTokensParam, soportaJSONMode }
 * @returns {string} body JSON serializado
 */
function construirBodyOpenAICompat(messages, options = {}, providerConfig = {}) {
  const model          = options.model || providerConfig.defaultModel || 'gpt-5.6-luna';
  const maxOut         = options.max_tokens || 1024;
  const maxTokensParam = providerConfig.maxTokensParam || 'max_tokens';

  const mensajesFinales = options.system
    ? [{ role: 'system', content: options.system }, ...messages]
    : messages;

  const body = {
    model,
    messages: mensajesFinales,
    [maxTokensParam]: maxOut,
    stream: false,
  };

  if (options.forzarJSON && providerConfig.soportaJSONMode) {
    body.response_format = { type: 'json_object' };
  }

  return JSON.stringify(body);
}

async function chatOpenAICompat(messages, options = {}, providerConfig = {}) {
  const https = require('https');

  const baseUrl = providerConfig.baseUrl || 'https://api.openai.com';
  const apiKey  = providerConfig.apiKey  || process.env.OPENAI_API_KEY || '';
  const model   = options.model || providerConfig.defaultModel || 'gpt-5.6-luna';

  const body = construirBodyOpenAICompat(messages, options, providerConfig);

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

module.exports = { chatOpenAICompat, PROVIDER_CONFIGS, construirBodyOpenAICompat };
