#!/usr/bin/env node
/**
 * gemini-bridge.js — Router de Analisis LLM con Fallback Inteligente
 *
 * Por que: delegar lecturas documentales masivas a modelos de bajo costo evita saturar
 * el context window del agente principal (Regla 9). Este bridge implementa un patron
 * de fallback en dos niveles:
 *   Nivel 1 — Gemini 2.5 Flash (gratuito, alta capacidad de contexto)
 *   Nivel 2 — Claude Haiku    (economico, confiable) cuando Gemini agota su cuota
 *
 * El agente principal consume el output sintetizado (JSON o Markdown estricto)
 * sin importar cual modelo proceso la solicitud. La capa de enrutamiento es transparente.
 * El campo metadatos.modelo en el JSON de respuesta indica el modelo real que respondio.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// --- Parseo de argumentos CLI sin dependencias adicionales ---
function parseArgs(argv) {
  const args = { format: 'json', model: 'gemini-2.5-flash', haikuFallback: true };
  for (let i = 2; i < argv.length; i++) {
    if ((argv[i] === '--mission' || argv[i] === '-m') && argv[i + 1]) {
      args.mission = argv[++i];
    } else if ((argv[i] === '--file' || argv[i] === '-f') && argv[i + 1]) {
      args.file = argv[++i];
    } else if (argv[i] === '--format' && argv[i + 1]) {
      args.format = argv[++i];
    } else if (argv[i] === '--model' && argv[i + 1]) {
      args.model = argv[++i];
    } else if (argv[i] === '--no-haiku-fallback') {
      // Por que: permite deshabilitar el fallback en entornos donde el costo
      // de Haiku no esta presupuestado o la tarea es exclusiva del Bridge gratuito.
      args.haikuFallback = false;
    }
  }
  return args;
}

// --- Deteccion de error de cuota (Gemini API) ---
// Por que: distinguir cuota agotada de errores tecnicos permite al bridge
// activar el fallback a Haiku solo cuando tiene sentido, sin enmascarar
// errores de configuracion que requieren intervencion humana.
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

// --- Schema de respuesta JSON esperado ---
// El especialista-rag puede ampliar este schema en su Orden de Mision.
const JSON_SCHEMA_EXAMPLE = {
  resumen: '<sintesis ejecutiva en 3-5 oraciones>',
  hallazgos_clave: ['<hallazgo 1>', '<hallazgo 2>'],
  recomendaciones: ['<recomendacion 1>', '<recomendacion 2>'],
  advertencias: ['<advertencia critica, omitir array si no hay>'],
  metadatos: {
    archivo_analizado: '<nombre del archivo>',
    modelo: '<id del modelo que proceso la solicitud — inyectado por el bridge>',
    timestamp: '<ISO 8601 — inyectado por el bridge>',
  },
};

// --- Schema Markdown esperado ---
const MARKDOWN_SCHEMA = `## Resumen\n<sintesis>\n\n## Hallazgos Clave\n- item\n\n## Recomendaciones\n- item\n\n## Advertencias\n- item (omitir seccion si no hay)`;

// --- Construccion del prompt (identico para Gemini y Haiku) ---
// Por que: usar el mismo prompt garantiza resultados comparables entre modelos
// y hace el fallback transparente para el agente principal.
function buildPrompt(mission, filePath, fileContent, isJson) {
  const schemaBlock       = isJson
    ? JSON.stringify(JSON_SCHEMA_EXAMPLE, null, 2)
    : MARKDOWN_SCHEMA;
  const formatInstruction = isJson
    ? 'Responde UNICAMENTE con un objeto JSON valido. Sin markdown fence, sin texto adicional fuera del JSON.'
    : 'Responde UNICAMENTE en Markdown estricto. Sin texto introductorio ni conclusivo fuera del Markdown.';

  return `Eres el Gemini Bridge, un sub-agente de analisis documental de alta precision.
Tu funcion es sintetizar el contenido de archivos para reducir la carga del context window del agente principal.

Orden de Mision:
${mission}

${formatInstruction}

Schema de respuesta requerido (${isJson ? 'JSON' : 'Markdown'}):
${schemaBlock}

Archivo analizado: ${path.basename(filePath)}

Contenido:
---
${fileContent}
---`;
}

// --- Extraccion, validacion e inyeccion de metadatos ---
// Por que: el bridge es la fuente de verdad sobre que modelo proceso la solicitud.
// Inyectar modelo y timestamp aqui garantiza que el agente principal siempre
// sepa el origen del analisis, incluso si el modelo omitio ese campo.
function extractOutput(raw, isJson, modelUsed) {
  if (isJson) {
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr    = fenceMatch ? fenceMatch[1].trim() : raw;
    const parsed     = JSON.parse(jsonStr); // lanza SyntaxError si el output no es JSON valido
    if (parsed.metadatos) {
      parsed.metadatos.modelo    = modelUsed;
      parsed.metadatos.timestamp = new Date().toISOString();
    }
    return JSON.stringify(parsed, null, 2);
  }
  return raw;
}

// --- Nivel 1: Llamada a Gemini ---
async function callGemini(apiKey, modelId, prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelId });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

// --- Nivel 2: Llamada a Claude Haiku ---
// Por que: Haiku tiene un costo por token entre 15x y 20x menor que Sonnet,
// suficiente capacidad de razonamiento para extraccion estructural y sintesis
// de archivos de complejidad baja-media, y usa la misma ANTHROPIC_API_KEY
// que ya esta disponible en el entorno del agente principal.
async function callHaiku(apiKey, prompt) {
  const Anthropic       = require('@anthropic-ai/sdk');
  // Por que: el SDK puede exportar la clase como default (ESM interop) o directamente (CJS).
  const AnthropicClient = Anthropic.default || Anthropic;
  const client          = new AnthropicClient({ apiKey });
  const message         = await client.messages.create({
    model     : 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages  : [{ role: 'user', content: prompt }],
  });
  return message.content[0].text.trim();
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.mission || !args.file) {
    process.stderr.write(
      [
        'Uso:',
        '  node scripts/gemini-bridge.js --mission "<orden>" --file <ruta>',
        '  Flags opcionales:',
        '    --format             json|markdown          (default: json)',
        '    --model              <gemini-model-id>      (default: gemini-2.5-flash)',
        '    --no-haiku-fallback  deshabilitar fallback a Haiku si Gemini falla por cuota',
        '',
      ].join('\n')
    );
    process.exit(1);
  }

  const filePath = path.resolve(args.file);
  if (!fs.existsSync(filePath)) {
    process.stderr.write(`[Error] Archivo no encontrado: ${filePath}\n`);
    process.exit(1);
  }

  const geminiKey    = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const fileContent  = fs.readFileSync(filePath, 'utf8');
  const isJson       = args.format === 'json';
  const prompt       = buildPrompt(args.mission, filePath, fileContent, isJson);
  const HAIKU_MODEL  = 'claude-haiku-4-5-20251001';

  // === NIVEL 1: Gemini (gratuito, alta capacidad de contexto) ===
  if (geminiKey) {
    try {
      const raw    = await callGemini(geminiKey, args.model, prompt);
      const output = extractOutput(raw, isJson, args.model);
      process.stdout.write(output + '\n');
      return;
    } catch (err) {
      if (isQuotaError(err)) {
        const hasFallback = args.haikuFallback && anthropicKey;
        process.stderr.write(
          `[BRAIN-SYNC DEGRADADO: Gemini cuota agotada. ${
            hasFallback
              ? `Activando fallback a ${HAIKU_MODEL}.`
              : 'Sin fallback disponible — configura ANTHROPIC_API_KEY para activar Haiku.'
          }]\n`
        );
        // continuar hacia el Nivel 2 si hay fallback disponible
      } else {
        // Error tecnico (configuracion, red, JSON invalido): no tiene sentido hacer fallback.
        process.stderr.write(`[Error Gemini Bridge] ${err.message}\n`);
        process.exit(1);
      }
    }
  } else {
    process.stderr.write(
      `[Gemini Bridge] GEMINI_API_KEY no configurada.${
        args.haikuFallback && anthropicKey ? ` Enrutando directamente a ${HAIKU_MODEL}.` : ''
      }\n`
    );
  }

  // === NIVEL 2: Claude Haiku (fallback LLM economico) ===
  if (args.haikuFallback && anthropicKey) {
    try {
      process.stderr.write(`[BRAIN-SYNC FALLBACK: Procesando con ${HAIKU_MODEL}.]\n`);
      const raw    = await callHaiku(anthropicKey, prompt);
      const output = extractOutput(raw, isJson, HAIKU_MODEL);
      process.stdout.write(output + '\n');
      return;
    } catch (err) {
      process.stderr.write(`[Error Haiku Fallback] ${err.message}\n`);
      process.exit(1);
    }
  }

  // === Sin modelos disponibles ===
  process.stderr.write(
    '[Error] Sin modelos LLM disponibles para el analisis documental.\n' +
    'Configura al menos una de las siguientes variables en el .env:\n' +
    '  GEMINI_API_KEY     — para usar Gemini 2.5 Flash (gratuito)\n' +
    '  ANTHROPIC_API_KEY  — para usar Claude Haiku (economico, fallback)\n'
  );
  process.exit(2);
}

main();
