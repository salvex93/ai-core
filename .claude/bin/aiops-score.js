'use strict';

/**
 * aiops-score.js — Scoring numerico del estado del harness por dimension.
 * Produce un JSON con score 0-10 por dimension y delta vs ejecucion anterior.
 * Persiste el historial en .claude/AIOPS_SCORE_HISTORY.json (max 30 entradas).
 *
 * Dimensiones:
 *   routing     — IntentClassifier: señales por rol, fallback rate
 *   verbosidad  — Longitud promedio de respuestas (via EVENTS_QUEUE si hay datos)
 *   hooks       — Cobertura de eventos: cuantos tipos de hook estan activos
 *   skills      — Conformidad estructural de skills (validate-globals)
 *   drift       — Estado del CONTEXT_MAP
 *   seguridad   — Ausencia de patrones criticos en scripts del harness
 *
 * Uso:
 *   node .claude/bin/aiops-score.js           # calcular y persistir
 *   node .claude/bin/aiops-score.js --report  # mostrar ultimo delta
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CORE       = path.resolve(__dirname, '../..');
const HISTORY_F  = path.join(CORE, '.claude', 'AIOPS_SCORE_HISTORY.json');
const SETTINGS_F = path.join(CORE, '.claude', 'settings.json');
const QUEUE_F    = path.join(CORE, '.claude', 'EVENTS_QUEUE.json');
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

// ── 1. ROUTING (0-10) ─────────────────────────────────────────────────────
// Mide la calidad del IntentClassifier: cuantas señales tiene cada rol,
// si el empate Coder/Architect está resuelto y si el hook UserPromptSubmit existe
function scoreRouting() {
  let score = 0;
  const detalles = [];

  // Hook UserPromptSubmit activo (+3)
  try {
    const cfg = JSON.parse(fs.readFileSync(SETTINGS_F, 'utf8'));
    if (cfg.hooks && cfg.hooks.UserPromptSubmit) {
      score += 3;
    } else {
      detalles.push('UserPromptSubmit hook ausente');
    }
  } catch { detalles.push('settings.json no parseable'); }

  // IntentClassifier existe (+2)
  if (fs.existsSync(IC_PATH)) {
    score += 2;
    // Señales por rol suficientes (+2 si >= 10 señales totales)
    const contenido = fs.readFileSync(IC_PATH, 'utf8');
    const matches = contenido.match(/\/[^/]+\/[gimsuy]*/g) || [];
    const senales = matches.filter(r => r.length > 5).length;
    if (senales >= 20) { score += 3; }
    else if (senales >= 10) { score += 2; detalles.push(`Solo ${senales} señales en IC`); }
    else { detalles.push(`Señales insuficientes: ${senales}`); }
  } else {
    detalles.push('IntentClassifier.js no encontrado');
  }

  // secrets-guard activo (+2)
  try {
    const cfg = JSON.parse(fs.readFileSync(SETTINGS_F, 'utf8'));
    const hooks = cfg.hooks?.UserPromptSubmit?.[0]?.hooks || [];
    if (hooks.some(h => h.command && h.command.includes('secrets-guard'))) {
      score += 2;
    } else {
      detalles.push('secrets-guard no activo en UserPromptSubmit');
    }
  } catch { /**/ }

  return { score: Math.min(score, 10), detalles };
}

