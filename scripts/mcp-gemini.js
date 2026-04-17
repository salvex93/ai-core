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

// --- System instructions estaticas (candidatas a cache en Gemini) ---
const SYSTEM_ANALISIS = `Eres un analizador documental de alta precision. Tu funcion es sintetizar archivos de codigo o documentacion para reducir la carga del context window del agente principal.

Responde UNICAMENTE con JSON valido. Sin markdown fence, sin texto adicional fuera del JSON.

Schema requerido:
{"resumen":"<3-5 oraciones>","hallazgos_clave":["hallazgo 1","hallazgo 2"],"recomendaciones":["accion 1"],"advertencias":["advertencia critica — omitir array si no hay"]}

Reglas de calidad:
- resumen: minimo 3 oraciones con conclusion tecnica accionable.
- hallazgos_clave: al menos 2 items, especificos y con referencia a lineas o secciones del archivo.
- recomendaciones: accionables, con ruta y numero de linea cuando aplica.
- advertencias: solo para riesgos criticos de seguridad, correctitud o produccion.`;

const SYSTEM_REPOSITORIO = `Eres un analizador de repositorios. Tu funcion es extraer el stack tecnico, dependencias de IA y convenciones de un proyecto a partir de sus manifiestos.

Responde UNICAMENTE con JSON valido. Sin markdown fence, sin texto adicional fuera del JSON.

Schema requerido:
{"stack":{"lenguaje":"","framework":"","orm_db":""},"dependencias_ia":["sdk1"],"variables_entorno":["VAR1"],"convenciones":["convencion 1"],"resumen":"<3-5 oraciones sobre el proyecto>"}

Reglas:
- stack: deducir del package.json/requirements.txt/go.mod. Si no hay framework claro, escribir "no detectado".
- dependencias_ia: solo SDKs de LLM/IA (@anthropic-ai/sdk, @google/generative-ai, openai, langchain, etc.).
- variables_entorno: extraer de .env.example o CLAUDE.md. Incluir solo nombres de variables, sin valores.
- convenciones: extraer de CLAUDE.md local. Si no existe, escribir ["no declaradas"].
- resumen: minimo 3 oraciones con el proposito del proyecto y decisiones tecnicas clave.`;

const SYSTEM_BACKLOG = `Eres un parser de BACKLOG.md. Extrae las tareas abiertas (Estatus: Pendiente, En Progreso, Backlog) y devuelve JSON estructurado.

Responde UNICAMENTE con JSON valido. Sin markdown fence, sin texto adicional fuera del JSON.

Schema requerido:
{"tareas_abiertas":[{"id":"T1","tipo":"","descripcion":"","estatus":"","jerarquia":""}],"total_abiertas":0,"resumen":"<N tareas abiertas. Resumen ejecutivo.>"}

Reglas:
- tareas_abiertas: solo filas con Estatus Pendiente, En Progreso o Backlog (case-insensitive).
- id: columna #Tarea tal cual aparece en la tabla.
- descripcion: truncar a 80 caracteres si es mas larga.
- Ignorar filas con Estatus Terminado, Cancelado o Diferido.`;

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

// Analiza manifiestos del repositorio anfitrion para deducir stack y convenciones.
// Reemplaza el protocolo "Primera Accion al Activar" de todos los skills.
async function analizarRepositorio({ ruta_raiz, mision }) {
  const rootPath = path.resolve(ruta_raiz || '.');
  const manifests = [
    'package.json', 'pubspec.yaml', 'requirements.txt', 'pyproject.toml',
    'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle',
    'docker-compose.yml', '.env.example', 'CLAUDE.md',
  ];

  const found = [];
  for (const name of manifests) {
    const filePath = path.join(rootPath, name);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      found.push({ name, content: raw.slice(0, 3000) });
    }
  }

  if (found.length === 0) {
    return { error: `No se encontraron manifiestos en: ${rootPath}` };
  }

  const concatenado = found.map(f => `### ${f.name}\n${f.content}`).join('\n\n');

  try {
    const model = getModel({ systemInstruction: SYSTEM_REPOSITORIO });
    const userMessage = `Orden de Mision: ${mision}\n\nRepositorio: ${path.basename(rootPath)}\n\nManifiestos:\n---\n${concatenado}\n---`;
    const { parsed, warnings } = await callWithRetry(model, userMessage);
    const result = {
      delegado: true,
      metadatos: {
        repositorio: path.basename(rootPath),
        manifiestos_analizados: found.map(f => f.name),
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

// Parsea BACKLOG.md y devuelve tareas abiertas estructuradas.
// Reemplaza el parser fragil de session-close.js y evita que Claude lea el BACKLOG completo.
async function resumirBacklog({ ruta_backlog }) {
  const filePath = path.resolve(ruta_backlog || 'BACKLOG.md');
  if (!fs.existsSync(filePath)) {
    return { error: `Archivo no encontrado: ${filePath}` };
  }

  const contenido = fs.readFileSync(filePath, 'utf8');

  try {
    const model = getModel({ systemInstruction: SYSTEM_BACKLOG });
    const result = await model.generateContent(contenido);
    const raw    = result.response.text().trim();
    if (isRefusal(raw)) return { error: `Gemini rechazo el backlog: ${raw.slice(0, 120)}` };
    const parsed = extractJson(raw);
    return {
      delegado: true,
      metadatos: { modelo: GEMINI_DEFAULT, timestamp: new Date().toISOString() },
      ...parsed,
    };
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
    name: 'analizar_repositorio',
    description:
      'Analiza los manifiestos del repositorio anfitrion (package.json, requirements.txt, .env.example, CLAUDE.md, etc.) ' +
      'y devuelve stack tecnico, dependencias IA, variables de entorno y convenciones. ' +
      'Invocar al inicio de cada sesion en lugar de leer archivos manualmente (reemplaza Primera Accion al Activar).',
    inputSchema: {
      type: 'object',
      properties: {
        ruta_raiz: { type: 'string', description: 'Ruta raiz del repositorio (default: ".")' },
        mision:   { type: 'string', description: 'Que informacion especifica extraer del repositorio' },
      },
      required: ['mision'],
    },
  },
  {
    name: 'resumir_backlog',
    description:
      'Parsea BACKLOG.md y devuelve tareas abiertas (Pendiente/En Progreso/Backlog) en JSON estructurado. ' +
      'Usar en lugar de leer BACKLOG.md directamente — evita que el contenido completo consuma el contexto de Claude.',
    inputSchema: {
      type: 'object',
      properties: {
        ruta_backlog: { type: 'string', description: 'Ruta al BACKLOG.md (default: "BACKLOG.md")' },
      },
      required: [],
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
        serverInfo: { name: 'mcp-gemini', version: '2.1.0' },
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
      if      (name === 'analizar_archivo')      result = await analizarArchivo(args);
      else if (name === 'analizar_contenido')    result = await analizarContenido(args);
      else if (name === 'analizar_repositorio')  result = await analizarRepositorio(args);
      else if (name === 'resumir_backlog')        result = await resumirBacklog(args);
      else if (name === 'buscar_web')             result = await buscarWeb(args);
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
