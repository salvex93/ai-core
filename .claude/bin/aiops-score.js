'use strict';

/**
 * aiops-score.js — Scoring numerico del estado del harness por dimension.
 * Produce un JSON con score 0-10 por dimension y delta vs ejecucion anterior.
 * Persiste el historial en .claude/AIOPS_SCORE_HISTORY.json (max 30 entradas).
 * Funciones de scoring por dimension en lib/aiops-scorers.js.
 *
 * Uso:
 *   node .claude/bin/aiops-score.js           # calcular y persistir
 *   node .claude/bin/aiops-score.js --report  # mostrar ultimo delta
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const {
  scoreRouting,
  scoreHooks,
  scoreSkills,
  scoreDrift,
  scoreSeguridad,
  scoreAgentes,
} = require('./lib/aiops-scorers');

const CORE       = path.resolve(__dirname, '../..');
const HISTORY_F  = path.join(CORE, '.claude', 'AIOPS_SCORE_HISTORY.json');
const SETTINGS_F = path.join(CORE, '.claude', 'settings.json');
const MAP_F      = path.join(CORE, '.claude', 'CONTEXT_MAP.json');
const SKILLS_DIR = path.join(CORE, '.claude', 'skills');
const AGENTS_DIR = path.join(CORE, '.claude', 'agents');
const IC_PATH    = path.join(CORE, 'scripts', 'services', 'IntentClassifier.js');

const MODO_REPORT = process.argv.includes('--report');
const MAX_HISTORY = 30;

function exec(cmd) {
  try { return execSync(cmd, { cwd: CORE, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch (e) { return ''; }
}

// ── CALCULAR SCORE TOTAL ──────────────────────────────────────────────────
function calcularScore() {
  const dimensiones = {
    routing:    scoreRouting({ SETTINGS_F, IC_PATH }),
    hooks:      scoreHooks({ SETTINGS_F }),
    skills:     scoreSkills({ SKILLS_DIR }),
    drift:      scoreDrift({ MAP_F, CORE, exec }),
    seguridad:  scoreSeguridad({ CORE, SETTINGS_F }),
    agentes:    scoreAgentes({ AGENTS_DIR }),
  };

  const total = Math.round(
    Object.values(dimensiones).reduce((s, d) => s + d.score, 0) / Object.keys(dimensiones).length
  );

  return {
    ts:         new Date().toISOString(),
    total,
    dimensiones: Object.fromEntries(
      Object.entries(dimensiones).map(([k, v]) => [k, { score: v.score, detalles: v.detalles }])
    ),
  };
}

// ── PERSISTIR Y CALCULAR DELTA ────────────────────────────────────────────
function cargarHistorial() {
  if (!fs.existsSync(HISTORY_F)) return [];
  try { return JSON.parse(fs.readFileSync(HISTORY_F, 'utf8')); }
  catch { return []; }
}

function guardarHistorial(historial, entrada) {
  historial.push(entrada);
  if (historial.length > MAX_HISTORY) historial.splice(0, historial.length - MAX_HISTORY);
  fs.writeFileSync(HISTORY_F, JSON.stringify(historial, null, 2));
}

function formatDelta(actual, anterior) {
  if (anterior === undefined) return '';
  const d = actual - anterior;
  if (d === 0) return ' (=)';
  return d > 0 ? ` (+${d})` : ` (${d})`;
}

// ── MAIN ──────────────────────────────────────────────────────────────────
const historial = cargarHistorial();
const anterior  = historial[historial.length - 1];

if (MODO_REPORT && anterior) {
  // Solo mostrar el ultimo reporte guardado
  const prev = historial.length >= 2 ? historial[historial.length - 2] : null;
  process.stdout.write(`\n[AIOPS-SCORE] ${anterior.ts.slice(0, 10)} | Total: ${anterior.total}/10\n`);
  Object.entries(anterior.dimensiones).forEach(([dim, data]) => {
    const delta = prev ? formatDelta(data.score, prev.dimensiones[dim]?.score) : '';
    const barra = '█'.repeat(data.score) + '░'.repeat(10 - data.score);
    process.stdout.write(`  ${dim.padEnd(12)} ${barra} ${data.score}/10${delta}\n`);
    data.detalles.forEach(d => process.stdout.write(`               - ${d}\n`));
  });
  process.stdout.write('\n');
  process.exit(0);
}

const actual = calcularScore();
guardarHistorial(historial, actual);

// Gate de verbosidad: solo el reporte completo si el total bajo o hay detalles nuevos.
// En turnos estables (score igual o mejor, sin detalles) basta una linea de confirmacion.
const delta       = anterior ? actual.total - anterior.total : 0;
const hayDetalles = Object.values(actual.dimensiones).some(d => d.detalles.length > 0);

if (anterior && delta >= 0 && !hayDetalles) {
  process.stdout.write(`[AIOPS-SCORE] ${actual.total}/10${delta > 0 ? ` (+${delta})` : ' (=)'}\n`);
  process.exit(0);
}

// Reporte completo con delta
process.stdout.write(`\n[AIOPS-SCORE] ${actual.ts.slice(0, 10)} | Total: ${actual.total}/10`);
if (anterior) {
  process.stdout.write(delta === 0 ? ' (=)' : delta > 0 ? ` (+${delta} vs anterior)` : ` (${delta} vs anterior)`);
}
process.stdout.write('\n');

Object.entries(actual.dimensiones).forEach(([dim, data]) => {
  const dimDelta = anterior ? formatDelta(data.score, anterior.dimensiones[dim]?.score) : '';
  const barra = '█'.repeat(data.score) + '░'.repeat(10 - data.score);
  process.stdout.write(`  ${dim.padEnd(12)} ${barra} ${data.score}/10${dimDelta}\n`);
  data.detalles.forEach(d => process.stdout.write(`               - ${d}\n`));
});
process.stdout.write('\n');
