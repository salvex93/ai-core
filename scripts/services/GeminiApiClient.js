'use strict';

/**
 * GeminiApiClient — Cliente HTTP/SDK puro para Gemini, sin conocimiento del
 * protocolo MCP. Extraido de mcp-gemini.js (SRP): este modulo solo sabe
 * hablar con el SDK de Gemini (auth, reintentos, parseo de JSON, compactado
 * de respuestas largas) — no sabe de JSON-RPC, stdio ni de las herramientas
 * especificas que lo consumen.
 *
 * Prompt caching (evaluado 2026-08-05, sin cambio de codigo -- confirmado
 * contra ai.google.dev/gemini-api/docs/caching): el implicit caching de
 * Gemini es automatico desde 2.5+, no requiere ningun parametro especial,
 * pero exige un minimo de 4096 tokens en el request (Gemini 3.x) para
 * activarse. El contenido real que este modulo envia (archivos/logs a
 * analizar via analizarArchivo/analizarContenido, o el systemInstruction
 * corto de compactarSiNecesario) es variable entre llamadas y normalmente
 * queda por debajo de ese umbral -- no hay contexto fijo y grande que se
 * repita como para beneficiarse de explicit caching (CachedContent). Si en
 * el futuro se agrega un caso de uso con un system prompt grande y estable
 * reutilizado en muchas llamadas, revisar aqui antes de asumir que ya esta
 * cubierto por el caching implicito.
 */

const fs   = require('fs');
const path = require('path');

const GEMINI_DEFAULT      = 'gemini-3.6-flash';
const MAX_RETRIES         = 2;
const COMPACT_TOKEN_LIMIT = 1125; // ~1.500 tokens (1 token ≈ 0.75 palabras) — alineado con limite de output declarado en CLAUDE.md
const MAX_COMPACT_ROUNDS  = 2;

// Parsea contenido estilo .env a pares clave/valor. Separado de loadEnv para
// testear el parseo (incluye CRLF de Windows) sin depender del filesystem.
function parseEnvContent(contenido) {
  const pares = {};
  for (const line of contenido.split(/\r?\n/)) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^['"]|['"]$/g, '');
    pares[key] = val;
  }
  return pares;
}

// Carga .env desde la raiz del proyecto (un nivel arriba de /scripts)
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) return;
  const pares = parseEnvContent(fs.readFileSync(envPath, 'utf8'));
  for (const [key, val] of Object.entries(pares)) {
    if (!process.env[key]) process.env[key] = val;
  }
}

// Lazy-load del SDK — disponible en el primer getModel, no en el import
let GoogleGenAI;
function getGenAI() {
  if (!GoogleGenAI) {
    ({ GoogleGenAI } = require('@google/genai'));
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada en .env');
  return new GoogleGenAI({ apiKey });
}

// Shim de compatibilidad: expone .generateContent(prompt) con la misma forma
// que el SDK viejo (result.response.text(), result.response.candidates) para
// que McpServerHandlers.js no requiera cambios en su capa de consumo.
function getModel(opts = {}) {
  const ai = getGenAI();
  const { model = GEMINI_DEFAULT, systemInstruction, tools } = opts;
  return {
    async generateContent(promptOrMessage) {
      const contents = [{ role: 'user', parts: [{ text: promptOrMessage }] }];
      const config = {
        ...(systemInstruction && { systemInstruction }),
        ...(tools && { tools }),
      };
      const result = await ai.models.generateContent({
        model,
        contents,
        ...(Object.keys(config).length > 0 && { config }),
      });
      return {
        response: {
          text: () => result.text || '',
          candidates: result.candidates,
        },
      };
    },
  };
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
  parseEnvContent,
  getModel,
  isRefusal,
  extractJson,
  callWithRetry,
  compactarSiNecesario,
};
