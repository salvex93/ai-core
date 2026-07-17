'use strict';

/**
 * ModelRegistry — Capa de abstraccion multi-proveedor de IA.
 *
 * Patron Adapter: interfaz unica chat() independiente del proveedor.
 * Agregar un proveedor nuevo = agregar un adapter. Sin modificar la logica de routing.
 *
 * Proveedores soportados (nombres de modelo vigentes a 2026-07-17, ver
 * PROVIDER_CONFIGS y los comentarios junto a cada defaultModel para el
 * detalle de deprecaciones y fecha de verificacion):
 *   anthropic  — Claude Haiku 4.5 / Sonnet 5 / Opus 4.8 / Fable 5 via @anthropic-ai/sdk
 *   gemini     — Gemini 3.5 Flash / 3.1 Pro / 3.1 Flash-Lite via @google/generative-ai
 *   openai     — GPT-5.6 (Sol/Terra/Luna) via openai-compatible HTTP
 *   deepseek   — DeepSeek V4 (Flash/Pro) via openai-compatible HTTP (api.deepseek.com)
 *   kimi       — Kimi K3 via openai-compatible HTTP (api.moonshot.ai)
 */

const fs   = require('fs');
const path = require('path');

// Carga .env desde la raiz del proyecto
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// Interfaz de respuesta normalizada
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ModelResponse
 * @property {string} content  — texto de la respuesta
 * @property {string} provider — proveedor usado (anthropic|gemini|openai|deepseek|kimi)
 * @property {string} model    — modelo concreto usado
 * @property {Object} usage    — { input_tokens, output_tokens }
 */

// ---------------------------------------------------------------------------
// Adapter: Anthropic
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Adapter: Gemini
// ---------------------------------------------------------------------------

async function chatGemini(messages, options = {}) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  // gemini-3.5-flash: default vigente a julio 2026 -- Google lo promovio a
  // default de Gemini Enterprise por su balance velocidad/capacidad agentic.
  // Para tareas de alto volumen y bajo costo sin razonamiento complejo,
  // gemini-3.1-flash-lite es mas barato ($0.25/$1.50 vs $1.50/$9 por 1M).
  const model   = options.model || 'gemini-3.5-flash';
  const genModel = genAI.getGenerativeModel({ model });

  // Convertir formato Messages API → Gemini contents
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemInstruction = messages.find(m => m.role === 'system')?.content;
  if (systemInstruction) {
    genModel.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const result = await genModel.generateContent({ contents });
  const text   = result.response.text();

  return {
    content:  text,
    provider: 'gemini',
    model,
    usage: {
      input_tokens:  result.response.usageMetadata?.promptTokenCount  || 0,
      output_tokens: result.response.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Adapter generico OpenAI-compatible (OpenAI, DeepSeek, Kimi)
// ---------------------------------------------------------------------------

async function chatOpenAICompat(messages, options = {}, providerConfig = {}) {
  const https = require('https');

  const baseUrl = providerConfig.baseUrl || 'https://api.openai.com';
  const apiKey  = providerConfig.apiKey  || process.env.OPENAI_API_KEY || '';
  // gpt-4o-mini fue retirado (GPT-4o discontinuado febrero 2026). Fallback
  // final aqui usa el tier mas barato de GPT-5.6 (Luna, $1/$6 por 1M) via
  // providerConfig.defaultModel de cada proveedor OpenAI-compatible abajo.
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

// ---------------------------------------------------------------------------
// Configuraciones de proveedores OpenAI-compatible
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/**
 * Envia mensajes al proveedor especificado y retorna una respuesta normalizada.
 *
 * @param {string} provider  — 'anthropic' | 'gemini' | 'openai' | 'deepseek' | 'kimi'
 * @param {Array}  messages  — array en formato Messages API: [{role, content}]
 * @param {Object} options   — { model, max_tokens, system }
 * @returns {Promise<ModelResponse>}
 */
async function chat(provider, messages, options = {}) {
  loadEnv();

  switch (provider) {
    case 'anthropic':
      return chatAnthropic(messages, options);

    case 'gemini':
      return chatGemini(messages, options);

    case 'openai':
    case 'deepseek':
    case 'kimi': {
      const cfg = PROVIDER_CONFIGS[provider];
      const apiKey = process.env[cfg.apiKeyEnv] || '';
      if (!apiKey) throw new Error(`${cfg.apiKeyEnv} no configurada en .env`);
      return chatOpenAICompat(messages, options, { ...cfg, apiKey });
    }

    default:
      throw new Error(`Proveedor desconocido: "${provider}". Validos: anthropic, gemini, openai, deepseek, kimi`);
  }
}

/**
 * Lista los proveedores disponibles segun las API keys configuradas en .env.
 * No lanza error — solo informa cuales estan listos para usar.
 *
 * @returns {Array<{provider: string, available: boolean, reason?: string}>}
 */
function listProviders() {
  loadEnv();
  return [
    {
      provider:  'gemini',
      available: !!process.env.GEMINI_API_KEY,
      reason:    process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY configurada' : 'Falta GEMINI_API_KEY en .env',
      tier:      'free',
    },
    {
      provider:  'anthropic',
      available: !!process.env.ANTHROPIC_API_KEY,
      reason:    process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY configurada' : 'Falta ANTHROPIC_API_KEY en .env',
      tier:      'paid',
    },
    {
      provider:  'openai',
      available: !!process.env.OPENAI_API_KEY,
      reason:    process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY configurada' : 'Falta OPENAI_API_KEY en .env',
      tier:      'paid',
    },
    {
      provider:  'deepseek',
      available: !!process.env.DEEPSEEK_API_KEY,
      reason:    process.env.DEEPSEEK_API_KEY ? 'DEEPSEEK_API_KEY configurada' : 'Falta DEEPSEEK_API_KEY en .env',
      tier:      'paid',
    },
    {
      provider:  'kimi',
      available: !!process.env.KIMI_API_KEY,
      reason:    process.env.KIMI_API_KEY ? 'KIMI_API_KEY configurada' : 'Falta KIMI_API_KEY en .env',
      tier:      'paid',
    },
  ];
}

// ---------------------------------------------------------------------------
// Validacion de calidad de output — fail-closed ante JSON invalido
// ---------------------------------------------------------------------------

/**
 * Parsea un output de modelo que se espera sea JSON, fallando cerrado
 * (retorna null) si el contenido no es JSON valido en vez de asumir que el
 * output esta bien solo porque el proveedor respondio 200 OK. Un proveedor
 * puede completar la llamada exitosamente y aun asi devolver contenido vacio,
 * truncado o mal formado — este helper es el punto unico donde esa distincion
 * se hace, para que cualquier caller (verificadores, parsers de veredicto,
 * futura logica de cascada entre proveedores) la reutilice sin duplicar el
 * intento de parseo + regex de extraccion.
 *
 * @param {string} texto - contenido crudo de la respuesta del modelo
 * @returns {object|null} el objeto parseado, o null si no es JSON valido
 */
function parsearJSONFailClosed(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return null;
  try {
    const match = texto.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : texto);
  } catch {
    return null;
  }
}

module.exports = { chat, listProviders, PROVIDER_CONFIGS, parsearJSONFailClosed };
