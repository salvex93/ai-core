#!/usr/bin/env node
/**
 * agent-metrics.js — Observabilidad de agentes (adaptado de agent-house, Addy Osmani)
 *
 * Registra metricas por tool call en PostToolUse:
 *   - herramienta usada, duracion estimada, exito/fallo, tokens estimados
 *
 * El nombre de la herramienta llega por stdin como JSON (campo tool_name),
 * segun el contrato real de hooks de Claude Code -- no existe una variable
 * de entorno equivalente. Ver docs.claude.com/en/docs/claude-code/hooks.
 * --tool sigue soportado como override explicito (uso manual / tests).
 *
 * Comandos:
 *   node agent-metrics.js record [--tool <nombre>] --status <ok|fail> --ms <duracion>
 *   node agent-metrics.js report          — resumen de la sesion actual
 *   node agent-metrics.js report --full   — todas las sesiones
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const REPO    = path.resolve(__dirname, '..', '..');
// AI_CORE_METRICS_PATH permite aislar en tests -- mismo patron que
// AI_CORE_EVENTS_QUEUE_PATH en capture-event.js.
const METRICS = process.env.AI_CORE_METRICS_PATH || path.join(REPO, '.claude', 'AGENT_METRICS.json');

// Cap de detalle por-llamada dentro de una sesion -- gap real de
// production-readiness: data.sessions ya rotaba a MAX_SESSIONS, pero
// session.calls nunca se podaba, asi que una sesion larga (miles de tool
// calls) crecia sin limite pese al cap de sesiones. Los totales agregados
// (session.totals) se acumulan independientemente de calls[] y sobreviven
// la poda -- solo se pierde el detalle por-llamada mas antiguo, no el conteo.
const MAX_CALLS_POR_SESION = 500;

// Costo estimado por tool call (tokens promedio por herramienta)
const TOKEN_COST = {
  'Bash':          150,
  'Read':          300,
  'Write':         400,
  'Edit':          350,
  'mcp__gemini':   200,
  'mcp__anthropic': 500,
  'Agent':        2000,
  'WebSearch':     400,
  'default':       200,
};

function loadMetrics() {
  if (!fs.existsSync(METRICS)) return { sessions: [] };
  try { return JSON.parse(fs.readFileSync(METRICS, 'utf8')); }
  catch { return { sessions: [] }; }
}

function saveMetrics(data) {
  fs.writeFileSync(METRICS, JSON.stringify(data, null, 2), 'utf8');
}

function currentSessionId() {
  return new Date().toISOString().slice(0, 13).replace('T', '-');
}

function estimateTokens(tool) {
  const key = Object.keys(TOKEN_COST).find(k => tool.startsWith(k)) || 'default';
  return TOKEN_COST[key];
}

// ─── Comandos ─────────────────────────────────────────────────────────────────

function leerToolNameDeStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return null;
    const evento = JSON.parse(raw);
    return evento.tool_name || null;
  } catch {
    return null;
  }
}

function cmdRecord(args, toolDesdeStdin) {
  const tool   = args['--tool'] || toolDesdeStdin || 'unknown';
  const status = args['--status'] || 'ok';
  const ms     = parseInt(args['--ms'] || '0', 10);

  const data    = loadMetrics();
  const sid     = currentSessionId();
  let   session = data.sessions.find(s => s.id === sid);

  if (!session) {
    session = { id: sid, startedAt: new Date().toISOString(), calls: [], totals: { ok: 0, fail: 0, tokens: 0, ms: 0 } };
    data.sessions.push(session);
    // mantener max 20 sesiones
    if (data.sessions.length > 20) data.sessions.shift();
  }

  const tokens = estimateTokens(tool);
  session.calls.push({ tool, status, ms, tokens, at: new Date().toISOString() });
  if (session.calls.length > MAX_CALLS_POR_SESION) session.calls.shift();
  session.totals.ok     += status === 'ok' ? 1 : 0;
  session.totals.fail   += status === 'fail' ? 1 : 0;
  session.totals.tokens += tokens;
  session.totals.ms     += ms;

  saveMetrics(data);
}

function cmdReport(full) {
  const data = loadMetrics();
  if (data.sessions.length === 0) { console.log('[metrics] sin datos de sesiones'); return; }

  const sessions = full ? data.sessions : [data.sessions[data.sessions.length - 1]];

  for (const s of sessions) {
    const reliability = s.totals.ok + s.totals.fail > 0
      ? ((s.totals.ok / (s.totals.ok + s.totals.fail)) * 100).toFixed(1)
      : '100.0';

    console.log(`\n[metrics] sesion: ${s.id}`);
    console.log(`  tool calls : ${s.calls.length}`);
    console.log(`  ok / fail  : ${s.totals.ok} / ${s.totals.fail}`);
    console.log(`  fiabilidad : ${reliability}%`);
    console.log(`  tokens est.: ~${s.totals.tokens}`);

    // top 3 herramientas por frecuencia
    const freq = {};
    for (const c of s.calls) freq[c.tool] = (freq[c.tool] || 0) + 1;
    const top3 = Object.entries(freq).sort(([,a],[,b]) => b - a).slice(0, 3);
    if (top3.length) console.log(`  top tools  : ${top3.map(([t,n]) => `${t}(${n})`).join(', ')}`);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────
function main() {
  const argv = process.argv.slice(2);
  const cmd  = argv[0];
  const args = {};
  for (let i = 1; i < argv.length; i += 2) {
    if (argv[i]?.startsWith('--')) args[argv[i]] = argv[i + 1] || true;
  }

  switch (cmd) {
    case 'record': {
      // Solo leer stdin si no vino --tool explicito y hay datos reales entrantes
      // (pipe/redireccion) -- nunca bloquear en una TTY interactiva sin input.
      const toolDesdeStdin = !args['--tool'] && !process.stdin.isTTY
        ? leerToolNameDeStdin()
        : null;
      cmdRecord(args, toolDesdeStdin);
      break;
    }
    case 'report': cmdReport(argv.includes('--full')); break;
    default:
      console.log('Uso: node agent-metrics.js [record --tool <t> --status <ok|fail> --ms <n>|report [--full]]');
  }
}

if (require.main === module) {
  main();
}

module.exports = { cmdRecord, loadMetrics, MAX_CALLS_POR_SESION };
