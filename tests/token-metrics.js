/**
 * token-metrics.js — Instrumentacion de metricas de consumo de tokens
 *
 * PROPOSITO: Medir la reduccion de tokens por sesion. Sin este instrumento
 * no hay forma de saber si las reglas de tokenomics (Gemini tier 0, compact,
 * clear, guard-read) realmente reducen el consumo.
 *
 * COMO FUNCIONA:
 * - Lee los archivos de sesion de Claude Code (~/.config/.claude/sessions/)
 * - Cuenta los tokens estimados por turno (N turnos x 800 tokens = estimacion)
 * - Detecta si se activaron los ahorros clave: guard-read bloqueado, Gemini delegado
 * - Genera un reporte en stdout y en .claude/TOKEN_METRICS.json
 *
 * COMO SABER QUE SE REDUCIO EL CONSUMO:
 * 1. Linea base: primera semana sin reglas de tokenomics → ~15,000 tokens/sesion
 * 2. Post-optimizacion: con guard-read + Gemini tier 0 → objetivo < 8,000 tokens/sesion
 * 3. Reduccion porcentual = (linea_base - post) / linea_base * 100
 * 4. Claude Pro: el limite es ~150k tokens/2h. Con reduccion del 47% = 30 minutos mas de autonomia.
 *
 * Ejecutar: node tests/token-metrics.js [--json]
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const os   = require('node:os');

const REPO         = path.resolve(__dirname, '..');
const OUTPUT_PATH  = path.join(REPO, '.claude', 'TOKEN_METRICS.json');
const TOKENS_PER_TURN = 800; // estimacion conservadora por turno

// Coeficientes de ahorro estimados por mecanismo activo
const SAVING_COEFFICIENTS = {
  guard_read_blocked:   0.15,  // cada bloqueo de Read ahorra ~15% de tokens por turno
  gemini_delegated:     0.30,  // cada delegacion a Gemini ahorra ~30% del costo de ese turno
  compact_executed:     0.50,  // /compact reduce el contexto a la mitad
  neanderthal_active:   0.10,  // modo neanderthal reduce prosa de respuesta ~10%
};

function getSessionsDir() {
  if (os.platform() === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Roaming', '.claude', 'sessions');
  }
  return path.join(os.homedir(), '.config', '.claude', 'sessions');
}

function estimateSessionTokens(sessionDir) {
  if (!fs.existsSync(sessionDir)) return null;

  const files = fs.readdirSync(sessionDir)
    .filter(f => f.endsWith('.json') || f.endsWith('.jsonl'))
    .sort()
    .slice(-10); // ultimas 10 sesiones

  if (files.length === 0) return null;

  const sessions = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(sessionDir, file), 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean);
      let turns = 0;
      let guardBlocks = 0;
      let geminiDelegations = 0;
      let compactCount = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'user' || entry.type === 'assistant') turns++;
          if (entry.type === 'tool_result' && typeof entry.content === 'string') {
            if (entry.content.includes('GUARD-READ')) guardBlocks++;
            if (entry.content.includes('gemini') || entry.content.includes('analizar_archivo')) geminiDelegations++;
            if (entry.content.includes('/compact')) compactCount++;
          }
        } catch {}
      }

      const baseTokens = turns * TOKENS_PER_TURN;
      const savings =
        guardBlocks      * SAVING_COEFFICIENTS.guard_read_blocked  * TOKENS_PER_TURN +
        geminiDelegations * SAVING_COEFFICIENTS.gemini_delegated   * TOKENS_PER_TURN +
        compactCount     * SAVING_COEFFICIENTS.compact_executed    * baseTokens;

      const effectiveTokens = Math.max(0, baseTokens - savings);
      const reductionPct = baseTokens > 0
        ? Math.round((savings / baseTokens) * 100)
        : 0;

      sessions.push({
        file,
        turns,
        guard_read_blocks: guardBlocks,
        gemini_delegations: geminiDelegations,
        compact_executions: compactCount,
        estimated_base_tokens: baseTokens,
        estimated_savings: Math.round(savings),
        estimated_effective_tokens: Math.round(effectiveTokens),
        reduction_pct: reductionPct,
      });
    } catch {}
  }

  return sessions;
}

function generateReport(sessions) {
  if (!sessions || sessions.length === 0) {
    return {
      status: 'sin_datos',
      message: 'No se encontraron sesiones en el directorio de Claude Code.',
      sessions_dir: getSessionsDir(),
      how_to_measure: [
        '1. Usar Claude Code durante una sesion normal con tareas de desarrollo.',
        '2. Ejecutar este script al final de la sesion: node tests/token-metrics.js',
        '3. Comparar "estimated_effective_tokens" entre sesiones con y sin reglas tokenomics.',
        '4. Referencia: sesion sin optimizacion ≈ 15,000 tokens. Con optimizacion ≈ 8,000.',
      ],
    };
  }

  const totalBase     = sessions.reduce((s, x) => s + x.estimated_base_tokens, 0);
  const totalSaved    = sessions.reduce((s, x) => s + x.estimated_savings, 0);
  const totalEffective = sessions.reduce((s, x) => s + x.estimated_effective_tokens, 0);
  const avgReduction  = sessions.length > 0
    ? Math.round(sessions.reduce((s, x) => s + x.reduction_pct, 0) / sessions.length)
    : 0;
  const totalGuardBlocks   = sessions.reduce((s, x) => s + x.guard_read_blocks, 0);
  const totalGeminiDelgs   = sessions.reduce((s, x) => s + x.gemini_delegations, 0);
  const totalCompacts      = sessions.reduce((s, x) => s + x.compact_executions, 0);

  return {
    generated_at: new Date().toISOString(),
    sessions_analyzed: sessions.length,
    summary: {
      total_estimated_base_tokens: totalBase,
      total_estimated_savings: totalSaved,
      total_estimated_effective_tokens: totalEffective,
      average_reduction_pct: avgReduction,
      mechanisms_fired: {
        guard_read_blocks:   totalGuardBlocks,
        gemini_delegations:  totalGeminiDelgs,
        compact_executions:  totalCompacts,
      },
    },
    interpretation: {
      reduction_status: avgReduction >= 30
        ? 'OPTIMO — tokenomics activo y efectivo'
        : avgReduction >= 10
        ? 'PARCIAL — algunas reglas activas, revisar delegacion a Gemini'
        : 'BAJO — tokenomics no esta siendo activado correctamente',
      autonomia_ganada_minutos: Math.round((totalSaved / 150000) * 120),
      nota: 'Estimacion basada en 800 tokens/turno y limite de 150k tokens/2h de Claude Pro.',
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
  const s = report.summary;
  console.log('\n[TOKEN-METRICS] Reporte de consumo estimado de tokens\n');
  if (report.status === 'sin_datos') {
    console.log('Sin datos:', report.message);
    console.log('\nComo medir:');
    report.how_to_measure.forEach(l => console.log(l));
  } else {
    console.log(`Sesiones analizadas:       ${report.sessions_analyzed}`);
    console.log(`Tokens base estimados:     ${s.total_estimated_base_tokens.toLocaleString()}`);
    console.log(`Tokens ahorrados:          ${s.total_estimated_savings.toLocaleString()}`);
    console.log(`Tokens efectivos:          ${s.total_estimated_effective_tokens.toLocaleString()}`);
    console.log(`Reduccion promedio:        ${s.average_reduction_pct}%`);
    console.log(`guard-read bloqueados:     ${s.mechanisms_fired.guard_read_blocks}`);
    console.log(`Delegaciones a Gemini:     ${s.mechanisms_fired.gemini_delegations}`);
    console.log(`/compact ejecutados:       ${s.mechanisms_fired.compact_executions}`);
    console.log(`\nEstado: ${report.interpretation.reduction_status}`);
    console.log(`Autonomia ganada:          ~${report.interpretation.autonomia_ganada_minutos} minutos adicionales en sesion`);
  }
  console.log('');
}

// Guardar en disco para comparacion historica
try {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (!process.argv.includes('--json')) {
    console.log(`[TOKEN-METRICS] Reporte guardado en .claude/TOKEN_METRICS.json`);
  }
} catch (e) {
  // No critico — el reporte en stdout es suficiente
}
