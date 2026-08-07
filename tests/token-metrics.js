/**
 * token-metrics.js — Instrumentacion de metricas de consumo de tokens
 *
 * PROPOSITO: Medir el consumo REAL de tokens por sesion, leyendo el campo
 * usage que Anthropic reporta en cada turno de assistant (no una estimacion
 * heuristica). Sin esto no hay forma de saber si las reglas de tokenomics
 * (Gemini tier 0, compact, clear, guard-read) realmente reducen el consumo.
 *
 * COMO FUNCIONA:
 * - Lee los archivos .jsonl de sesion real de Claude Code
 *   (~/.claude/projects/<proyecto-normalizado>/*.jsonl) -- confirmado que
 *   esta es la ruta real en esta maquina; la ruta previa
 *   (~/.config/.claude/sessions o %APPDATA%/.claude/sessions) nunca existio,
 *   por lo que este script nunca reporto datos desde que se implemento.
 * - El calculo real (suma de input/output/cache_read/cache_creation y el
 *   porcentaje de ahorro por cache) vive en scripts/services/SessionCacheMetrics.js
 *   -- extraido para poder testearlo con datos sinteticos sin depender de
 *   sesiones reales en disco (ver tests/harness/session-cache-metrics-js.test.js).
 *
 * Ejecutar: node tests/token-metrics.js [--json]
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const os   = require('node:os');
const { calcularMetricasDeJsonl } = require('../scripts/services/SessionCacheMetrics');

const REPO        = path.resolve(__dirname, '..');
const OUTPUT_PATH  = path.join(REPO, '.claude', 'TOKEN_METRICS.json');

// Claude Code normaliza la ruta del proyecto reemplazando separadores y ':'
// por '-' para el nombre de carpeta bajo ~/.claude/projects/.
function normalizarNombreProyecto(rutaAbsoluta) {
  return rutaAbsoluta.replace(/[:\\/]/g, '-');
}

function getSessionsDir() {
  return path.join(os.homedir(), '.claude', 'projects', normalizarNombreProyecto(REPO));
}

function leerUsageDeSesion(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return { file: path.basename(filePath), ...calcularMetricasDeJsonl(raw) };
}

function estimateSessionTokens(sessionDir) {
  if (!fs.existsSync(sessionDir)) return null;

  const files = fs.readdirSync(sessionDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ f, mtime: fs.statSync(path.join(sessionDir, f)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime)
    .slice(-10) // ultimas 10 sesiones por fecha de modificacion
    .map(x => x.f);

  if (files.length === 0) return null;

  const sessions = [];
  for (const file of files) {
    try {
      sessions.push(leerUsageDeSesion(path.join(sessionDir, file)));
    } catch { /* archivo corrupto o parcialmente escrito — se omite */ }
  }
  return sessions;
}

function generateReport(sessions) {
  if (!sessions || sessions.length === 0) {
    return {
      status: 'sin_datos',
      message: 'No se encontraron sesiones .jsonl en el directorio real de Claude Code.',
      sessions_dir: getSessionsDir(),
      how_to_measure: [
        '1. Usar Claude Code durante una sesion normal con tareas de desarrollo.',
        '2. Ejecutar este script al final de la sesion: node tests/token-metrics.js',
        '3. Los tokens reportados son reales (message.usage de Anthropic), no estimados.',
        '4. cache_read_tokens es el ahorro real de prompt caching: tokens no reprocesados.',
      ],
    };
  }

  const totalTokensReal    = sessions.reduce((s, x) => s + x.total_tokens_real, 0);
  const totalTokensSinCache = sessions.reduce((s, x) => s + x.total_tokens_sin_cache, 0);
  const totalCacheRead     = sessions.reduce((s, x) => s + x.cache_read_tokens, 0);
  const totalGuardBlocks   = sessions.reduce((s, x) => s + x.guard_read_blocks, 0);
  const totalGeminiDelgs   = sessions.reduce((s, x) => s + x.gemini_delegations, 0);
  const totalCompacts      = sessions.reduce((s, x) => s + x.compact_executions, 0);
  const ahorroCachePct     = totalTokensSinCache > 0
    ? Math.round((totalCacheRead / totalTokensSinCache) * 100)
    : 0;

  return {
    generated_at: new Date().toISOString(),
    sessions_analyzed: sessions.length,
    summary: {
      total_tokens_real: totalTokensReal,
      total_tokens_sin_cache: totalTokensSinCache,
      total_cache_read_tokens: totalCacheRead,
      ahorro_por_cache_pct: ahorroCachePct,
      mechanisms_fired: {
        guard_read_blocks:   totalGuardBlocks,
        gemini_delegations:  totalGeminiDelgs,
        compact_executions:  totalCompacts,
      },
    },
    interpretation: {
      cache_status: ahorroCachePct >= 50
        ? 'OPTIMO — prompt caching activo y efectivo'
        : ahorroCachePct >= 20
        ? 'PARCIAL — cache activo pero con margen de mejora'
        : 'BAJO — poco aprovechamiento de cache_control ephemeral',
      nota: 'total_tokens_real usa los campos usage reales de Anthropic (input+output+cache_creation), no una estimacion por turno. total_tokens_sin_cache suma cache_read para mostrar cuanto se hubiera gastado sin ningun cache hit.',
    },
    sessions,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

const sessionsDir = getSessionsDir();
const sessions    = estimateSessionTokens(sessionsDir);
const report      = generateReport(sessions);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('\n[TOKEN-METRICS] Reporte de consumo REAL de tokens (message.usage de Anthropic)\n');
  if (report.status === 'sin_datos') {
    console.log('Sin datos:', report.message);
    console.log('Directorio buscado:', report.sessions_dir);
    console.log('\nComo medir:');
    report.how_to_measure.forEach(l => console.log(l));
  } else {
    const s = report.summary;
    console.log(`Sesiones analizadas:       ${report.sessions_analyzed}`);
    console.log(`Tokens reales consumidos:  ${s.total_tokens_real.toLocaleString()}`);
    console.log(`Tokens leidos de cache:    ${s.total_cache_read_tokens.toLocaleString()}`);
    console.log(`Ahorro real por cache:     ${s.ahorro_por_cache_pct}%`);
    console.log(`guard-read bloqueados:     ${s.mechanisms_fired.guard_read_blocks}`);
    console.log(`Delegaciones a Gemini:     ${s.mechanisms_fired.gemini_delegations}`);
    console.log(`/compact ejecutados:       ${s.mechanisms_fired.compact_executions}`);
    console.log(`\nEstado: ${report.interpretation.cache_status}`);
  }
  console.log('');
}

// Guardar en disco para comparacion historica
try {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (!process.argv.includes('--json')) {
    console.log(`[TOKEN-METRICS] Reporte guardado en .claude/TOKEN_METRICS.json`);
  }
} catch { /* directorio no escribible — reporte solo en stdout */ }
