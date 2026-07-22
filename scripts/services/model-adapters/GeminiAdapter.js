'use strict';

/**
 * Adapter Gemini — Gemini 3.5 Flash / 3.1 Pro / 3.1 Flash-Lite via @google/generative-ai.
 */

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

module.exports = { chatGemini };
