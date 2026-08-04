'use strict';

/**
 * mcp-lifecycle-check.js — Valida el ciclo de vida declarado (Active/
 * Deprecated/Removed) de los servidores MCP propios contra
 * .claude/MCP_LIFECYCLE.json.
 *
 * Gap real (benchmark contra Anthropic/OpenAI/Google ADK/open source,
 * alineado con la spec MCP 2026-07-28): mcp-integrity-check.js ya sabe QUE
 * servidores MCP propios existen (gemini-bridge, anthropic-router) y detecta
 * si su codigo cambio de forma inesperada, pero no habia ningun registro
 * declarativo de EN QUE ESTADO de ciclo de vida esta cada uno. Sin esto, un
 * servidor deprecado sigue usandose indefinidamente sin ninguna senal
 * explicita de que deberia migrarse.
 *
 * Reutiliza SERVIDORES de mcp-integrity-check.js como fuente unica de verdad
 * de que servidores existen realmente -- este modulo solo valida el ESTADO
 * declarado sobre esa lista, no mantiene su propia copia.
 */

const fs   = require('fs');
const path = require('path');
const { SERVIDORES } = require('./mcp-integrity-check');

const REPO = path.resolve(__dirname, '..', '..');
// AI_CORE_MCP_LIFECYCLE_PATH permite operar sobre un archivo temporal en tests
const LIFECYCLE_PATH = process.env.AI_CORE_MCP_LIFECYCLE_PATH || path.join(REPO, '.claude', 'MCP_LIFECYCLE.json');

const ESTADOS_VALIDOS = new Set(['Active', 'Deprecated', 'Removed']);

/**
 * Verifica que MCP_LIFECYCLE.json declare un estado valido para cada
 * servidor MCP propio real, y que los servidores Deprecated tengan
 * fecha_deprecacion y reemplazo documentados.
 * @returns {{ ok: boolean, hallazgos: string[] }}
 */
function verificarLifecycle() {
  const hallazgos = [];

  if (!fs.existsSync(LIFECYCLE_PATH)) {
    return { ok: false, hallazgos: [`${LIFECYCLE_PATH} no existe`] };
  }

  let lifecycle;
  try {
    lifecycle = JSON.parse(fs.readFileSync(LIFECYCLE_PATH, 'utf8'));
  } catch (e) {
    return { ok: false, hallazgos: [`${LIFECYCLE_PATH} no es JSON valido: ${e.message}`] };
  }

  const declarados = new Map((lifecycle.servidores || []).map(s => [s.name, s]));

  for (const servidorReal of SERVIDORES) {
    const declarado = declarados.get(servidorReal.name);

    if (!declarado) {
      hallazgos.push(`"${servidorReal.name}" existe en mcp-integrity-check.js pero no esta declarado en MCP_LIFECYCLE.json`);
      continue;
    }

    if (!ESTADOS_VALIDOS.has(declarado.estado)) {
      hallazgos.push(`"${servidorReal.name}" tiene estado invalido "${declarado.estado}" -- debe ser uno de: ${[...ESTADOS_VALIDOS].join(', ')}`);
    }

    if (declarado.estado === 'Deprecated') {
      if (!declarado.fecha_deprecacion) hallazgos.push(`"${servidorReal.name}" esta Deprecated pero falta fecha_deprecacion`);
      if (!declarado.reemplazo)         hallazgos.push(`"${servidorReal.name}" esta Deprecated pero falta reemplazo`);
    }
  }

  return { ok: hallazgos.length === 0, hallazgos };
}

if (require.main === module) {
  const r = verificarLifecycle();
  if (r.ok) {
    process.stdout.write('[MCP-LIFECYCLE] OK — todos los servidores MCP propios tienen estado declarado y valido.\n');
    process.exit(0);
  }
  process.stderr.write('[MCP-LIFECYCLE] Hallazgos:\n');
  r.hallazgos.forEach(h => process.stderr.write(`  - ${h}\n`));
  process.exit(1);
}

module.exports = { verificarLifecycle, LIFECYCLE_PATH };
