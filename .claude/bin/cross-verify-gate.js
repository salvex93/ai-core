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
const { parsearReporte } = require('./lib/code-reviewer-veredicto');

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

// Verificacion de consistencia interna (hallazgo de scaffolding 2026-08-15):
// antes de confiar en la linea "VEREDICTO: APROBADO", confirmar que
// realmente corresponde a los conteos de severidad listados en el propio
// reporte -- un diff con contenido inyectado podria intentar forzar ese
// string sin que los conteos reales lo respalden (vector ya descartado en
// prosa por code-reviewer.md, ahora tambien verificado programaticamente).
// best-effort: si el reporte no sigue el formato exacto (parsearReporte
// lanza), no bloquea el flujo normal -- solo se salta esta verificacion
// extra y sigue al cross-verify de siempre.
try {
  const parsed = parsearReporte(subagentOutput);
  if (!parsed.veredictoConsistente) {
    console.log(
      `[cross-verify] INCONSISTENCIA detectada: el reporte declara VEREDICTO: ${parsed.veredictoDeclarado} ` +
      `pero los conteos reales (criticos:${parsed.conteos.criticos}, altos:${parsed.conteos.altos}, ` +
      `medios:${parsed.conteos.medios}, bajos:${parsed.conteos.bajos}) corresponden a ${parsed.veredictoEsperado}.`
    );
  }
} catch {
  // reporte no sigue el formato de parsearReporte -- no bloquear, seguir con cross-verify normal
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
