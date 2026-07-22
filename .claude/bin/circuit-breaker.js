'use strict';

/**
 * circuit-breaker.js — Circuit-breaker de fallos en cascada (ASI08 — OWASP
 * Top 10 for Agentic Applications 2026: Cascading (Agent) Failures).
 *
 * PostToolUseFailure ya registra cada fallo de MCP en EVENTS_QUEUE.json via
 * capture-event.js, pero esa captura es puramente reactiva -- nada impide
 * que se reintente la misma herramienta fallida turno tras turno dentro de
 * la misma sesion, gastando tokens y tiempo en una llamada condenada a
 * fallar de nuevo. Este modulo cuenta fallos consecutivos recientes por
 * herramienta y abre el circuito (avisa, no bloquea de forma dura -- un MCP
 * externo puede recuperarse) cuando se supera el umbral dentro de la
 * ventana de tiempo.
 *
 * Uso: node circuit-breaker.js (via hook PreToolUse, recibe el evento por
 * stdin para saber que herramienta MCP se va a invocar)
 */

const fs   = require('fs');
const path = require('path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const REPO       = path.resolve(__dirname, '..', '..');
const QUEUE_PATH = path.join(REPO, '.claude', 'EVENTS_QUEUE.json');

const UMBRAL_FALLOS = 3;              // fallos consecutivos que abren el circuito
const VENTANA_MS    = 5 * 60 * 1000;  // 5 min — solo cuentan fallos recientes

/**
 * Evalua si el circuito de una herramienta esta abierto (deberia evitarse
 * reintentarla) segun los eventos mcp_failure recientes no reportados.
 *
 * @param {string} tool - nombre de la herramienta MCP (ej: 'gemini-bridge')
 * @param {Array}  eventos - eventos de EVENTS_QUEUE.json
 * @param {number}  ahora - timestamp de referencia en ms (Date.now() por defecto)
 * @returns {{ abierto: boolean, fallos: number }}
 */
function evaluarCircuito(tool, eventos, ahora = Date.now()) {
  const cutoff = ahora - VENTANA_MS;

  const fallosRecientes = eventos.filter(e =>
    e.type === 'mcp_failure' &&
    e.tool === tool &&
    !e.reported &&
    new Date(e.ts).getTime() > cutoff
  );

  return { abierto: fallosRecientes.length >= UMBRAL_FALLOS, fallos: fallosRecientes.length };
}

function leerQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')); }
  catch { return []; }
}

module.exports = { evaluarCircuito, UMBRAL_FALLOS, VENTANA_MS };

if (require.main === module) {
  const evento   = leerEventoDeStdin();
  const toolName = evento.tool_name || '';

  // Solo aplica a llamadas MCP -- el nombre de tool para MCP sigue el
  // patron mcp__<servidor>__<herramienta>.
  const match = toolName.match(/^mcp__([^_]+(?:-[^_]+)*)__/);
  if (!match) process.exit(0);

  const servidor = match[1];
  const queue    = leerQueue();
  const r        = evaluarCircuito(servidor, queue);

  if (r.abierto) {
    process.stderr.write(
      `[CIRCUIT-BREAKER] AVISO: ${servidor} tuvo ${r.fallos} fallos consecutivos en los ultimos ${VENTANA_MS / 60000} min. ` +
      'Considera usar el tier de costo inmediato superior (ver jerarquia en CLAUDE.md) en vez de reintentar.\n'
    );
  }

  process.exit(0);
}
