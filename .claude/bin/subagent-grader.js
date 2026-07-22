#!/usr/bin/env node
'use strict';
/**
 * subagent-grader.js — Hook SubagentStop: grader generico de calidad
 * ("Performance Outcomes" del Claude Agent SDK).
 *
 * Complementa subagent-review.js (patrones de codigo via regex) y
 * cross-verify-gate.js (verificacion cross-model solo para code-reviewer):
 * este hook califica CUALQUIER subagente contra una rubrica de calidad
 * general (completitud, coherencia, riesgos no mencionados) via LLM-as-judge.
 *
 * Igual que injection-guard.js/subagent-review.js: SubagentStop no puede
 * vetar el output ya generado (exit 2 en este evento fuerza al subagente a
 * seguir corriendo, no bloquea la integracion al padre) -- este hook informa
 * el score al padre via stdout para que el operador o el modelo decidan si
 * el trabajo necesita revision antes de continuar.
 *
 * Si no hay proveedor juez disponible (.env sin GEMINI/OPENAI/DEEPSEEK_API_KEY)
 * el grader se omite sin bloquear la sesion -- capa adicional opcional.
 */

const path = require('node:path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const REPO = path.resolve(__dirname, '..', '..');

const UMBRAL_SCORE_BAJO = 50; // por debajo de esto, se marca como riesgo de aceptar sin revisar

async function main() {
  const evento     = leerEventoDeStdin();
  const agentType  = evento.agent_type || 'unknown';
  const output     = evento.last_assistant_message || '';

  if (!output.trim()) process.exit(0);

  const { calificar } = require(path.join(REPO, 'scripts', 'services', 'SubagentGrader.js'));

  let resultado;
  try {
    resultado = await calificar({ output, agentType });
  } catch (err) {
    console.log(`[subagent-grader] omitido — ${err.message}`);
    process.exit(0);
  }

  if (resultado.proveedor === null) {
    // output trivial o sin proveedor disponible — nada que reportar
    process.exit(0);
  }

  const nivel = resultado.score < UMBRAL_SCORE_BAJO ? 'BAJO' : 'OK';
  console.log(`[subagent-grader] subagente:${agentType} — score:${resultado.score}/100 (${nivel}) via ${resultado.proveedor}`);
  console.log(`  motivo: ${resultado.motivo}`);
  if (resultado.riesgos.length > 0) {
    resultado.riesgos.forEach(r => console.log(`  [riesgo] ${r}`));
  }
  if (nivel === 'BAJO') {
    console.log('[subagent-grader] score bajo — revisar el output antes de aceptarlo sin verificacion adicional.');
  }

  process.exit(0);
}

main().catch(() => process.exit(0)); // nunca bloquear el hook
