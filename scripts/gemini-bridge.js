#!/usr/bin/env node
/**
 * gemini-bridge.js — LLM Routing Bridge (Router de Analisis Documental en Cascada)
 *
 * Arquitectura de enrutamiento por tamano de archivo:
 *
 *   NIVEL 1 — Claude Haiku (primario, archivos <= 600K chars / ~150K tokens)
 *     Alta disponibilidad, costo 15-20x menor que Sonnet, sin cuota gratuita que se agote.
 *     Prompt Caching activo: bloques estaticos del sistema se cachean en Anthropic.
 *     Cache hits reducen el costo de tokens de entrada un 70-90% en sesiones multiples.
 *     Cubre el 95%+ de los archivos que llegan al bridge.
 *
 *   NIVEL 2 — Gemini 2.5 Flash (archivos masivos > 600K chars)
 *     Activado solo cuando el archivo supera el limite practico de Haiku (200K tokens).
 *     Su ventana de 1M tokens es necesaria para corpus verdaderamente masivos.
 *     Si Gemini agota su cuota, el bridge intenta Haiku como ultima contingencia
 *     (con advertencia de que el resultado puede ser parcial en archivos muy grandes).
 *
 *   ZONA BORDERLINE (400K-800K chars): Token Counting exacto via /v1/messages/count_tokens.
 *     Archivos en este rango pueden estar justo en el limite de Haiku. El conteo exacto
 *     evita tanto el overflow como el over-routing a Gemini de forma innecesaria.
 *     Fuera de esta zona, el umbral de chars es suficientemente preciso.
 *
 *   MODO BATCH (--batch): Procesa multiples archivos en una sola llamada a la
 *     Messages Batches API de Anthropic. Descuento del 50% sobre precio base.
 *     Procesamiento asincrono con polling hasta completar. Solo para Haiku (Nivel 1).
 *
 * El agente principal consume el output sintetizado (JSON o Markdown estricto)
 * sin importar que nivel proceso la solicitud. El campo metadatos.modelo lo indica.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Por que 600K caracteres:
// Haiku tiene 200K tokens de contexto. 1 token ≈ 4 caracteres (texto tecnico UTF-8).
// Con overhead del prompt (~3K tokens) y respuesta (~4K tokens), quedan ~193K tokens
// de presupuesto para contenido del archivo, equivalente a ~772K caracteres.
// Se usa 600K como umbral conservador con margen del 22% de seguridad.
const HAIKU_CHAR_LIMIT  = 600_000;
const HAIKU_TOKEN_LIMIT = 193_000; // 200K context - 4K respuesta - 3K overhead
const HAIKU_MODEL       = 'claude-haiku-4-5-20251001';
const GEMINI_DEFAULT    = 'gemini-2.5-flash';

// Zona borderline: entre estos limites se usa token counting exacto para la decision.
// Por que estos valores: 400K = 67% del umbral (margen holgado por debajo) —
// cualquier archivo debajo de 400K cabe en Haiku con certeza.
// 800K = 33% por encima del umbral — archivos sobre 800K son claramente masivos.
// Solo el rango intermedio justifica el costo del round-trip de count_tokens.
const BORDERLINE_LOW  = 400_000;
const BORDERLINE_HIGH = 800_000;

// Timeout de polling para modo batch (ms). 24h maxima, default 10 minutos.
const BATCH_POLL_INTERVAL_MS = 5_000;
const BATCH_TIMEOUT_MS       = 10 * 60 * 1_000;

// --- Parseo de argumentos CLI ---
function parseArgs(argv) {
  const args = {
    format     : 'json',
    geminiModel: GEMINI_DEFAULT,
    batch      : false,
    files      : [],  // para modo batch: multiples --file
  };
  for (let i = 2; i < argv.length; i++) {
    if ((argv[i] === '--mission' || argv[i] === '-m') && argv[i + 1]) {
      args.mission = argv[++i];
    } else if ((argv[i] === '--file' || argv[i] === '-f') && argv[i + 1]) {
      const f = argv[++i];
      args.file = f;       // compatibilidad con modo single
      args.files.push(f);  // acumulado para modo batch
    } else if (argv[i] === '--format' && argv[i + 1]) {
      args.format = argv[++i];
    } else if (argv[i] === '--model' && argv[i + 1]) {
      // --model controla el modelo de Gemini (Nivel 2). Haiku es siempre el mismo.
      args.geminiModel = argv[++i];
    } else if (argv[i] === '--batch') {
      // Modo batch: procesa todos los --file en una sola solicitud a la Batches API.
      // 50% descuento sobre precio base. Solo compatible con Haiku (Nivel 1).
      args.batch = true;
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

// --- Construccion del prompt en dos partes para Prompt Caching ---
// Por que separar en sistema vs. usuario:
// El bloque de sistema (rol, instrucciones de formato, schema) es identico en cada
// invocacion del bridge — solo cambia la mision y el contenido del archivo.
// Marcando el sistema con cache_control: ephemeral, Anthropic lo cachea durante 5 minutos.
// En sesiones con multiples llamadas al bridge, los cache hits reducen el costo de
// tokens de entrada entre un 70% y 90% (Anthropic cobra el 10% del precio normal en hits).
function buildStaticSystem(isJson) {
  const schemaBlock       = isJson
    ? JSON.stringify(JSON_SCHEMA_EXAMPLE, null, 2)
    : MARKDOWN_SCHEMA;
  const formatInstruction = isJson
    ? 'Responde UNICAMENTE con un objeto JSON valido. Sin markdown fence, sin texto adicional fuera del JSON.'
    : 'Responde UNICAMENTE en Markdown estricto. Sin texto introductorio ni conclusivo fuera del Markdown.';

  return `Eres el LLM Routing Bridge, un sub-agente de analisis documental de alta precision.
Tu funcion es sintetizar el contenido de archivos para reducir la carga del context window del agente principal.

${formatInstruction}

Schema de respuesta requerido (${isJson ? 'JSON' : 'Markdown'}):
${schemaBlock}`;
}

// La parte dinamica solo contiene lo que cambia por invocacion.
// Separar esta parte del sistema es lo que hace posible el caching del bloque estatico.
function buildUserMessage(mission, filePath, fileContent) {
  return `Orden de Mision:
${mission}

Archivo analizado: ${path.basename(filePath)}

Contenido:
---
${fileContent}
---`;
}

// Prompt combinado para Gemini (sin soporte de caching por la misma API).
function buildGeminiPrompt(mission, filePath, fileContent, isJson) {
  return `${buildStaticSystem(isJson)}\n\n${buildUserMessage(mission, filePath, fileContent)}`;
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

// --- Token Counting exacto para archivos en zona borderline ---
// Por que: archivos entre 400K y 800K chars pueden estar justo en el limite del
// contexto de Haiku. El conteo exacto via /v1/messages/count_tokens evita dos errores:
//   1. Overflow: enviar un archivo que no cabe y obtener un error de contexto.
//   2. Over-routing: enviar a Gemini (con cuota limitada) un archivo que Haiku maneja.
// Fuera de la zona borderline (< 400K o > 800K), el umbral de chars es suficiente
// y se evita el round-trip extra que agrega latencia.
async function countTokensHaiku(apiKey, staticSystem, userMessage) {
  const Anthropic       = require('@anthropic-ai/sdk');
  const AnthropicClient = Anthropic.default || Anthropic;
  const client          = new AnthropicClient({ apiKey });
  const response        = await client.messages.countTokens({
    model  : HAIKU_MODEL,
    system : staticSystem,
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.input_tokens;
}

// --- Nivel 1: Claude Haiku con Prompt Caching ---
// Por que cache_control en el bloque de sistema y no en el usuario:
// El sistema es estatico (mismo rol, mismo schema) — es exactamente lo que se debe cachear.
// El mensaje de usuario varia siempre (distinta mision, distinto archivo) — no se cachea.
// Esta estructura maximiza la tasa de cache hits sin penalizar invocaciones con archivos distintos.
async function callHaiku(apiKey, staticSystem, userMessage) {
  const Anthropic       = require('@anthropic-ai/sdk');
  const AnthropicClient = Anthropic.default || Anthropic;
  const client          = new AnthropicClient({ apiKey });
  const message         = await client.messages.create({
    model     : HAIKU_MODEL,
    max_tokens: 4096,
    system    : [
      {
        type         : 'text',
        text         : staticSystem,
        cache_control: { type: 'ephemeral' },
        // ephemeral: TTL de 5 minutos. Suficiente para cubrir sesiones interactivas
        // con multiples llamadas al bridge. No persiste entre sesiones distintas.
      },
    ],
    messages  : [{ role: 'user', content: userMessage }],
  });
  return message.content[0].text.trim();
}

// --- Nivel 2: Gemini (sin caching — la API de Google no comparte el mecanismo) ---
async function callGemini(apiKey, modelId, prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI  = new GoogleGenerativeAI(apiKey);
  const model  = genAI.getGenerativeModel({ model: modelId });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

// --- Modo Batch: Messages Batches API de Anthropic ---
// Por que batch: la Batches API procesa hasta 10,000 solicitudes en un job asincrono
// con 50% de descuento sobre el precio base. Para multiples archivos en la misma sesion
// (ej: analizar todos los modulos de un monorepo), batch es mas economico que N llamadas.
// Limitacion: solo compatible con Haiku (Nivel 1). Archivos masivos van a Gemini uno a uno.
// Limitacion: procesamiento asincrono — el CLI espera con polling hasta completar o timeout.
async function runBatchMode(apiKey, mission, filePaths, isJson) {
  const Anthropic       = require('@anthropic-ai/sdk');
  const AnthropicClient = Anthropic.default || Anthropic;
  const client          = new AnthropicClient({ apiKey });

  const staticSystem = buildStaticSystem(isJson);

  // Construir una solicitud por archivo
  const requests = filePaths.map((fp, idx) => {
    const content = fs.readFileSync(path.resolve(fp), 'utf8');
    return {
      custom_id: `file_${idx}_${path.basename(fp)}`,
      params   : {
        model     : HAIKU_MODEL,
        max_tokens: 4096,
        system    : [
          {
            type         : 'text',
            text         : staticSystem,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages  : [{ role: 'user', content: buildUserMessage(mission, fp, content) }],
      },
    };
  });

  process.stderr.write(
    `[LLM Bridge Batch] Enviando ${requests.length} archivos a la Batches API (50% descuento).\n`
  );

  // Enviar el batch
  let batch = await client.messages.batches.create({ requests });
  process.stderr.write(`[LLM Bridge Batch] Job creado: ${batch.id}. Esperando resultados...\n`);

  // Polling con timeout
  const deadline = Date.now() + BATCH_TIMEOUT_MS;
  while (batch.processing_status === 'in_progress') {
    if (Date.now() > deadline) {
      process.stderr.write(
        `[Error LLM Bridge Batch] Timeout de ${BATCH_TIMEOUT_MS / 60000} minutos alcanzado. ` +
        `Job ${batch.id} sigue en progreso. Recuperar manualmente via API.\n`
      );
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, BATCH_POLL_INTERVAL_MS));
    batch = await client.messages.batches.retrieve(batch.id);
    process.stderr.write(`[LLM Bridge Batch] Estado: ${batch.processing_status}...\n`);
  }

  // Recolectar resultados en orden
  const results = [];
  for await (const result of await client.messages.batches.results(batch.id)) {
    if (result.result.type === 'succeeded') {
      const raw      = result.result.message.content[0].text.trim();
      const output   = extractOutput(raw, isJson, HAIKU_MODEL);
      results.push({ custom_id: result.custom_id, output });
    } else {
      // error o expired — incluir en output con flag de fallo
      results.push({
        custom_id: result.custom_id,
        error    : result.result.type,
        detail   : result.result.error?.message || 'sin detalle',
      });
    }
  }

  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
}

async function main() {
  const args = parseArgs(process.argv);

  // Validacion de argumentos
  if (!args.mission || args.files.length === 0) {
    process.stderr.write(
      [
        'Uso:',
        '  node scripts/gemini-bridge.js --mission "<orden>" --file <ruta>',
        '  Flags opcionales:',
        '    --format  json|markdown   (default: json)',
        '    --model   <gemini-id>     modelo de Gemini para Nivel 2 (default: gemini-2.5-flash)',
        '    --batch                   procesa multiples --file en la Batches API (50% descuento)',
        '                             requiere ANTHROPIC_API_KEY. Solo compatible con Haiku.',
        '',
        'Enrutamiento automatico por tamano de archivo:',
        `  < ${BORDERLINE_LOW.toLocaleString()} chars       ->  Nivel 1: ${HAIKU_MODEL}`,
        `  ${BORDERLINE_LOW.toLocaleString()}-${BORDERLINE_HIGH.toLocaleString()} chars  ->  Zona borderline: token counting exacto antes de decidir`,
        `  > ${BORDERLINE_HIGH.toLocaleString()} chars       ->  Nivel 2: Gemini`,
        '',
      ].join('\n')
    );
    process.exit(1);
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey    = process.env.GEMINI_API_KEY;

  // =====================================================================
  // MODO BATCH — multiples archivos, Batches API, 50% descuento
  // =====================================================================
  if (args.batch) {
    if (!anthropicKey) {
      process.stderr.write(
        '[Error LLM Bridge Batch] ANTHROPIC_API_KEY requerida para el modo batch.\n'
      );
      process.exit(1);
    }
    if (args.files.length < 2) {
      process.stderr.write(
        '[LLM Bridge Batch] Modo batch activado con un solo archivo. ' +
        'Procesando en modo single para evitar overhead innecesario de la Batches API.\n'
      );
      // Continuar en modo single (no retornar, dejar caer al flujo normal)
      args.batch = false;
    } else {
      // Validar que todos los archivos existen antes de enviar el batch
      for (const f of args.files) {
        if (!fs.existsSync(path.resolve(f))) {
          process.stderr.write(`[Error LLM Bridge Batch] Archivo no encontrado: ${f}\n`);
          process.exit(1);
        }
      }
      try {
        await runBatchMode(anthropicKey, args.mission, args.files, args.format === 'json');
        return;
      } catch (err) {
        process.stderr.write(`[Error LLM Bridge Batch] ${err.message}\n`);
        process.exit(1);
      }
    }
  }

  // =====================================================================
  // MODO SINGLE — un archivo, enrutamiento en cascada por tamano
  // =====================================================================
  const filePath = path.resolve(args.file);
  if (!fs.existsSync(filePath)) {
    process.stderr.write(`[Error] Archivo no encontrado: ${filePath}\n`);
    process.exit(1);
  }

  const fileContent  = fs.readFileSync(filePath, 'utf8');
  const isJson       = args.format === 'json';
  const fileSize     = fileContent.length;
  const staticSystem = buildStaticSystem(isJson);
  const userMessage  = buildUserMessage(args.mission, filePath, fileContent);
  const geminiPrompt = buildGeminiPrompt(args.mission, filePath, fileContent, isJson);

  // Determinar nivel de enrutamiento
  // Por defecto usa el umbral de chars. En zona borderline, refina con token counting exacto.
  let isMassive = fileSize > HAIKU_CHAR_LIMIT;

  if (fileSize >= BORDERLINE_LOW && fileSize <= BORDERLINE_HIGH && anthropicKey) {
    try {
      process.stderr.write(
        `[LLM Bridge] Zona borderline (${fileSize.toLocaleString()} chars). ` +
        'Contando tokens exactos via /v1/messages/count_tokens...\n'
      );
      const tokenCount = await countTokensHaiku(anthropicKey, staticSystem, userMessage);
      isMassive        = tokenCount > HAIKU_TOKEN_LIMIT;
      process.stderr.write(
        `[LLM Bridge] Token count exacto: ${tokenCount.toLocaleString()} tokens. ` +
        `Limite Haiku: ${HAIKU_TOKEN_LIMIT.toLocaleString()}. ` +
        `Enrutando a ${isMassive ? `Gemini ${args.geminiModel} (Nivel 2)` : `${HAIKU_MODEL} (Nivel 1)`}.\n`
      );
    } catch (err) {
      // El token counting es una optimizacion, no un requisito. Si falla, continuar
      // con el umbral de chars ya calculado. Esto preserva la disponibilidad del bridge.
      process.stderr.write(
        `[LLM Bridge] Token counting fallido (${err.message}). Usando umbral de chars.\n`
      );
    }
  }

  // =====================================================================
  // NIVEL 1 — Claude Haiku (primario, archivos de tamano estandar)
  // =====================================================================
  if (!isMassive) {
    if (anthropicKey) {
      try {
        process.stderr.write(
          `[LLM Bridge] Nivel 1: ${HAIKU_MODEL} ` +
          `(${fileSize.toLocaleString()} chars) [Prompt Cache activo].\n`
        );
        const raw    = await callHaiku(anthropicKey, staticSystem, userMessage);
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
        'Configura ANTHROPIC_API_KEY para activar Haiku como Nivel 1 (mas economico y con Prompt Cache).\n'
      );
    }

    // Contingencia: Gemini para archivos estandar (cuando Haiku no esta disponible)
    if (geminiKey) {
      try {
        const raw    = await callGemini(geminiKey, args.geminiModel, geminiPrompt);
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
  // NIVEL 2 — Gemini (archivos masivos > 600K chars / > 193K tokens exactos)
  // =====================================================================
  process.stderr.write(
    `[LLM Bridge] Nivel 2: archivo masivo (${fileSize.toLocaleString()} chars` +
    ` > ${HAIKU_CHAR_LIMIT.toLocaleString()} limite Haiku). Enrutando a Gemini.\n`
  );

  if (geminiKey) {
    try {
      const raw    = await callGemini(geminiKey, args.geminiModel, geminiPrompt);
      const output = extractOutput(raw, isJson, args.geminiModel);
      process.stdout.write(output + '\n');
      return;
    } catch (err) {
      if (isQuotaError(err) && anthropicKey) {
        process.stderr.write(
          '[LLM Bridge DEGRADADO] Gemini cuota agotada para archivo masivo. ' +
          'Intentando Haiku como ultima contingencia (resultado puede ser parcial).\n'
        );
        try {
          const raw    = await callHaiku(anthropicKey, staticSystem, userMessage);
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
      const raw    = await callHaiku(anthropicKey, staticSystem, userMessage);
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
