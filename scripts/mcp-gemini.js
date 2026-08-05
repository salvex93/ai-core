#!/usr/bin/env node
/**
 * mcp-gemini.js — Servidor MCP stdio para delegacion a Gemini Flash.
 *
 * Por que: los archivos > 500 lineas cargados en el contexto de Claude consumen
 * cuota diaria innecesariamente. Este servidor expone herramientas MCP que
 * delegan el analisis a Gemini 3.5 Flash (free tier) y devuelven solo la sintesis.
 *
 * Protocolo: JSON-RPC 2.0 sobre stdio (sin SDK ESM — CJS puro para compatibilidad).
 *
 * SRP: este archivo es solo el shell del protocolo (TOOLS, dispatch, main).
 * La logica de cada herramienta vive en services/McpServerHandlers.js y el
 * cliente del SDK de Gemini vive en services/GeminiApiClient.js.
 */

'use strict';

const readline = require('readline');
const { capturarError, ejecutarCicloReparacion } = require('./services/ErrorRepairLoop');
const { loadEnv, GEMINI_DEFAULT } = require('./services/GeminiApiClient');
const {
  analizarArchivo,
  analizarContenido,
  analizarRepositorio,
  resumirBacklog,
  buscarWeb,
} = require('./services/McpServerHandlers');

// --- Protocolo MCP stdio (JSON-RPC 2.0) ---

const TOOLS = [
  {
    name: 'analizar_archivo',
    description:
      'Delega el analisis de archivos grandes (>500 lineas o >50 KB) a Gemini 3.5 Flash. ' +
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
      'Delega el analisis de texto extenso ya disponible en memoria a Gemini 3.5 Flash. ' +
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

// Propone diagnostico + fix (solo texto, nunca se aplica a disco) via el
// ciclo AUDITOR/ARCHITECT. Un fallo aqui (sin API key, red, rate limit)
// nunca debe ocultar el error original de la tool que fallo.
async function intentarReparar(error, herramienta) {
  try {
    const { diagnostico, reparacion } = await ejecutarCicloReparacion({ error, herramienta });
    return { diagnostico, propuesta: reparacion, fallo: false };
  } catch (errorReparacion) {
    return { fallo: true, motivo: errorReparacion.message };
  }
}

async function dispatch(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mcp-gemini', version: '2.2.0', ia_activa: GEMINI_DEFAULT },
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
    try {
      const { name, arguments: args } = params ?? {};
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
      const meta = capturarError(err, { herramienta: params?.name });
      meta.reparacion = await intentarReparar(err, params?.name);
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: err.message, data: meta } });
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
