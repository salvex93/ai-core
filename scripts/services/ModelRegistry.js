'use strict';

/**
 * ModelRegistry — Capa de abstraccion multi-proveedor de IA.
 *
 * Patron Adapter: interfaz unica chat() independiente del proveedor.
 * Agregar un proveedor nuevo = agregar un adapter en scripts/services/model-adapters/.
 * Sin modificar la logica de routing.
 *
 * Proveedores soportados (nombres de modelo vigentes a 2026-07-17, ver
 * cada adapter para el detalle de deprecaciones y fecha de verificacion):
 *   anthropic  — Claude Haiku 4.5 / Sonnet 5 / Opus 4.8 / Fable 5 via @anthropic-ai/sdk
 *   gemini     — Gemini 3.5 Flash / 3.1 Pro / 3.1 Flash-Lite via @google/generative-ai
 *   openai     — GPT-5.6 (Sol/Terra/Luna) via openai-compatible HTTP
 *   deepseek   — DeepSeek V4 (Flash/Pro) via openai-compatible HTTP (api.deepseek.com)
 *   kimi       — Kimi K3 via openai-compatible HTTP (api.moonshot.ai)
 */

const fs   = require('fs');
const path = require('path');

const { chatAnthropic } = require('./model-adapters/AnthropicAdapter');
const { chatGemini } = require('./model-adapters/GeminiAdapter');
const { chatOpenAICompat, PROVIDER_CONFIGS } = require('./model-adapters/OpenAICompatAdapter');

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
