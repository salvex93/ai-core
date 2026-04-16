#!/usr/bin/env node
/**
 * mcp-gemini.js — Servidor MCP stdio para delegacion a Gemini Flash.
 *
 * Por que: los archivos > 500 lineas cargados en el contexto de Claude consumen
 * cuota diaria innecesariamente. Este servidor expone dos herramientas MCP que
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

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada en .env');

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI  = new GoogleGenerativeAI(apiKey);
  const model  = genAI.getGenerativeModel({ model: GEMINI_DEFAULT });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

function parseGeminiJson(raw) {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fence ? fence[1].trim() : raw);
}

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

  const prompt = `Eres un analizador documental de precision. Sintetiza segun la orden de mision.

Orden de Mision: ${mision}

Archivo: ${path.basename(filePath)} (${lineas} lineas)

Contenido:
---
${contenido}
---

Responde UNICAMENTE con JSON valido. Sin markdown fence, sin texto adicional:
{"resumen":"<3-5 oraciones>","hallazgos_clave":["..."],"recomendaciones":["..."],"advertencias":[]}`;

  try {
    const raw    = await callGemini(prompt);
    const parsed = parseGeminiJson(raw);
    return { delegado: true, modelo: GEMINI_DEFAULT, lineas, ...parsed };
  } catch (err) {
    return { error: `Gemini error: ${err.message}` };
  }
}

async function analizarContenido({ contenido, mision }) {
  const prompt = `Orden de Mision: ${mision}

Contenido:
---
${contenido}
---

Responde UNICAMENTE con JSON valido:
{"resumen":"<3-5 oraciones>","hallazgos_clave":["..."],"recomendaciones":["..."],"advertencias":[]}`;

  try {
    const raw    = await callGemini(prompt);
    const parsed = parseGeminiJson(raw);
    return { delegado: true, modelo: GEMINI_DEFAULT, ...parsed };
  } catch (err) {
    return { error: `Gemini error: ${err.message}` };
  }
}

// --- Protocolo MCP stdio (JSON-RPC 2.0) ---

const TOOLS = [
  {
    name: 'analizar_archivo',
    description:
      'Delega el analisis de archivos grandes (>500 lineas o >50 KB) a Gemini 2.5 Flash. ' +
      'Devuelve sintesis estructurada sin cargar el contenido en el contexto de Claude. ' +
      'OBLIGATORIO para archivos que superen el umbral — NO usar Read directamente en esos casos.',
    inputSchema: {
      type: 'object',
      properties: {
        ruta:   { type: 'string', description: 'Ruta absoluta o relativa al archivo' },
        mision: { type: 'string', description: 'Que informacion extraer o que pregunta responder' },
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
        serverInfo: { name: 'mcp-gemini', version: '1.0.0' },
      },
    });
    return;
  }

  if (method === 'notifications/initialized') return; // notificacion, sin respuesta

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
      if (name === 'analizar_archivo')  result = await analizarArchivo(args);
      else if (name === 'analizar_contenido') result = await analizarContenido(args);
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
