#!/usr/bin/env node
'use strict';

/**
 * mcp-anthropic.js — Servidor MCP stdio para tokenomics Haiku/Sonnet/Opus.
 *
 * Expone la herramienta `completar_tarea` que enruta automaticamente al modelo
 * correcto segun la naturaleza de la tarea via ModelRouter:
 *   - Haiku  → parseo, resumen, validaciones simples
 *   - Sonnet → analisis, busqueda, debugging, generacion de codigo
 *   - Opus   → arquitectura compleja, diseño de sistema, auditoria critica
 *
 * El escalado automatico por tamano de contexto aplica siempre:
 *   - Contexto > 12K tokens: Haiku escala a Sonnet
 *   - Contexto > 60K tokens: cualquier tier escala a Opus
 *
 * Protocolo: JSON-RPC 2.0 sobre stdio.
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

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

// Lazy-load de completar() para no inicializar el SDK Anthropic hasta el primer uso
let _completar = null;
function getCompletar() {
  if (!_completar) {
    ({ completar: _completar } = require('./anthropic-bridge'));
  }
  return _completar;
}

// ---------------------------------------------------------------------------
// Herramientas expuestas al MCP
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'completar_tarea',
    description:
      'Delega una tarea al modelo Anthropic correcto via Model Router automatico. ' +
      'Haiku para parseo/resumen/validacion, Sonnet para analisis/debug/codigo, ' +
      'Opus para arquitectura compleja/diseño/auditoria critica. ' +
      'El router escala automaticamente por tamano de contexto. ' +
      'Usar para conservar cuota de Claude Code delegando subtareas al tier mas economico posible.',
    inputSchema: {
      type: 'object',
      properties: {
        herramienta: {
          type: 'string',
          description:
            'Nombre de la tarea para routing. Valores validos: ' +
            'resumir_backlog, analizar_contenido (Haiku) | ' +
            'analizar_archivo, analizar_repositorio, buscar_web (Sonnet) | ' +
            'refactorizar_arquitectura, disenar_sistema, auditar_seguridad_critica (Opus). ' +
            'Si la tarea no encaja en ninguna, usa "analizar_contenido" como fallback economico.',
        },
        mensaje: {
          type: 'string',
          description: 'El mensaje o tarea a ejecutar por el modelo seleccionado.',
        },
        historial: {
          type: 'array',
          description: 'Historial previo de la conversacion [{role, content}]. Opcional.',
          items: {
            type: 'object',
            properties: {
              role:    { type: 'string', enum: ['user', 'assistant'] },
              content: { type: 'string' },
            },
            required: ['role', 'content'],
          },
        },
        skills: {
          type: 'array',
          description: 'Nombres de skills a inyectar en el system prompt. Opcional.',
          items: { type: 'string' },
        },
        session_id: {
          type: 'string',
          description: 'ID de sesion para trazabilidad de costos. Opcional.',
        },
      },
      required: ['herramienta', 'mensaje'],
    },
  },
  {
    name: 'estimar_costo',
    description:
      'Estima el costo en USD de una llamada al modelo dado el conteo de tokens. ' +
      'Usar antes de delegar tareas grandes para validar que el costo es aceptable.',
    inputSchema: {
      type: 'object',
      properties: {
        modelo: {
          type: 'string',
          description: 'ID del modelo. Usar los IDs exactos: claude-haiku-4-5-20251001, claude-sonnet-4-6, claude-opus-4-7',
        },
        tokens_input:  { type: 'number', description: 'Tokens de entrada estimados' },
        tokens_output: { type: 'number', description: 'Tokens de salida estimados' },
        tokens_cache_hit: {
          type: 'number',
          description: 'Tokens servidos desde cache (90% descuento). Opcional, default 0.',
        },
      },
      required: ['modelo', 'tokens_input', 'tokens_output'],
    },
  },
  {
    name: 'routing_info',
    description:
      'Consulta que modelo y tier usaria el ModelRouter para una herramienta y contexto dados. ' +
      'Usar para planificar la estrategia de delegacion antes de ejecutar.',
    inputSchema: {
      type: 'object',
      properties: {
        herramienta: {
          type: 'string',
          description: 'Nombre de la herramienta/tarea',
        },
        tokens_contexto: {
          type: 'number',
          description: 'Tokens estimados del contexto actual. Default 0.',
        },
      },
      required: ['herramienta'],
    },
  },
  {
    name: 'cuota_estado',
    description:
      'Muestra el uso actual de rate limits en la ventana de 1 minuto: ' +
      'requests, input tokens y output tokens consumidos vs limite. ' +
      'Invocar cuando el modelo avise de rate limit o para monitorear el consumo.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleCompletarTarea({ herramienta, mensaje, historial = [], skills = [], session_id }) {
  const completar = getCompletar();

  const resultado = await completar({
    herramienta,
    mensajeUsuario: mensaje,
    historial,
    skills,
    sessionId: session_id,
  });

  return {
    respuesta:          resultado.respuesta,
    modelo_usado:       resultado.modelo,
    tier_routing:       resultado.razonRouting,
    turnos_historial:   resultado.turnosEnHistorial,
    uso_tokens:         resultado.uso,
    costo_estimado_usd: calcularCostoDesdeUso(resultado.modelo, resultado.uso),
  };
}

function calcularCostoDesdeUso(modelo, uso = {}) {
  if (!uso.input_tokens && !uso.output_tokens) return null;

  const { estimarCosto } = require('./services/ModelRouter');
  const cacheHit = uso.cache_read_input_tokens || 0;
  const { costoUSD, desglose } = estimarCosto(
    modelo,
    uso.input_tokens || 0,
    uso.output_tokens || 0,
    cacheHit,
  );
  return { total_usd: costoUSD, desglose };
}

function handleEstimarCosto({ modelo, tokens_input, tokens_output, tokens_cache_hit = 0 }) {
  const { estimarCosto } = require('./services/ModelRouter');
  return estimarCosto(modelo, tokens_input, tokens_output, tokens_cache_hit);
}

function handleRoutingInfo({ herramienta, tokens_contexto = 0 }) {
  const { route, MODELOS, COSTO_POR_MODELO } = require('./services/ModelRouter');
  const resultado = route(herramienta, tokens_contexto);
  const tarifas   = COSTO_POR_MODELO[resultado.modelo];

  return {
    ...resultado,
    tarifas_usd_por_mtoken: tarifas || null,
    nota: 'El escalado por contexto tiene prioridad sobre el tier base de la herramienta.',
  };
}

function handleCuotaEstado() {
  const { estado } = require('./services/RateLimiter');
  const e = estado();
  return {
    ...e,
    advertencias: [
      e.requests.actual    >= e.requests.limite_seguro    ? `REQUESTS cerca del limite (${e.requests.actual}/${e.requests.limite_seguro})`           : null,
      e.tokens_input.actual  >= e.tokens_input.limite_seguro  ? `INPUT TOKENS cerca del limite (${e.tokens_input.actual}/${e.tokens_input.limite_seguro})`   : null,
      e.tokens_output.actual >= e.tokens_output.limite_seguro ? `OUTPUT TOKENS cerca del limite (${e.tokens_output.actual}/${e.tokens_output.limite_seguro})` : null,
    ].filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Protocolo MCP stdio (JSON-RPC 2.0)
// ---------------------------------------------------------------------------

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
        serverInfo: { name: 'mcp-anthropic', version: '1.0.0' },
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
      if      (name === 'completar_tarea') result = await handleCompletarTarea(args);
      else if (name === 'estimar_costo')   result = handleEstimarCosto(args);
      else if (name === 'routing_info')    result = handleRoutingInfo(args);
      else if (name === 'cuota_estado')    result = handleCuotaEstado();
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
