#!/usr/bin/env node
'use strict';
/**
 * capture-event.js — Captura eventos del harness y los encola en EVENTS_QUEUE.json.
 *
 * Tipos de evento:
 *   mcp_failure    — fallo de herramienta MCP (gemini-bridge, anthropic-router)
 *   hook_failure   — fallo de script en .claude/bin/
 *   skill_gap      — el usuario pidio algo que ningun skill cubre
 *   pattern        — patron repetido detectado (misma tarea > 2 veces en sesion)
 *   harness_error  — error inesperado en el nucleo del arnes
 *
 * Uso (desde hook o script):
 *   node capture-event.js --type mcp_failure --tool gemini-bridge --error "quota exceeded" --context "analizar_archivo llamado en turno 4"
 *   node capture-event.js --type hook_failure --tool guard-read --error "ENOENT" --context "/ruta/al/archivo"
 *
 * Contexto de hook disponible:
 *   CLAUDE_CODE_SESSION_ID — variable de entorno real, id de sesion.
 *   tool_name/tool_input/tool_response del JSON de stdin -- CLAUDE_TOOL_NAME,
 *   CLAUDE_TOOL_INPUT y CLAUDE_TOOL_ERROR nunca existieron como variables de
 *   entorno reales (confirmado contra code.claude.com/docs/en/hooks). En la
 *   practica esto script siempre recibe --type/--tool explicitos desde
 *   hooks-definition.js, asi que el fallback solo cubre --error/--context.
 *
 * AI_CORE_TEST_MODE=1 — inyectada por tests/harness.test.js (runScript) para
 * que ejercitar guards con archivos temporales de prueba no contamine
 * EVENTS_QUEUE.json con eventos que no son fallos reales del arnes.
 */

const fs   = require('fs');
const path = require('path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const CORE_PATH  = path.resolve(__dirname, '../..');
// AI_CORE_EVENTS_QUEUE_PATH permite operar sobre una cola temporal en tests
// (mismo patron ya usado por circuit-breaker.js para el lado de lectura)
const QUEUE_PATH = process.env.AI_CORE_EVENTS_QUEUE_PATH || path.join(CORE_PATH, '.claude', 'EVENTS_QUEUE.json');
const MAX_EVENTS = 50; // evitar que la cola crezca indefinidamente

// ---------------------------------------------------------------------------
// Parsear argumentos CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      result[args[i].slice(2)] = args[i + 1] || '';
      i++;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Leer variables de entorno inyectadas por Claude Code hooks
// ---------------------------------------------------------------------------

function getHookContext() {
  const evento = leerEventoDeStdin();
  return {
    sessionId: (process.env.CLAUDE_CODE_SESSION_ID || 'unknown').slice(0, 12),
    toolName:  process.env.CLAUDE_TOOL_NAME  || evento.tool_name || '',
    toolInput: process.env.CLAUDE_TOOL_INPUT || (evento.tool_input ? JSON.stringify(evento.tool_input) : '') || '',
    toolError: process.env.CLAUDE_TOOL_ERROR || evento.tool_response || '',
  };
}

// ---------------------------------------------------------------------------
// Construir evento normalizado
// ---------------------------------------------------------------------------

function buildEvent(args, hookCtx) {
  const type    = args.type    || 'harness_error';
  const tool    = args.tool    || hookCtx.toolName  || 'unknown';
  const error   = args.error   || hookCtx.toolError || 'sin detalle';
  const context = args.context || hookCtx.toolInput || '';

  // Truncar contexto para no inflar la cola
  const contextTrunc = context.length > 500
    ? context.slice(0, 500) + '...[truncado]'
    : context;

  return {
    id:        `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts:        new Date().toISOString(),
    session:   hookCtx.sessionId,
    type,
    tool,
    error:     error.slice(0, 300),
    context:   contextTrunc,
    reported:  false, // false = pendiente de enviar a GitHub
  };
}

// ---------------------------------------------------------------------------
// Leer / escribir cola
// ---------------------------------------------------------------------------

function readQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeQueue(events) {
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(events, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Deduplicacion: no encolar si ya hay un evento identico sin reportar en < 5min
// ---------------------------------------------------------------------------

function isDuplicate(queue, event) {
  const windowMs = 5 * 60 * 1000;
  const cutoff   = Date.now() - windowMs;
  return queue.some(e =>
    !e.reported &&
    e.type  === event.type &&
    e.tool  === event.tool &&
    e.error === event.error &&
    new Date(e.ts).getTime() > cutoff
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// En modo test (inyectado por tests/harness.test.js) no se escribe en la cola
// real -- evita que ejercitar guards con archivos temporales de prueba
// contamine EVENTS_QUEUE.json con eventos que no son fallos reales del arnes.
if (process.env.AI_CORE_TEST_MODE === '1') {
  process.exit(0);
}

const args    = parseArgs();
const hookCtx = getHookContext();

// Si no se especifica tipo y no hay contexto de hook, nada que capturar
if (!args.type && !hookCtx.toolError && !hookCtx.toolName) {
  process.exit(0);
}

const event = buildEvent(args, hookCtx);
const queue = readQueue();

if (isDuplicate(queue, event)) {
  process.exit(0); // evento duplicado — silencioso
}

// Mantener la cola acotada: descartar los reportados mas viejos si hay demasiados
const pending  = queue.filter(e => !e.reported);
const reported = queue.filter(e => e.reported).slice(-10); // conservar ultimos 10 reportados

if (pending.length >= MAX_EVENTS) {
  process.stderr.write('[CAPTURE] Cola llena — evento descartado. Ejecuta issue-reporter.js para vaciar.\n');
  process.exit(0);
}

writeQueue([...reported, ...pending, event]);
process.stderr.write(`[CAPTURE] Evento encolado: ${event.type} | ${event.tool} | id:${event.id}\n`);
