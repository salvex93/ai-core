'use strict';

/**
 * Adapter Gemini — Gemini 3.7 Flash / 3.1 Pro / 3.5 Flash-Lite via @google/genai
 * (SDK unificado vigente, verificado 2026-08-03 — @google/generative-ai esta
 * oficialmente deprecado por Google, repo renombrado a deprecated-generative-ai-js).
 */

// Mismo timeout real que GeminiApiClient.js (confirmado en produccion
// 2026-09-01: @google/genai puede quedarse sin resolver ni rechazar
// indefinidamente pese a que la misma llamada via REST directo responde en
// segundos). Override via AI_CORE_GEMINI_TIMEOUT_MS solo para tests.
const GEMINI_TIMEOUT_MS = Number(process.env.AI_CORE_GEMINI_TIMEOUT_MS) || 30_000;

async function chatGemini(messages, options = {}) {
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // gemini-3.7-flash: default vigente 2026-08-28 (verificado contra
  // ai.google.dev/gemini-api/docs/models y /pricing) -- reemplaza a 3.6-flash
  // como Flash mas reciente, mejor pricing pagado ($0.75/$3.75 vs $1.50/$7.50
  // por 1M, tier standard hasta 2026-12-31), mismo free tier. 3.6-flash sigue
  // Stable (no deprecado). Para tareas de alto volumen y bajo costo sin
  // razonamiento complejo, gemini-3.5-flash-lite es mas barato ($0.30/$2.50 por 1M).
  const model = options.model || 'gemini-3.7-flash';

  // Convertir formato Messages API → contents del SDK unificado
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemInstruction = messages.find(m => m.role === 'system')?.content;

  // Promise.race independiente del SDK: si @google/genai se cuelga sin
  // resolver NI rechazar, un abortSignal por si solo no basta -- depende de
  // que el SDK coopere escuchandolo, y ese es precisamente el fallo
  // observado. El timer rechaza por su cuenta sin importar que haga la
  // promesa de generateContent().
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Gemini no respondio en ${GEMINI_TIMEOUT_MS / 1000}s (timeout real, no de la API -- ver GEMINI_TIMEOUT_MS en GeminiAdapter.js)`));
    }, GEMINI_TIMEOUT_MS);
  });

  let result;
  try {
    result = await Promise.race([
      ai.models.generateContent({
        model,
        contents,
        ...(systemInstruction && { config: { systemInstruction } }),
      }),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }

  return {
    content:  result.text,
    provider: 'gemini',
    model,
    usage: {
      input_tokens:  result.usageMetadata?.promptTokenCount     || 0,
      output_tokens: result.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

module.exports = { chatGemini };
