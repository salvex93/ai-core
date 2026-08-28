'use strict';

/**
 * Adapter Gemini — Gemini 3.7 Flash / 3.1 Pro / 3.5 Flash-Lite via @google/genai
 * (SDK unificado vigente, verificado 2026-08-03 — @google/generative-ai esta
 * oficialmente deprecado por Google, repo renombrado a deprecated-generative-ai-js).
 */

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

  const result = await ai.models.generateContent({
    model,
    contents,
    ...(systemInstruction && { config: { systemInstruction } }),
  });

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
