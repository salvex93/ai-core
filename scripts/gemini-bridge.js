#!/usr/bin/env node
/**
 * gemini-bridge.js — LLM Routing Bridge (Router de Analisis Documental en Cascada)
 *
 * Arquitectura de enrutamiento por tamano de archivo:
 *
 *   NIVEL 1 — Claude Haiku (primario, archivos <= 600K chars / ~150K tokens)
 *     Alta disponibilidad, costo 15-20x menor que Sonnet, sin cuota gratuita que se agote.
 *     Cubre el 95%+ de los archivos que llegan al bridge.
 *
 *   NIVEL 2 — Gemini 2.5 Flash (archivos masivos > 600K chars)
 *     Activado solo cuando el archivo supera el limite practico de Haiku (200K tokens).
 *     Su ventana de 1M tokens es necesaria para corpus verdaderamente masivos.
 *     Si Gemini agota su cuota, el bridge intenta Haiku como ultima contingencia
 *     (con advertencia de que el resultado puede ser parcial en archivos muy grandes).
 *
 * El agente principal consume el output sintetizado (JSON o Markdown estricto)
 * sin importar que nivel proceso la solicitud. El campo metadatos.modelo lo indica.
 *
 * Por que esta arquitectura:
 *   El problema anterior era que Gemini (gratuito, cuota limitada) era el Nivel 1,
 *   lo que causaba que Sonnet absorbiera la carga cuando la cuota se agotaba durante
 *   sesiones intensas. Haiku como Nivel 1 es confiable, economico y sin cuotas.
 *   Gemini preserva su cuota para cuando realmente importa: archivos masivos.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Por que 600K caracteres:
// Haiku tiene 200K tokens de contexto. 1 token ≈ 4 caracteres (texto tecnico UTF-8).
// Con overhead del prompt (~3K tokens) y respuesta (~4K tokens), quedan ~193K tokens
// de presupuesto para contenido del archivo, equivalente a ~772K caracteres.
// Se usa 600K como umbral conservador con margen del 22% de seguridad.
const HAIKU_CHAR_LIMIT = 600_000;
const HAIKU_MODEL      = 'claude-haiku-4-5-20251001';
const GEMINI_DEFAULT   = 'gemini-2.5-flash';

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
      // --model controla el modelo de Gemini (Nivel 2). Haiku es siempre el mismo.
      args.geminiModel = argv[++i];
    }
  }
  return args;
}

// --- Deteccion de error de cuota en Gemini ---
// Por que: distinguir cuota agotada de error tecnico determina si tiene sentido
// intentar la contingencia Haiku o abortar con un error de configuracion.
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
    modelo: '<id del modelo que proceso la solicitud — inyectado por el bridge>',
    timestamp: '<ISO 8601 — inyectado por el bridge>',
  },
};

const MARKDOWN_SCHEMA = `## Resumen\n<sintesis>\n\n## Hallazgos Clave\n- item\n\n## Recomendaciones\n- item\n\n## Advertencias\n- item (omitir seccion si no hay)`;

// --- Construccion del prompt (identico para Haiku y Gemini) ---
// Por que: el mismo prompt garantiza resultados comparables entre niveles
// y hace el enrutamiento transparente para el agente principal.
function buildPrompt(mission, filePath, fileContent, isJson) {
  const schemaBlock       = isJson
    ? JSON.stringify(JSON_SCHEMA_EXAMPLE, null, 2)
    : MARKDOWN_SCHEMA;
  const formatInstruction = isJson
    ? 'Responde UNICAMENTE con un objeto JSON valido. Sin markdown fence, sin texto adicional fuera del JSON.'
    : 'Responde UNICAMENTE en Markdown estricto. Sin texto introductorio ni conclusivo fuera del Markdown.';

  return `Eres el LLM Routing Bridge, un sub-agente de analisis documental de alta precision.
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
// Inyectar modelo y timestamp garantiza trazabilidad aunque el modelo omita el campo.
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

// --- Nivel 1: Claude Haiku ---
async function callHaiku(apiKey, prompt) {
  const Anthropic       = require('@anthropic-ai/sdk');
  const AnthropicClient = Anthropic.default || Anthropic;
  const client          = new AnthropicClient({ apiKey });
  const message         = await client.messages.create({
    model     : HAIKU_MODEL,
    max_tokens: 4096,
    messages  : [{ role: 'user', content: prompt }],
  });
  return message.content[0].text.trim();
}

// --- Nivel 2: Gemini ---
async function callGemini(apiKey, modelId, prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelId });
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
        '  Flags opcionales:',
        '    --format  json|markdown   (default: json)',
        '    --model   <gemini-id>     modelo de Gemini para Nivel 2 (default: gemini-2.5-flash)',
        '',
        'Enrutamiento automatico por tamano de archivo:',
        `  <= ${HAIKU_CHAR_LIMIT.toLocaleString()} chars  ->  Nivel 1: ${HAIKU_MODEL} (ANTHROPIC_API_KEY)`,
        `  >  ${HAIKU_CHAR_LIMIT.toLocaleString()} chars  ->  Nivel 2: Gemini           (GEMINI_API_KEY)`,
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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey    = process.env.GEMINI_API_KEY;
  const fileContent  = fs.readFileSync(filePath, 'utf8');
  const isJson       = args.format === 'json';
  const prompt       = buildPrompt(args.mission, filePath, fileContent, isJson);
  const fileSize     = fileContent.length;
  const isMassive    = fileSize > HAIKU_CHAR_LIMIT;

  // =====================================================================
  // NIVEL 1 — Claude Haiku (primario, archivos de tamano estandar)
  // =====================================================================
  if (!isMassive) {
    if (anthropicKey) {
      try {
        process.stderr.write(`[LLM Bridge] Nivel 1: ${HAIKU_MODEL} (${fileSize.toLocaleString()} chars).\n`);
        const raw    = await callHaiku(anthropicKey, prompt);
        const output = extractOutput(raw, isJson, HAIKU_MODEL);
        process.stdout.write(output + '\n');
        return;
      } catch (err) {
        process.stderr.write(`[Error LLM Bridge - Nivel 1] ${err.message}\n`);
        if (geminiKey) {
          process.stderr.write('[LLM Bridge] Haiku no disponible. Degradando a Gemini como contingencia.\n');
          // continuar hacia Gemini
        } else {
          process.exit(1);
        }
      }
    } else {
      // Sin ANTHROPIC_API_KEY: degradar a Gemini directamente con advertencia
      process.stderr.write(
        '[LLM Bridge] ANTHROPIC_API_KEY no configurada. Degradando a Gemini.\n' +
        'Configura ANTHROPIC_API_KEY para activar Haiku como Nivel 1 (mas economico y confiable).\n'
      );
    }

    // Contingencia: Gemini para archivos estandar (cuando Haiku no esta disponible)
    if (geminiKey) {
      try {
        const raw    = await callGemini(geminiKey, args.geminiModel, prompt);
        const output = extractOutput(raw, isJson, args.geminiModel);
        process.stdout.write(output + '\n');
        return;
      } catch (err) {
        process.stderr.write(`[Error LLM Bridge - Gemini contingencia] ${err.message}\n`);
        process.exit(1);
      }
    }

    // Sin ningun modelo disponible
    process.stderr.write(
      '[Error] Sin modelos disponibles. Configura ANTHROPIC_API_KEY (recomendado) y/o GEMINI_API_KEY en el .env.\n'
    );
    process.exit(2);
  }

  // =====================================================================
  // NIVEL 2 — Gemini (archivos masivos > 600K chars)
  // =====================================================================
  process.stderr.write(
    `[LLM Bridge] Nivel 2: archivo masivo (${fileSize.toLocaleString()} chars` +
    ` > ${HAIKU_CHAR_LIMIT.toLocaleString()} limite Haiku). Enrutando a Gemini.\n`
  );

  if (geminiKey) {
    try {
      const raw    = await callGemini(geminiKey, args.geminiModel, prompt);
      const output = extractOutput(raw, isJson, args.geminiModel);
      process.stdout.write(output + '\n');
      return;
    } catch (err) {
      if (isQuotaError(err) && anthropicKey) {
        process.stderr.write(
          '[LLM Bridge DEGRADADO: Gemini cuota agotada para archivo masivo. ' +
          'Intentando Haiku como ultima contingencia (resultado puede ser parcial).\n'
        );
        try {
          const raw    = await callHaiku(anthropicKey, prompt);
          const output = extractOutput(raw, isJson, HAIKU_MODEL);
          process.stdout.write(output + '\n');
          return;
        } catch (haikuErr) {
          process.stderr.write(`[Error LLM Bridge - Haiku contingencia masiva] ${haikuErr.message}\n`);
          process.exit(1);
        }
      } else {
        process.stderr.write(`[Error LLM Bridge - Nivel 2] ${err.message}\n`);
        process.exit(isQuotaError(err) ? 2 : 1);
      }
    }
  }

  // Archivo masivo pero sin GEMINI_API_KEY: intentar Haiku de todos modos con advertencia
  if (anthropicKey) {
    process.stderr.write(
      '[LLM Bridge] GEMINI_API_KEY no configurada para archivo masivo. ' +
      `Intentando Haiku (${fileSize.toLocaleString()} chars — resultado puede ser parcial).\n`
    );
    try {
      const raw    = await callHaiku(anthropicKey, prompt);
      const output = extractOutput(raw, isJson, HAIKU_MODEL);
      process.stdout.write(output + '\n');
      return;
    } catch (err) {
      process.stderr.write(`[Error LLM Bridge - Haiku archivo masivo] ${err.message}\n`);
      process.exit(1);
    }
  }

  process.stderr.write(
    '[Error] Archivo masivo sin modelos disponibles. ' +
    'Configura GEMINI_API_KEY para archivos > 600K chars y ANTHROPIC_API_KEY como contingencia.\n'
  );
  process.exit(2);
}

main();
