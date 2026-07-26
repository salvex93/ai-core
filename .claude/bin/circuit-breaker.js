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
const QUEUE_PATH = process.env.AI_CORE_EVENTS_QUEUE_PATH || path.join(REPO, '.claude', 'EVENTS_QUEUE.json');

const UMBRAL_FALLOS  = 3;              // fallos consecutivos que abren el circuito
const VENTANA_MS     = 5 * 60 * 1000;  // 5 min — solo cuentan fallos recientes
const VENTANA_AGUDA_MS = 60 * 1000;    // fallos agrupados aqui = degradacion aguda (no solo lenta)

/**
 * Evalua si el circuito de una herramienta esta abierto (deberia evitarse
 * reintentarla) segun los eventos mcp_failure recientes no reportados.
 *
 * Predictivo: ademas de contar fallos dentro de VENTANA_MS, distingue la
 * TASA de degradacion -- si los fallos que abren el circuito ocurrieron
 * agrupados dentro de VENTANA_AGUDA_MS, es degradacion aguda (el MCP
 * probablemente sigue caido ahora mismo) en vez de degradacion lenta
 * (fallos intermitentes distribuidos en toda la ventana de 5 min). Nunca
 * bloquea la llamada en ningun caso -- solo escala la severidad del aviso.
 *
 * @param {string} tool - nombre de la herramienta MCP (ej: 'gemini-bridge')
 * @param {Array}  eventos - eventos de EVENTS_QUEUE.json
 * @param {number}  ahora - timestamp de referencia en ms (Date.now() por defecto)
 * @returns {{ abierto: boolean, fallos: number, severidad: 'critico'|'aviso'|null }}
 */
function evaluarCircuito(tool, eventos, ahora = Date.now()) {
  const cutoff = ahora - VENTANA_MS;

  const fallosRecientes = eventos.filter(e =>
    e.type === 'mcp_failure' &&
    e.tool === tool &&
    !e.reported &&
    new Date(e.ts).getTime() > cutoff
  );

  const abierto = fallosRecientes.length >= UMBRAL_FALLOS;
  if (!abierto) return { abierto: false, fallos: fallosRecientes.length, severidad: null };

  const timestamps  = fallosRecientes.map(e => new Date(e.ts).getTime());
  const masAntiguo  = Math.min(...timestamps);
  const severidad   = (ahora - masAntiguo) <= VENTANA_AGUDA_MS ? 'critico' : 'aviso';

  return { abierto: true, fallos: fallosRecientes.length, severidad };
}

function leerQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')); }
  catch { return []; }
}

module.exports = { evaluarCircuito, UMBRAL_FALLOS, VENTANA_MS, VENTANA_AGUDA_MS };

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
    const etiqueta = r.severidad === 'critico' ? 'CRITICO' : 'AVISO';
    const urgencia = r.severidad === 'critico'
      ? `todos concentrados en el ultimo minuto — degradacion aguda, probablemente sigue caido ahora mismo`
      : `distribuidos en los ultimos ${VENTANA_MS / 60000} min — degradacion intermitente`;
    process.stderr.write(
      `[CIRCUIT-BREAKER] ${etiqueta}: ${servidor} tuvo ${r.fallos} fallos consecutivos, ${urgencia}. ` +
      'Considera usar el tier de costo inmediato superior (ver jerarquia en CLAUDE.md) en vez de reintentar.\n'
    );
  }

  process.exit(0);
}
