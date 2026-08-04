'use strict';

/**
 * guard-report.js — Esquema tipado comun para el output de guards de hooks
 * (secrets-guard.js, injection-guard.js, pre-commit-tdd.js, y cualquier guard
 * nuevo que lo adopte).
 *
 * Gap real (benchmark contra Anthropic/OpenAI/Google ADK/open source): cada
 * guard emite su resultado como exit-code + texto libre en stderr/stdout --
 * un consumidor como subagent-grader.js no puede agregar esos resultados sin
 * parseo ad-hoc por guard. Este modulo NO reemplaza el output legible actual
 * (el operador humano lo sigue viendo igual) -- agrega, en paralelo, un
 * registro JSON estructurado por linea (JSONL, append-only) en un archivo
 * efimero de la sesion, consultable por cualquier herramienta que agregue
 * resultados de multiples guards sin conocer el formato de texto de cada uno.
 *
 * Adopcion es opt-in por guard: llamar emitirReporte() no cambia el exit code
 * ni el mensaje que ya escribe el guard, solo agrega el registro tipado.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const VERDICTS  = new Set(['ok', 'warn', 'blocked']);
const SEVERITIES = new Set(['baja', 'media', 'alta', 'critica']);

// AI_CORE_GUARD_REPORT_PATH permite aislar en tests -- sin ella, el reporte
// real de la sesion vive en un archivo por sessionId dentro de os.tmpdir(),
// mismo patron que AI_CORE_EVENTS_QUEUE_PATH y hermanos.
const sessionId = process.env.CLAUDE_CODE_SESSION_ID || 'unknown';
const GUARD_REPORT_PATH = process.env.AI_CORE_GUARD_REPORT_PATH
  || path.join(os.tmpdir(), `ai-core-guard-report-${sessionId}.jsonl`);

/**
 * Escribe (append) un reporte tipado de un guard al archivo JSONL de la
 * sesion. Nunca lanza por fallo de disco -- best-effort, un guard nunca debe
 * bloquear por no poder escribir su telemetria. Si el esquema es invalido
 * (verdict/severity fuera de enum), SI lanza -- eso es un bug del propio
 * guard llamador, no un fallo de entorno a tolerar en silencio.
 *
 * @param {object} reporte
 * @param {string} reporte.guard - nombre del script guard (ej. 'secrets-guard')
 * @param {'ok'|'warn'|'blocked'} reporte.verdict
 * @param {'baja'|'media'|'alta'|'critica'} reporte.severity
 * @param {string[]} [reporte.hallazgos] - etiquetas de los patrones detectados
 * @param {string} [ruta] - override de ruta, solo para tests
 */
function emitirReporte(reporte, ruta = GUARD_REPORT_PATH) {
  const { guard, verdict, severity, hallazgos = [] } = reporte;

  if (!guard) throw new Error('guard-report: falta el campo "guard"');
  if (!VERDICTS.has(verdict)) {
    throw new Error(`guard-report: verdict invalido "${verdict}" -- debe ser uno de: ${[...VERDICTS].join(', ')}`);
  }
  if (!SEVERITIES.has(severity)) {
    throw new Error(`guard-report: severity invalida "${severity}" -- debe ser una de: ${[...SEVERITIES].join(', ')}`);
  }

  const linea = JSON.stringify({
    guard,
    verdict,
    severity,
    hallazgos,
    timestamp: new Date().toISOString(),
  });

  try {
    fs.appendFileSync(ruta, linea + '\n', 'utf8');
  } catch {
    // best-effort -- no bloquear el guard llamador por un fallo de disco
  }
}

module.exports = { emitirReporte, GUARD_REPORT_PATH };
