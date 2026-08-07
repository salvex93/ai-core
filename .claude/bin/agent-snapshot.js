#!/usr/bin/env node
'use strict';

/**
 * agent-snapshot.js — Backup automatico del archivo objetivo antes de que un
 * AGENTE AUTONOMO (aiops-auditor, self-healing-agent, map-updater,
 * security-scanner, issue-tracker, mcp-registry-navigator) lo escriba via
 * Write/Edit. Corre en PreToolUse.
 *
 * Gap real que cierra: hasta ahora no existia ningun mecanismo de rollback
 * para cambios de un AGENTE (rollback-skill.js solo cubre SKILL.md) ni
 * snapshot previo a que estos 6 agentes escriban -- la unica red de
 * seguridad era git de forma manual, sin ningun comando dedicado.
 *
 * No usa `git stash` para el snapshot: git stash create/store maneja
 * archivos untracked (nuevos) de forma no trivial de restaurar de forma
 * confiable via checkout puntual (el arbol de untracked de un stash no
 * responde a "git checkout <ref> -- <archivo>" igual que un commit normal
 * -- confirmado empiricamente). Una copia de archivo simple a
 * .claude/AGENT_SNAPSHOTS/ es predecible y cubre el caso de archivo nuevo
 * sin depender de comportamiento interno de git.
 *
 * Solo corre si el evento trae agent_type (la escritura se origina dentro
 * de un subagente, no del hilo principal) -- el humano trabajando
 * directamente no necesita este snapshot, ya tiene git como red de
 * seguridad normal para su propio trabajo.
 *
 * Best-effort: nunca bloquea la escritura si el snapshot falla (ej. disco
 * lleno) -- un guard de backup no debe impedir el flujo normal del agente.
 */

const fs   = require('node:fs');
const path = require('node:path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const evento = leerEventoDeStdin();

const agentType = process.env.CLAUDE_SUBAGENT_TYPE || evento.agent_type || '';
const filePath   = process.env.CLAUDE_TOOL_INPUT_file_path || evento.tool_input?.file_path || '';

if (!agentType || !filePath) process.exit(0);

// AI_CORE_AGENT_SNAPSHOTS_DIR permite aislar en tests.
const REPO = process.env.AI_CORE_AGENT_SNAPSHOTS_REPO || path.resolve(__dirname, '..', '..');
const SNAPSHOTS_DIR = process.env.AI_CORE_AGENT_SNAPSHOTS_DIR
  || path.join(REPO, '.claude', 'AGENT_SNAPSHOTS');
const INDEX_FILE = path.join(SNAPSHOTS_DIR, 'index.json');

function leerIndice() {
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); } catch { return []; }
}

function guardarIndice(indice) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(indice, null, 2), 'utf8');
}

try {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

  const existiaAntes = fs.existsSync(filePath);
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const nombreOriginal = path.basename(filePath);
  const snapshotPath = existiaAntes ? path.join(SNAPSHOTS_DIR, `${id}-${nombreOriginal}`) : null;

  if (existiaAntes) {
    fs.copyFileSync(filePath, snapshotPath);
  }

  const indice = leerIndice();
  indice.push({
    id,
    ts: Date.now(),
    agentType,
    filePath: path.resolve(filePath),
    existiaAntes,
    snapshotPath,
  });
  // Mantener solo los ultimos 200 registros -- backstop simple contra
  // crecimiento sin limite en sesiones largas con muchos agentes autonomos.
  if (indice.length > 200) indice.splice(0, indice.length - 200);
  guardarIndice(indice);

  console.log(`[agent-snapshot] backup registrado (id ${id}) antes de que "${agentType}" escriba ${path.basename(filePath)}.`);
} catch (err) {
  // best-effort -- nunca bloquear el flujo del agente por un fallo de backup
  console.error(`[agent-snapshot] no se pudo registrar el snapshot: ${err.message}`);
}

process.exit(0);
