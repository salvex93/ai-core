#!/usr/bin/env node
/**
 * cross-verify-gate.js — Gate de verificacion cross-model (SubagentStop hook)
 *
 * Cuando el subagente que termina es code-reviewer con veredicto APROBADO,
 * dispara CrossVerifier con un proveedor de IA distinto al que genero el diff
 * antes de aceptar el veredicto como final. Ver docs/OPUSPLAN-cross-model-verifier.md.
 *
 * Si no hay proveedor verificador configurado (.env sin OPENAI_API_KEY ni
 * DEEPSEEK_API_KEY) el gate se omite sin bloquear la sesion — no es requisito
 * duro, es una capa adicional cuando esta disponible.
 */

'use strict';

const path = require('node:path');

const { leerEventoDeStdin } = require('./lib/hook-stdin');

const REPO = path.resolve(__dirname, '..', '..');

// CLAUDE_SUBAGENT_TYPE/CLAUDE_SUBAGENT_OUTPUT nunca existieron como variables
// de entorno reales -- SubagentStop entrega el output por stdin como JSON,
// campos agent_type y last_assistant_message (confirmado contra
// code.claude.com/docs/en/hooks).
const evento = leerEventoDeStdin();
const subagentType   = process.env.CLAUDE_SUBAGENT_TYPE   || evento.agent_type || '';
const subagentOutput = process.env.CLAUDE_SUBAGENT_OUTPUT || evento.last_assistant_message || '';

if (subagentType !== 'code-reviewer') {
  process.exit(0);
}

if (!/VEREDICTO:\s*APROBADO/.test(subagentOutput)) {
  // Ya fue REQUIERE_CAMBIOS o BLOQUEADO — no hace falta segunda opinion.
  process.exit(0);
}

async function main() {
  const { execSync } = require('node:child_process');
  const { verificar } = require(path.join(REPO, 'scripts', 'services', 'CrossVerifier.js'));

  let diff = '';
  try {
    diff = execSync('git diff main...HEAD', { cwd: REPO, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } catch {
    process.exit(0); // sin git o sin rama main — no bloquear
  }

  if (!diff.trim()) process.exit(0);

  let resultado;
  try {
    resultado = await verificar({
      diff,
      tarea: 'El diff debe cumplir la tarea del subagente code-reviewer sin romper funcionalidad fuera de su alcance.',
      proveedorActor: 'anthropic',
    });
  } catch (err) {
    console.log(`[cross-verify] omitido — ${err.message}`);
    process.exit(0);
  }

  if (resultado.pass) {
    console.log(`[cross-verify] proveedor:${resultado.proveedor} — veredicto APROBADO confirmado`);
    process.exit(0);
  }

  console.log(`[cross-verify] proveedor:${resultado.proveedor} — veredicto APROBADO revertido, hallazgos:`);
  for (const h of resultado.hallazgos) {
    console.log(`  [${h.severidad}] ${h.descripcion}`);
  }
  process.exit(1);
}

main();
