'use strict';

/**
 * GeminiApiClient — Cliente HTTP/SDK puro para Gemini, sin conocimiento del
 * protocolo MCP. Extraido de mcp-gemini.js (SRP): este modulo solo sabe
 * hablar con el SDK de Gemini (auth, reintentos, parseo de JSON, compactado
 * de respuestas largas) — no sabe de JSON-RPC, stdio ni de las herramientas
 * especificas que lo consumen.
 */

const fs   = require('fs');
const path = require('path');

const GEMINI_DEFAULT      = 'gemini-3.5-flash';
const MAX_RETRIES         = 2;
const COMPACT_TOKEN_LIMIT = 1125; // ~1.500 tokens (1 token ≈ 0.75 palabras) — alineado con limite de output declarado en CLAUDE.md
const MAX_COMPACT_ROUNDS  = 2;

// Carga .env desde la raiz del proyecto (un nivel arriba de /scripts)
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

// Lazy-load del SDK — disponible en el primer getModel, no en el import
let GoogleGenerativeAI;
function getGenAI() {
  if (!GoogleGenerativeAI) {
    ({ GoogleGenerativeAI } = require('@google/generative-ai'));
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada en .env');
  return new GoogleGenerativeAI(apiKey);
}

function getModel(opts = {}) {
  return getGenAI().getGenerativeModel({ model: GEMINI_DEFAULT, ...opts });
}

// Rechaza respuestas que son negativas de Gemini o no tienen contenido real.
function isRefusal(text) {
  const lower = text.toLowerCase();
  return (
    lower.includes('lo siento') ||
    lower.includes('no puedo') ||
    lower.includes('i cannot') ||
    lower.startsWith('sorry') ||
    lower.includes('error de api')
  );
}

// Verifica que los campos obligatorios tienen contenido util.
function validateFields(parsed) {
  const required = ['resumen', 'hallazgos_clave', 'recomendaciones', 'advertencias'];
  const warnings = [];
  for (const field of required) {
    if (!(field in parsed)) {
      parsed[field] = (field === 'resumen') ? '' : [];
      warnings.push(`Campo '${field}' ausente — normalizado a vacio`);
    }
  }
  if (!parsed.resumen || parsed.resumen.length < 20) {
    warnings.push('resumen demasiado corto — respuesta potencialmente incompleta');
  }
  if (!Array.isArray(parsed.hallazgos_clave) || parsed.hallazgos_clave.length === 0) {
    warnings.push('hallazgos_clave vacio — Gemini no extrajo hallazgos');
  }
  return { parsed, warnings };
}

// Extrae JSON de la respuesta, tolerando markdown fences.
function extractJson(raw) {
  if (isRefusal(raw)) throw new Error(`Gemini rechazo la solicitud: ${raw.slice(0, 120)}`);
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fence ? fence[1].trim() : raw);
}

// Llama al modelo con reintentos ante fallos de parseo JSON.
async function callWithRetry(model, userMessage) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(userMessage);
      const raw    = result.response.text().trim();
      const raw_parsed = extractJson(raw);
      const { parsed, warnings } = validateFields(raw_parsed);
      return { parsed, warnings };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError;
}

// Estima palabras en un objeto serializado — proxy barato de tokens.
function wordCount(obj) {
  return JSON.stringify(obj).split(/\s+/).length;
}

// Recompacta una respuesta si supera COMPACT_TOKEN_LIMIT palabras.
// Itera hasta MAX_COMPACT_ROUNDS veces para garantizar output compacto.
async function compactarSiNecesario(parsed, modelo) {
  const SYSTEM_COMPACT = `Eres un compresor de informacion tecnica. Recibiras un JSON de analisis y debes reducirlo al minimo sin perder datos criticos. Responde UNICAMENTE con JSON valido con el mismo schema.`;

  let current      = parsed;
  let rondas       = 0;
  const palabrasOrig = wordCount(parsed);

  while (wordCount(current) > COMPACT_TOKEN_LIMIT && rondas < MAX_COMPACT_ROUNDS) {
    try {
      const model  = getModel({ systemInstruction: SYSTEM_COMPACT });
      const msg    = `Compacta este JSON manteniendo los datos tecnicamente relevantes:\n${JSON.stringify(current)}`;
      const result = await model.generateContent(msg);
      const raw    = result.response.text().trim();
      current      = extractJson(raw);
      rondas++;
    } catch (_) {
      break;
    }
  }

  const compactado = rondas > 0;
  return {
    ...current,
    _ia_activa: modelo,
    ...(compactado && { _compactado: true, _rondas_compactacion: rondas, _palabras_originales: palabrasOrig }),
  };
}

module.exports = {
  GEMINI_DEFAULT,
  loadEnv,
  getModel,
  isRefusal,
  extractJson,
  callWithRetry,
  compactarSiNecesario,
};
