#!/usr/bin/env node
/**
 * mcp-gemini.js — Servidor MCP stdio para delegacion a Gemini Flash.
 *
 * Por que: los archivos > 500 lineas cargados en el contexto de Claude consumen
 * cuota diaria innecesariamente. Este servidor expone herramientas MCP que
 * delegan el analisis a Gemini 2.5 Flash (free tier) y devuelven solo la sintesis.
 *
 * Protocolo: JSON-RPC 2.0 sobre stdio (sin SDK ESM — CJS puro para compatibilidad).
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const GEMINI_DEFAULT  = 'gemini-2.5-flash';
const LINE_THRESHOLD  = 500;
const SIZE_THRESHOLD  = 50 * 1024; // 50 KB
const MAX_RETRIES     = 2;

// Carga .env desde la raiz del proyecto (un nivel arriba de /scripts)
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// Lazy-load del SDK — disponible en el primer callGemini, no en el import
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

// --- Calidad de respuesta ---

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

// --- System instruction estatica (candidata a cache en Gemini) ---
const SYSTEM_ANALISIS = `Eres un analizador documental de alta precision. Tu funcion es sintetizar archivos de codigo o documentacion para reducir la carga del context window del agente principal.

Responde UNICAMENTE con JSON valido. Sin markdown fence, sin texto adicional fuera del JSON.

Schema requerido:
{"resumen":"<3-5 oraciones>","hallazgos_clave":["hallazgo 1","hallazgo 2"],"recomendaciones":["accion 1"],"advertencias":["advertencia critica — omitir array si no hay"]}

Reglas de calidad:
- resumen: minimo 3 oraciones con conclusion tecnica accionable.
- hallazgos_clave: al menos 2 items, especificos y con referencia a lineas o secciones del archivo.
- recomendaciones: accionables, con ruta y numero de linea cuando aplica.
- advertencias: solo para riesgos criticos de seguridad, correctitud o produccion.`;

// --- Herramientas ---

async function analizarArchivo({ ruta, mision }) {
  const filePath = path.resolve(ruta);
  if (!fs.existsSync(filePath)) {
    return { error: `Archivo no encontrado: ${filePath}` };
  }

  const contenido = fs.readFileSync(filePath, 'utf8');
  const lineas    = contenido.split('\n').length;
  const bytes     = Buffer.byteLength(contenido, 'utf8');

  if (lineas <= LINE_THRESHOLD && bytes <= SIZE_THRESHOLD) {
    return {
      delegado: false,
      motivo: `Archivo pequeno (${lineas} lineas, ${(bytes / 1024).toFixed(1)} KB). Contenido incluido para maxima precision.`,
      contenido,
    };
  }

  try {
    const model = getModel({ systemInstruction: SYSTEM_ANALISIS });
    const userMessage = `Orden de Mision: ${mision}\n\nArchivo: ${path.basename(filePath)} (${lineas} lineas)\n\nContenido:\n---\n${contenido}\n---`;
    const { parsed, warnings } = await callWithRetry(model, userMessage);
    const result = {
      delegado: true,
      metadatos: {
        archivo_analizado: path.basename(filePath),
        modelo: GEMINI_DEFAULT,
        timestamp: new Date().toISOString(),
        lineas,
      },
      ...parsed,
    };
    if (warnings.length > 0) result.calidad_warnings = warnings;
    return result;
  } catch (err) {
    return { error: `Gemini error: ${err.message}` };
  }
}

async function analizarContenido({ contenido, mision }) {
  try {
    const model = getModel({ systemInstruction: SYSTEM_ANALISIS });
    const userMessage = `Orden de Mision: ${mision}\n\nContenido:\n---\n${contenido}\n---`;
    const { parsed, warnings } = await callWithRetry(model, userMessage);
    const result = {
      delegado: true,
      metadatos: {
        modelo: GEMINI_DEFAULT,
        timestamp: new Date().toISOString(),
      },
      ...parsed,
    };
    if (warnings.length > 0) result.calidad_warnings = warnings;
    return result;
  } catch (err) {
    return { error: `Gemini error: ${err.message}` };
  }
}

// Busqueda web en tiempo real via Gemini con Google Search grounding.
// Uso: verificar actualizaciones de Anthropic/Google, changelog de modelos,
// cambios en APIs de MCP, nuevas capacidades de Claude.
async function buscarWeb({ consulta, mision }) {
  try {
    const model  = getModel({ tools: [{ googleSearch: {} }] });
    const prompt = `Mision: ${mision}\n\nConsulta: ${consulta}\n\nBusca informacion actualizada y sintetiza los hallazgos mas relevantes. Incluye URLs de las fuentes principales.`;
    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim();

    if (isRefusal(text)) {
      return { error: `Gemini rechazo la busqueda: ${text.slice(0, 200)}` };
    }

    const candidate = result.response.candidates?.[0];
    const grounding = candidate?.groundingMetadata;
    const fuentes   = (grounding?.groundingChunks || [])
      .map(c => c.web?.uri)
      .filter(Boolean);
    const queries   = grounding?.webSearchQueries || [];

    return {
      delegado: true,
      respuesta: text,
      fuentes,
      queries_ejecutadas: queries,
      metadatos: {
        consulta,
        modelo: GEMINI_DEFAULT,
        timestamp: new Date().toISOString(),
        grounding_activado: !!grounding,
      },
    };
  } catch (err) {
    return { error: `Gemini web search error: ${err.message}` };
  }
}

// --- Protocolo MCP stdio (JSON-RPC 2.0) ---

const TOOLS = [
  {
    name: 'analizar_archivo',
    description:
      'Delega el analisis de archivos grandes (>500 lineas o >50 KB) a Gemini 2.5 Flash. ' +
      'Devuelve sintesis estructurada (resumen, hallazgos_clave, recomendaciones, advertencias, metadatos) ' +
      'sin cargar el contenido en el contexto de Claude. ' +
      'OBLIGATORIO para archivos que superen el umbral — NO usar Read directamente en esos casos.',
    inputSchema: {
      type: 'object',
      properties: {
        ruta:   { type: 'string', description: 'Ruta absoluta o relativa al archivo' },
        mision: { type: 'string', description: 'Que informacion extraer o que pregunta responder sobre el archivo' },
      },
      required: ['ruta', 'mision'],
    },
  },
  {
    name: 'analizar_contenido',
    description:
      'Delega el analisis de texto extenso ya disponible en memoria a Gemini 2.5 Flash. ' +
      'Usar cuando se tiene contenido concatenado que saturaria el contexto de Claude.',
    inputSchema: {
      type: 'object',
      properties: {
        contenido: { type: 'string', description: 'Texto a analizar' },
        mision:    { type: 'string', description: 'Que informacion extraer del contenido' },
      },
      required: ['contenido', 'mision'],
    },
  },
  {
    name: 'buscar_web',
    description:
      'Realiza una busqueda web en tiempo real via Gemini con Google Search grounding. ' +
      'Usar para: verificar actualizaciones del API de Anthropic/Claude, cambios en modelos, ' +
      'nuevas capacidades MCP, changelogs de Google Gemini, estado de capacidades beta. ' +
      'Devuelve respuesta sintetizada con fuentes y URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Consulta de busqueda web en lenguaje natural' },
        mision:   { type: 'string', description: 'Que informacion especifica extraer de los resultados' },
      },
      required: ['consulta', 'mision'],
    },
  },
];

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function dispatch(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mcp-gemini', version: '2.0.0' },
      },
    });
    return;
  }

  if (method === 'notifications/initialized') return;

  if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
    return;
  }

  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    try {
      let result;
      if      (name === 'analizar_archivo')  result = await analizarArchivo(args);
      else if (name === 'analizar_contenido') result = await analizarContenido(args);
      else if (name === 'buscar_web')         result = await buscarWeb(args);
      else {
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Herramienta desconocida: ${name}` } });
        return;
      }
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } });
    } catch (err) {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: err.message } });
    }
    return;
  }

  if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

function main() {
  loadEnv();

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      await dispatch(JSON.parse(trimmed));
    } catch (_) {
      // JSON invalido — ignorar silenciosamente
    }
  });

  rl.on('close', () => process.exit(0));
}

main();