// ── 2. HOOKS (0-10) ──────────────────────────────────────────────────────
// Mide cobertura de hooks: cuantos tipos activos y cuantos scripts de bin/ usados
function scoreHooks() {
  let score = 0;
  const detalles = [];

  try {
    const cfg = JSON.parse(fs.readFileSync(SETTINGS_F, 'utf8'));
    const tipos = Object.keys(cfg.hooks || {});
    const esperados = ['UserPromptSubmit', 'Stop', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure'];

    esperados.forEach(t => {
      if (tipos.includes(t)) score += 2;
      else detalles.push(`Hook ${t} ausente`);
    });

    // security-check en PostToolUse (+0 extra — ya contado en Stop)
    const postHooks = cfg.hooks?.PostToolUse || [];
    const allCmds = postHooks.flatMap(h => (h.hooks || []).map(x => x.command || ''));
    if (allCmds.some(c => c.includes('security-check'))) score = Math.min(score + 0, 10);

  } catch { detalles.push('settings.json no parseable'); }

  return { score: Math.min(score, 10), detalles };
}

// ── 3. SKILLS (0-10) ─────────────────────────────────────────────────────
// 32 skills esperados, cada uno con las secciones obligatorias
function scoreSkills() {
  let score = 0;
  const detalles = [];

  if (!fs.existsSync(SKILLS_DIR)) return { score: 0, detalles: ['skills/ no encontrado'] };

  const dirs = fs.readdirSync(SKILLS_DIR).filter(d =>
    fs.statSync(path.join(SKILLS_DIR, d)).isDirectory()
  );

  const total    = dirs.length;
  const esperado = 32;
  const SECCIONES = ['Primera Accion al Activar', 'Directiva de Interrupcion', 'Restricciones del Perfil'];

  let conformes = 0;
  dirs.forEach(d => {
    const f = path.join(SKILLS_DIR, d, 'SKILL.md');
    if (!fs.existsSync(f)) { detalles.push(`${d}: SKILL.md faltante`); return; }
    const txt = fs.readFileSync(f, 'utf8');
    const ok = SECCIONES.every(s => txt.includes(s));
    if (ok) conformes++;
    else detalles.push(`${d}: secciones faltantes`);
  });

  // 32 skills presentes → +4; conformidad → hasta +6
  if (total >= esperado) score += 4;
  else { score += 2; detalles.push(`Solo ${total}/${esperado} skills`); }

  score += Math.round((conformes / Math.max(total, 1)) * 6);

  return { score: Math.min(score, 10), detalles };
}

// ── 4. DRIFT (0-10) ──────────────────────────────────────────────────────
function scoreDrift() {
  let score = 10;
  const detalles = [];

  if (!fs.existsSync(MAP_F)) return { score: 0, detalles: ['CONTEXT_MAP.json no encontrado'] };

  try {
    const mapa = JSON.parse(fs.readFileSync(MAP_F, 'utf8'));
    const totalMapa = mapa.host?.total_files || 0;

    const gitFiles = exec('git ls-files | wc -l');
    const totalGit = parseInt(gitFiles, 10) || 0;
    const diff = Math.abs(totalMapa - totalGit);

    if (diff === 0) { /* perfecto */ }
    else if (diff <= 2) { score -= 2; detalles.push(`Drift leve: ${diff} archivos`); }
    else if (diff <= 5) { score -= 5; detalles.push(`Drift moderado: ${diff} archivos`); }
    else { score -= 8; detalles.push(`Drift critico: ${diff} archivos`); }

    // Verificar version del mapa vs package.json
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(CORE, 'package.json'), 'utf8'));
      if (mapa.version !== pkg.version) {
        score -= 1;
        detalles.push(`Version del mapa (${mapa.version}) != package.json (${pkg.version})`);
      }
    } catch { /**/ }

  } catch { return { score: 0, detalles: ['CONTEXT_MAP.json no parseable'] }; }

  return { score: Math.max(score, 0), detalles };
}

