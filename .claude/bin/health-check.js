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
const { spawn } = require('child_process');

const ROOT        = path.resolve(__dirname, '../..');
const REPORT_PATH = path.join(ROOT, '.claude', 'HEALTH_REPORT.md');

const { checkDependencies, checkSkills, checkMcpServers } = require('./health-sync');
const { buildSyncReport, buildBanner }                    = require('./health-report');

// -------------------------------------------------------------------
// Gate de sesion — evita re-ejecutar en cada tool call
// -------------------------------------------------------------------

function getSessionId() {
  // Claude Code inyecta CLAUDE_CODE_SESSION_ID en el entorno del hook
  return process.env.CLAUDE_CODE_SESSION_ID || process.env.TERM_SESSION_ID || 'unknown';
}

function getFlagPath(sessionId) {
  return path.join('/tmp', `ai-core-hc-${sessionId}.flag`);
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

main().catch(() => process.exit(0)); // Nunca bloquear el hook
