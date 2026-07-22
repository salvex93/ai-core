'use strict';

/**
 * aiops-scorers.js — Funciones de scoring por dimension usadas por aiops-score.js.
 * Cada funcion recibe las rutas del harness y retorna { score: 0-10, detalles: string[] }.
 */

const fs = require('fs');
const path = require('path');

// ── 1. ROUTING (0-10) ─────────────────────────────────────────────────────
// Mide la calidad del IntentClassifier: cuantas señales tiene cada rol,
// si el empate Coder/Architect está resuelto y si el hook UserPromptSubmit existe
function scoreRouting({ SETTINGS_F, IC_PATH }) {
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
function scoreHooks({ SETTINGS_F }) {
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
// El total esperado se descubre en disco (auto-discovery), no es un numero fijo.
// El score de esta dimension mide unicamente conformidad estructural.
function scoreSkills({ SKILLS_DIR }) {
  let score = 0;
  const detalles = [];

  if (!fs.existsSync(SKILLS_DIR)) return { score: 0, detalles: ['skills/ no encontrado'] };

  const dirs = fs.readdirSync(SKILLS_DIR).filter(d =>
    fs.statSync(path.join(SKILLS_DIR, d)).isDirectory()
  );

  const total    = dirs.length;
  const SECCIONES = ['Primera Accion al Activar', 'Directiva de Interrupcion', 'Restricciones del Perfil'];

  if (total === 0) return { score: 0, detalles: ['ningun skill encontrado en disco'] };

  let conformes = 0;
  dirs.forEach(d => {
    const f = path.join(SKILLS_DIR, d, 'SKILL.md');
    if (!fs.existsSync(f)) { detalles.push(`${d}: SKILL.md faltante`); return; }
    const txt = fs.readFileSync(f, 'utf8');
    const ok = SECCIONES.every(s => txt.includes(s));
    if (ok) conformes++;
    else detalles.push(`${d}: secciones faltantes`);
  });

  // Score proporcional a la conformidad real, sin comparar contra un total fijo
  score = Math.round((conformes / total) * 10);
  if (conformes < total) detalles.unshift(`${conformes}/${total} skills conformes`);

  return { score: Math.min(score, 10), detalles };
}

// ── 4. DRIFT (0-10) ──────────────────────────────────────────────────────
function scoreDrift({ MAP_F, CORE, exec }) {
  let score = 10;
  const detalles = [];

  if (!fs.existsSync(MAP_F)) return { score: 0, detalles: ['CONTEXT_MAP.json no encontrado'] };

  try {
    const mapa = JSON.parse(fs.readFileSync(MAP_F, 'utf8'));
    const totalMapa = mapa.host?.total_files || 0;

    const gitFiles = exec('git ls-files');
    const totalGit = gitFiles ? gitFiles.split('\n').filter(Boolean).length : 0;
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
function scoreSeguridad({ CORE, SETTINGS_F }) {
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
function scoreAgentes({ AGENTS_DIR }) {
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

module.exports = {
  scoreRouting,
  scoreHooks,
  scoreSkills,
  scoreDrift,
  scoreSeguridad,
  scoreAgentes,
};
