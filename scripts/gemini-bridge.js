#!/usr/bin/env node
/**
 * gemini-bridge.js — LLM Routing Bridge (Gemini)
 *
 * Delegado de analisis documental para corpus > 500 lineas / 50 KB.
 * Externaliza la lectura de archivos grandes fuera del context window del agente principal.
 *
 * Requiere: GEMINI_API_KEY en el .env del proyecto anfitrion.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Carga .env desde la raiz del proyecto si la key no esta en el entorno
(function loadEnv() {
  if (process.env.GEMINI_API_KEY) return;
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (!m) continue;
    process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
})();

const GEMINI_DEFAULT = 'gemini-1.5-flash';

// --- Parseo de argumentos CLI ---
function parseArgs(argv) {
  const args = { format: 'json', geminiModel: GEMINI_DEFAULT };
  for (let i = 2; i < argv.length; i++) {
    if ((argv[i] === '--mission' || argv[i] === '-m') && argv[i + 1]) {
      args.mission = argv[++i];
    } else if ((argv[i] === '--file' || argv[i] === '-f') && argv[i + 1]) {
      args.file = argv[++i];
    } else if (argv[i] === '--format' && argv[i + 1]) {
      args.format = argv[++i];
    } else if (argv[i] === '--model' && argv[i + 1]) {
      args.geminiModel = argv[++i];
    }
  }
  return args;
}

// Distinguir cuota agotada de error tecnico: cuota = reintentar mas tarde; tecnico = notificar y detener.
function isQuotaError(err) {
  const msg    = (err.message || '').toLowerCase();
  const status = err.status || err.statusCode || 0;
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('ratelimitexceeded') ||
    msg.includes('too many requests')
  );
}

// --- Schemas de respuesta ---
const JSON_SCHEMA_EXAMPLE = {
  resumen: '<sintesis ejecutiva en 3-5 oraciones>',
  hallazgos_clave: ['<hallazgo 1>', '<hallazgo 2>'],
  recomendaciones: ['<recomendacion 1>', '<recomendacion 2>'],
  advertencias: ['<advertencia critica, omitir array si no hay>'],
  metadatos: {
    archivo_analizado: '<nombre del archivo>',
    modelo: '<id del modelo — inyectado por el bridge>',
    timestamp: '<ISO 8601 — inyectado por el bridge>',
  },
};

const MARKDOWN_SCHEMA = `## Resumen\n<sintesis>\n\n## Hallazgos Clave\n- item\n\n## Recomendaciones\n- item\n\n## Advertencias\n- item (omitir seccion si no hay)`;

// Sistema estatico: rol, instrucciones de formato, schema. Identico por invocacion.
function buildStaticSystem(isJson) {
  const schemaBlock       = isJson ? JSON.stringify(JSON_SCHEMA_EXAMPLE, null, 2) : MARKDOWN_SCHEMA;
  const formatInstruction = isJson
    ? 'Responde UNICAMENTE con un objeto JSON valido. Sin markdown fence, sin texto adicional fuera del JSON.'
    : 'Responde UNICAMENTE en Markdown estricto. Sin texto introductorio ni conclusivo fuera del Markdown.';

  return `Eres el LLM Routing Bridge, un sub-agente de analisis documental de alta precision.
Tu funcion es sintetizar el contenido de archivos para reducir la carga del context window del agente principal.

${formatInstruction}

Schema de respuesta requerido (${isJson ? 'JSON' : 'Markdown'}):
${schemaBlock}`;
}

// Parte dinamica: cambia por invocacion (mision, archivo, contenido).
function buildUserMessage(mission, filePath, fileContent) {
  return `Orden de Mision:
${mission}

Archivo analizado: ${path.basename(filePath)}

Contenido:
---
${fileContent}
---`;
}

function buildGeminiPrompt(mission, filePath, fileContent, isJson) {
  return `${buildStaticSystem(isJson)}\n\n${buildUserMessage(mission, filePath, fileContent)}`;
}

// Inyectar modelo y timestamp en metadatos para trazabilidad del agente principal.
function extractOutput(raw, isJson, modelUsed) {
  if (isJson) {
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr    = fenceMatch ? fenceMatch[1].trim() : raw;
    const parsed     = JSON.parse(jsonStr);
    if (parsed.metadatos) {
      parsed.metadatos.modelo    = modelUsed;
      parsed.metadatos.timestamp = new Date().toISOString();
    }
    return JSON.stringify(parsed, null, 2);
  }
  return raw;
}

// --- Gemini ---
async function callGemini(apiKey, modelId, prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI  = new GoogleGenerativeAI(apiKey);
  const model  = genAI.getGenerativeModel({ model: modelId });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.mission || !args.file) {
    process.stderr.write(
      [
        'Uso:',
        '  node scripts/gemini-bridge.js --mission "<orden>" --file <ruta>',
        'Flags opcionales:',
        '  --format  json|markdown  (default: json)',
        '  --model   <gemini-id>    (default: gemini-1.5-flash)',
        '',
        'Requiere GEMINI_API_KEY en el .env del proyecto anfitrion.',
        '',
      ].join('\n')
    );
    process.exit(1);
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    process.stderr.write(
      '[LLM Bridge] GEMINI_API_KEY no configurada.\n' +
      'Agrega GEMINI_API_KEY al .env del proyecto anfitrion para activar el bridge.\n'
    );
    process.exit(2);
  }

  const filePath = path.resolve(args.file);
  if (!fs.existsSync(filePath)) {
    process.stderr.write(`[Error] Archivo no encontrado: ${filePath}\n`);
    process.exit(1);
  }

  const fileContent  = fs.readFileSync(filePath, 'utf8');
  const isJson       = args.format === 'json';
  const geminiPrompt = buildGeminiPrompt(args.mission, filePath, fileContent, isJson);

  process.stderr.write(
    `[LLM Bridge] Gemini ${args.geminiModel} — ${fileContent.length.toLocaleString()} chars.\n`
  );

  try {
    const raw    = await callGemini(geminiKey, args.geminiModel, geminiPrompt);
    const output = extractOutput(raw, isJson, args.geminiModel);
    process.stdout.write(output + '\n');
  } catch (err) {
    if (isQuotaError(err)) {
      process.stderr.write(
        `[Error LLM Bridge] Cuota Gemini agotada: ${err.message}\n` +
        'Limites free tier: 15 RPM / 1M TPM. Espera a que se restablezca el limite.\n'
      );
      process.exit(2);
    }
    process.stderr.write(`[Error LLM Bridge] ${err.message}\n`);
    process.exit(1);
  }
}

main();