// ── 5. SEGURIDAD (0-10) ───────────────────────────────────────────────────
// Verifica que los scripts del harness no tengan patrones criticos
function scoreSeguridad() {
  let score = 10;
  const detalles = [];

  const BIN_DIR = path.join(CORE, '.claude', 'bin');
  // excluir el propio scorer y scripts que contienen regex como datos (security-check, subagent-review)
  const EXCLUIR = ['aiops-score.js', 'security-check.js', 'subagent-review.js'];
  const scripts = fs.readdirSync(BIN_DIR).filter(f => f.endsWith('.js') && !EXCLUIR.includes(f));

  const CRITICOS = [
    /catch\s*\([^)]*\)\s*\{\s*\}/,            // catch vacio
    /[^/'"]\beval\s*\(/,                       // eval() real (no en strings ni comentarios)
    /process\.exit\s*\(\s*[3-9]\s*\)/,        // exit con codigo > 2 (2 es valido en guards)
  ];

  let hallazgos = 0;
  scripts.forEach(s => {
    const contenido = fs.readFileSync(path.join(BIN_DIR, s), 'utf8');
    CRITICOS.forEach(re => {
      if (re.test(contenido)) {
        hallazgos++;
        detalles.push(`${s}: patron critico detectado`);
      }
    });
  });

  // security-check.js activo en PostToolUse (+bonus cobertura)
  try {
    const cfg = JSON.parse(fs.readFileSync(SETTINGS_F, 'utf8'));
    const postHooks = cfg.hooks?.PostToolUse || [];
    const allCmds = postHooks.flatMap(h => (h.hooks || []).map(x => x.command || ''));
    if (!allCmds.some(c => c.includes('security-check'))) {
      score -= 2;
      detalles.push('security-check no activo en PostToolUse');
    }
  } catch { /**/ }

  score = Math.max(score - hallazgos * 2, 0);
  return { score: Math.min(score, 10), detalles };
}

// ── 6. AGENTES (0-10) ────────────────────────────────────────────────────
// Cobertura de agentes vs skills que los requieren, y precondiciones presentes
function scoreAgentes() {
  let score = 0;
  const detalles = [];

  if (!fs.existsSync(AGENTS_DIR)) return { score: 0, detalles: ['agents/ no encontrado'] };

  const agentes = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));
  const esperados = 5;

  if (agentes.length >= esperados) score += 4;
  else { score += 2; detalles.push(`Solo ${agentes.length}/${esperados} agentes`); }

  // Precondiciones presentes en cada agente (+1 por agente con sección)
  let conPrecondicion = 0;
  agentes.forEach(a => {
    const txt = fs.readFileSync(path.join(AGENTS_DIR, a), 'utf8');
    if (txt.includes('Precondiciones de Lanzamiento')) conPrecondicion++;
  });

  score += Math.round((conPrecondicion / Math.max(agentes.length, 1)) * 6);

  if (conPrecondicion < agentes.length) {
    detalles.push(`${agentes.length - conPrecondicion} agente(s) sin Precondiciones`);
  }

  return { score: Math.min(score, 10), detalles };
}

// ── CALCULAR SCORE TOTAL ──────────────────────────────────────────────────
function calcularScore() {
  const dimensiones = {
    routing:    scoreRouting(),
    hooks:      scoreHooks(),
    skills:     scoreSkills(),
    drift:      scoreDrift(),
    seguridad:  scoreSeguridad(),
    agentes:    scoreAgentes(),
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

// Imprimir reporte con delta
process.stdout.write(`\n[AIOPS-SCORE] ${actual.ts.slice(0, 10)} | Total: ${actual.total}/10`);
if (anterior) {
  const d = actual.total - anterior.total;
  process.stdout.write(d === 0 ? ' (=)' : d > 0 ? ` (+${d} vs anterior)` : ` (${d} vs anterior)`);
}
process.stdout.write('\n');

Object.entries(actual.dimensiones).forEach(([dim, data]) => {
  const delta = anterior ? formatDelta(data.score, anterior.dimensiones[dim]?.score) : '';
  const barra = '█'.repeat(data.score) + '░'.repeat(10 - data.score);
  process.stdout.write(`  ${dim.padEnd(12)} ${barra} ${data.score}/10${delta}\n`);
  data.detalles.forEach(d => process.stdout.write(`               - ${d}\n`));
});
process.stdout.write('\n');
