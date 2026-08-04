'use strict';

/**
 * mcp-integrity-check.js — Verificacion minima de supply-chain para los
 * servidores MCP propios del arnes (ASI04 — OWASP Top 10 for Agentic
 * Applications 2026: Agentic Supply Chain Vulnerabilities).
 *
 * Alcance deliberadamente acotado: gemini-bridge (scripts/mcp-gemini.js) y
 * anthropic-router (scripts/mcp-anthropic.js) son servidores MCP PROPIOS del
 * arnes, no de terceros -- ya son auditables leyendo el codigo directamente.
 * El riesgo real de supply-chain de MCPs de terceros ya lo cubre el skill
 * `mcp-registry-navigator` antes de instalar cualquier servidor externo.
 *
 * Este check solo detecta que el hash de esos 2 archivos no cambio de forma
 * inesperada entre sesiones (ej: un proceso o dependencia externa los
 * sobreescribio sin que el desarrollador lo hiciera a proposito). No bloquea
 * -- un cambio legitimo del propio desarrollador es normal y esperado; el
 * check solo informa para que el operador confirme si el cambio fue suyo.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const REPO         = path.resolve(__dirname, '..', '..');
// AI_CORE_MCP_BASELINE_PATH permite operar sobre un baseline temporal en tests
const BASELINE_PATH = process.env.AI_CORE_MCP_BASELINE_PATH || path.join(REPO, '.claude', 'MCP_INTEGRITY_BASELINE.json');

const SERVIDORES = [
  { name: 'gemini-bridge',    script: path.join(REPO, 'scripts', 'mcp-gemini.js') },
  { name: 'anthropic-router', script: path.join(REPO, 'scripts', 'mcp-anthropic.js') },
];

function hashArchivo(rutaAbsoluta) {
  if (!fs.existsSync(rutaAbsoluta)) return null;
  const contenido = fs.readFileSync(rutaAbsoluta);
  return crypto.createHash('sha256').update(contenido).digest('hex');
}

function cargarBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); }
  catch { return null; }
}

function guardarBaseline(hashes) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify({ ts: new Date().toISOString(), hashes }, null, 2), 'utf8');
}

/**
 * Verifica la integridad de los servidores MCP propios contra el baseline
 * conocido. Si no hay baseline previo, lo crea (primera ejecucion).
 *
 * @returns {{ ok: boolean, cambios: Array<{server: string, motivo: string}>, primeraEjecucion: boolean }}
 */
function verificarIntegridad() {
  const hashesActuales = {};
  for (const s of SERVIDORES) hashesActuales[s.name] = hashArchivo(s.script);

  const baseline = cargarBaseline();

  if (!baseline) {
    guardarBaseline(hashesActuales);
    return { ok: true, cambios: [], primeraEjecucion: true };
  }

  const cambios = [];
  for (const s of SERVIDORES) {
    const actual   = hashesActuales[s.name];
    const previo   = baseline.hashes[s.name];

    if (actual === null) {
      cambios.push({ server: s.name, motivo: 'archivo ya no existe' });
    } else if (previo === undefined) {
      cambios.push({ server: s.name, motivo: 'servidor nuevo, sin baseline previo' });
    } else if (actual !== previo) {
      cambios.push({ server: s.name, motivo: 'hash distinto al baseline registrado' });
    }
  }

  // Actualizar el baseline al estado actual -- un cambio detectado una vez
  // no debe re-alertar en cada sesion siguiente si el operador ya lo vio.
  if (cambios.length > 0) guardarBaseline(hashesActuales);

  return { ok: cambios.length === 0, cambios, primeraEjecucion: false };
}

module.exports = { verificarIntegridad, SERVIDORES };

if (require.main === module) {
  const r = verificarIntegridad();
  if (r.primeraEjecucion) {
    console.log('[mcp-integrity] baseline inicial creado para gemini-bridge y anthropic-router');
  } else if (!r.ok) {
    console.log(`[mcp-integrity] ${r.cambios.length} cambio(s) detectado(s) desde la ultima verificacion:`);
    r.cambios.forEach(c => console.log(`  - ${c.server}: ${c.motivo}`));
    console.log('[mcp-integrity] si el cambio es tuyo, no requiere accion. Baseline actualizado.');
  }
  process.exit(0);
}
