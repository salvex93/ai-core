#!/usr/bin/env node
// Por que: delegar lecturas documentales masivas a Gemini evita saturar el context window
// del agente principal. Sin este bridge, archivos grandes consumen tokens de contexto
// que degradan la calidad de respuesta en el resto de la sesion (Regla 9).
// El output es JSON o Markdown estricto — nunca prosa libre — para garantizar que
// el agente principal pueda procesarlo de forma determinista.

'use strict';

const fs   = require('fs');
const path = require('path');

// --- Parseo de argumentos CLI sin dependencias adicionales ---
function parseArgs(argv) {
  const args = { format: 'json', model: 'gemini-2.5-flash' };
  for (let i = 2; i < argv.length; i++) {
    if ((argv[i] === '--mission' || argv[i] === '-m') && argv[i + 1]) {
      args.mission = argv[++i];
    } else if ((argv[i] === '--file' || argv[i] === '-f') && argv[i + 1]) {
      args.file = argv[++i];
    } else if ((argv[i] === '--format') && argv[i + 1]) {
      args.format = argv[++i];
    } else if ((argv[i] === '--model') && argv[i + 1]) {
      args.model = argv[++i];
    }
  }
  return args;
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
    modelo: '<id del modelo Gemini>',
    timestamp: '<ISO 8601>',
  },
};

// --- Schema Markdown esperado ---
const MARKDOWN_SCHEMA = `## Resumen\n<sintesis>\n\n## Hallazgos Clave\n- item\n\n## Recomendaciones\n- item\n\n## Advertencias\n- item (omitir seccion si no hay)`;

async function main() {
  const args = parseArgs(process.argv);

  if (!args.mission || !args.file) {
    process.stderr.write(
      [
        'Uso:',
        '  node scripts/gemini-bridge.js --mission "<orden>" --file <ruta>',
        '  Flags opcionales:',
        '    --format  json|markdown  (default: json)',
        '    --model   <model-id>     (default: gemini-2.5-flash)',
        '',
      ].join('\n')
    );
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    process.stderr.write(
      '[Error] GEMINI_API_KEY no encontrada. Agregar al .env del proyecto anfitrion.\n'
    );
    process.exit(1);
  }

  const filePath = path.resolve(args.file);
  if (!fs.existsSync(filePath)) {
    process.stderr.write(`[Error] Archivo no encontrado: ${filePath}\n`);
    process.exit(1);
  }

  const fileContent  = fs.readFileSync(filePath, 'utf8');
  const isJson       = args.format === 'json';
  const schemaBlock  = isJson
    ? JSON.stringify(JSON_SCHEMA_EXAMPLE, null, 2)
    : MARKDOWN_SCHEMA;

  const formatInstruction = isJson
    ? 'Responde UNICAMENTE con un objeto JSON valido. Sin markdown fence, sin texto adicional fuera del JSON.'
    : 'Responde UNICAMENTE en Markdown estricto. Sin texto introductorio ni conclusivo fuera del Markdown.';

  const prompt = `Eres el Gemini Bridge, un sub-agente de analisis documental de alta precision.
Tu funcion es sintetizar el contenido de archivos para reducir la carga del context window del agente principal.

Orden de Mision:
${args.mission}

${formatInstruction}

Schema de respuesta requerido (${isJson ? 'JSON' : 'Markdown'}):
${schemaBlock}

Archivo analizado: ${path.basename(filePath)}

Contenido:
---
${fileContent}
---`;

  // Carga diferida de la dependencia para que el error de API key sea previo al import.
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: args.model });

  try {
    const result = await model.generateContent(prompt);
    const raw    = result.response.text().trim();

    if (isJson) {
      // Extrae el JSON aunque Gemini agregue fence de codigo.
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr    = fenceMatch ? fenceMatch[1].trim() : raw;
      // Valida que sea JSON parseable antes de emitir.
      JSON.parse(jsonStr);
      process.stdout.write(jsonStr + '\n');
    } else {
      process.stdout.write(raw + '\n');
    }
  } catch (err) {
    process.stderr.write(`[Error Gemini Bridge] ${err.message}\n`);
    process.exit(1);
  }
}

main();
