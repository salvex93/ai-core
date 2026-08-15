#!/usr/bin/env node
'use strict';

/**
 * agent-snapshot.js — Backup automatico del archivo objetivo antes de
 * CUALQUIER Write/Edit, tanto de un AGENTE AUTONOMO (aiops-auditor,
 * self-healing-agent, security-scanner, issue-tracker,
 * mcp-registry-navigator) como del hilo principal. Corre en PreToolUse.
 *
 * Cobertura total (hallazgo de auditoria 2026-08-15, paridad con el patron
 * de checkpoints de Cline): antes solo cubria escrituras de subagentes,
 * dejando sin snapshot cualquier edicion directa del hilo principal --
 * revertir a un punto arbitrario de la sesion solo era posible via git
 * manual. Ahora TODA escritura queda registrada, con agentType
 * "hilo-principal" cuando el evento no trae agent_type real.
 *
 * Gap original que cierra: hasta ahora no existia ningun mecanismo de
 * rollback para cambios de un AGENTE (rollback-skill.js solo cubre
 * SKILL.md) ni snapshot previo a que estos agentes escriban -- la unica red
 * de seguridad era git de forma manual, sin ningun comando dedicado.
 *
 * No usa `git stash` para el snapshot: git stash create/store maneja
 * archivos untracked (nuevos) de forma no trivial de restaurar de forma
 * confiable via checkout puntual (el arbol de untracked de un stash no
 * responde a "git checkout <ref> -- <archivo>" igual que un commit normal
 * -- confirmado empiricamente). Una copia de archivo simple a
 * .claude/AGENT_SNAPSHOTS/ es predecible y cubre el caso de archivo nuevo
 * sin depender de comportamiento interno de git.
 *
 * Best-effort: nunca bloquea la escritura si el snapshot falla (ej. disco
 * lleno) -- un guard de backup no debe impedir el flujo normal.
 */

const fs   = require('node:fs');
const path = require('node:path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const evento = leerEventoDeStdin();

const agentType = process.env.CLAUDE_SUBAGENT_TYPE || evento.agent_type || 'hilo-principal';
const filePath   = process.env.CLAUDE_TOOL_INPUT_file_path || evento.tool_input?.file_path || '';

if (!filePath) process.exit(0);

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
  // Retencion de 1000 registros (antes 200) -- con cobertura total (toda
  // edicion del hilo principal, no solo de subagentes) el volumen de
  // snapshots por sesion sube significativamente. Al purgar el excedente,
  // tambien se borran los archivos fisicos de esas entradas -- de lo
  // contrario quedaban huerfanos en disco sin limite real de crecimiento
  // (el indice se acotaba, pero .claude/AGENT_SNAPSHOTS/ seguia creciendo).
  const LIMITE = 1000;
  if (indice.length > LIMITE) {
    const purgados = indice.splice(0, indice.length - LIMITE);
    for (const p of purgados) {
      if (p.snapshotPath) {
        try { fs.unlinkSync(p.snapshotPath); } catch { /* ya no existe o no se pudo borrar -- no bloquear */ }
      }
    }
  }
  guardarIndice(indice);

  // Log silencioso para ediciones del hilo principal (ruido en cada guardado
  // trivial); visible solo para subagentes autonomos, donde el snapshot es
  // la unica red de seguridad ademas de este mensaje.
  if (agentType !== 'hilo-principal') {
    console.log(`[agent-snapshot] backup registrado (id ${id}) antes de que "${agentType}" escriba ${path.basename(filePath)}.`);
  }
} catch (err) {
  // best-effort -- nunca bloquear el flujo del agente por un fallo de backup
  console.error(`[agent-snapshot] no se pudo registrar el snapshot: ${err.message}`);
}

process.exit(0);
