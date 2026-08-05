#!/usr/bin/env node
'use strict';
/**
 * health-check.js — Orquestador del sistema de salud del harness ai-core.
 *
 * Ejecutado via hook PreToolUse (matcher: Bash) en settings.json.
 * Gate de sesion: solo corre la verificacion completa una vez por sesion.
 * Lanza un worker detached para las verificaciones HTTP asincronas.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { spawn } = require('child_process');

const CORE_PATH   = path.resolve(__dirname, '../..');
const HOST_PATH   = process.cwd();
const ROOT        = CORE_PATH; // alias interno para compatibilidad
const isStandalone = HOST_PATH === CORE_PATH;
const REPORT_PATH = isStandalone
  ? path.join(CORE_PATH, '.claude', 'HEALTH_REPORT.md')
  : path.join(HOST_PATH, '.claude', 'HEALTH_REPORT.md');

const { checkDependencies, checkSkills, checkMcpServers } = require('./health-sync');
const { buildSyncReport, buildBanner }                    = require('./health-report');
const { verificarIntegridad }                             = require('./mcp-integrity-check');

// -------------------------------------------------------------------
// Check de path drift — autocorrige settings.json del anfitrion
// -------------------------------------------------------------------

function checkAndFixPathDrift() {
  if (isStandalone) return { ok: true, fixed: false };

  const hostSettings = path.join(HOST_PATH, '.claude', 'settings.json');
  if (!fs.existsSync(hostSettings)) {
    // No existe — lo crea el norm-harness; aqui solo reportamos
    return { ok: false, fixed: false, reason: 'settings.json del anfitrion no existe — ejecuta norm-harness.js' };
  }

  try {
    const s = JSON.parse(fs.readFileSync(hostSettings, 'utf8'));
    const cwd = s?.mcpServers?.['gemini-bridge']?.cwd;
    if (cwd === CORE_PATH) return { ok: true, fixed: false };

    // Drift detectado — autocorregir via norm-harness
    const { execSync } = require('child_process');
    execSync(`node ${path.join(CORE_PATH, '.claude/bin/norm-harness.js')}`, {
      cwd: HOST_PATH, stdio: 'pipe',
    });
    return { ok: true, fixed: true, from: cwd, to: CORE_PATH };
  } catch (e) {
    return { ok: false, fixed: false, reason: e.message.split('\n')[0] };
  }
}

// -------------------------------------------------------------------
// Gate de sesion — evita re-ejecutar en cada tool call
// -------------------------------------------------------------------

function getSessionId() {
  // Claude Code inyecta CLAUDE_CODE_SESSION_ID en el entorno del hook
  return process.env.CLAUDE_CODE_SESSION_ID || process.env.TERM_SESSION_ID || 'unknown';
}

function getFlagPath(sessionId) {
  return path.join(os.tmpdir(), `ai-core-hc-${sessionId}.flag`);
}

function isFirstRun(flagPath) {
  return !fs.existsSync(flagPath);
}

function markChecked(flagPath) {
  fs.writeFileSync(flagPath, new Date().toISOString());
}

// -------------------------------------------------------------------
// Worker background
// -------------------------------------------------------------------

function launchAsyncWorker() {
  const worker = spawn('node', [path.join(__dirname, 'health-worker.js')], {
    cwd:      ROOT,
    stdio:    'ignore',
    detached: true,
    env:      process.env,
  });
  worker.unref();
}

// -------------------------------------------------------------------
// Versión del proyecto
// -------------------------------------------------------------------

function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return pkg.version ?? '?';
  } catch { return '?'; }
}

// -------------------------------------------------------------------
// Main
// -------------------------------------------------------------------

async function main() {
  const sessionId = getSessionId();
  const flagPath  = getFlagPath(sessionId);

  if (!isFirstRun(flagPath)) {
    process.exit(0); // < 5ms — sesión ya verificada
  }

  markChecked(flagPath);

  const meta = {
    version:   getVersion(),
    ts:        new Date().toISOString(),
    sessionId: sessionId.slice(0, 8),
  };

  // Autocorreccion de path drift antes de cualquier check
  const drift = checkAndFixPathDrift();
  if (drift.fixed) {
    process.stderr.write(`[DRIFT] settings.json autocorregido: ${drift.from} → ${drift.to}\n`);
  } else if (!drift.ok && drift.reason) {
    process.stderr.write(`[DRIFT] ${drift.reason}\n`);
  }

  // Checks síncronos en paralelo (< 3s si npm está OK)
  const [deps, skills, mcp] = await Promise.all([
    Promise.resolve(checkDependencies(ROOT)),
    Promise.resolve(checkSkills(ROOT)),
    checkMcpServers(ROOT),
  ]);

  const results = { deps, skills, mcp };

  // Generar reporte en disco
  const report = buildSyncReport(results, meta);
  fs.writeFileSync(REPORT_PATH, report);

  // ASI04 — supply-chain de los servidores MCP propios (gemini-bridge,
  // anthropic-router). Solo informa, nunca bloquea.
  if (isStandalone) {
    try {
      const integridad = verificarIntegridad();
      if (!integridad.ok) {
        process.stderr.write(`[MCP-INTEGRITY] ${integridad.cambios.length} cambio(s) detectado(s):\n`);
        integridad.cambios.forEach(c => process.stderr.write(`  - ${c.server}: ${c.motivo}\n`));
      }
    } catch { /* verificacion best-effort, nunca bloquea el hook */ }
  }

  // Banner para stderr (Claude Code lo muestra como output del hook)
  const issues = [
    !deps.ok   && 'deps',
    !skills.ok && 'skills',
    ...mcp.filter(s => !s.ok).map(s => `MCP:${s.server}`),
  ].filter(Boolean);

  const banner = buildBanner(issues.length > 0, issues.length, meta.ts.slice(0, 10));
  process.stderr.write(banner + '\n');

  // Worker async — no bloquea
  launchAsyncWorker();
}

main().catch((err) => {
  process.stderr.write(`[HEALTH-CHECK] fallo no bloqueante: ${err.message}\n`);
  process.exit(0); // Nunca bloquear el hook
});
