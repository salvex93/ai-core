#!/usr/bin/env node
'use strict';
/**
 * issue-reporter.js — Procesa EVENTS_QUEUE.json y abre issues en GitHub.
 *
 * Ejecutado automaticamente por el hook Stop al final de cada sesion.
 * Tambien puede correrse manualmente: node .claude/bin/issue-reporter.js
 *
 * Requisitos:
 *   - gh CLI instalado y autenticado (gh auth status)
 *   - Repositorio destino: github.com/salvex93/ai-core
 *
 * Comportamiento:
 *   1. Lee EVENTS_QUEUE.json
 *   2. Agrupa eventos similares del mismo tipo en un solo issue
 *   3. Abre el issue con el template correcto segun el tipo
 *   4. Marca los eventos como reported: true
 *   5. Limpia eventos reportados con > 7 dias de antiguedad
 */

const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

const CORE_PATH   = path.resolve(__dirname, '../..');
const QUEUE_PATH  = path.join(CORE_PATH, '.claude', 'EVENTS_QUEUE.json');
const REPO_TARGET = 'salvex93/ai-core';

// ---------------------------------------------------------------------------
// Tipos de evento → labels y titulo de issue
// ---------------------------------------------------------------------------

const ISSUE_META = Object.freeze({
  mcp_failure:   { label: 'bug,mcp',          prefix: '[MCP-FAIL]',    priority: 'alta'  },
  hook_failure:  { label: 'bug,hooks',         prefix: '[HOOK-FAIL]',   priority: 'alta'  },
  skill_gap:     { label: 'enhancement,skill', prefix: '[SKILL-GAP]',   priority: 'media' },
  pattern:       { label: 'enhancement',       prefix: '[PATTERN]',     priority: 'baja'  },
  harness_error: { label: 'bug',               prefix: '[HARNESS-ERR]', priority: 'alta'  },
});

// ---------------------------------------------------------------------------
// Verificar gh CLI disponible
// ---------------------------------------------------------------------------

function ghAvailable() {
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Leer cola
// ---------------------------------------------------------------------------

function readQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeQueue(events) {
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(events, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Agrupar eventos pendientes por tipo
// ---------------------------------------------------------------------------

function groupByType(events) {
  const pending = events.filter(e => !e.reported);
  const groups  = {};
  for (const e of pending) {
    if (!groups[e.type]) groups[e.type] = [];
    groups[e.type].push(e);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Formatear cuerpo del issue por tipo
// ---------------------------------------------------------------------------

function formatIssueBody(type, events) {
  const meta    = ISSUE_META[type] || ISSUE_META.harness_error;
  const version = getHarnessVersion();
  const sesiones = [...new Set(events.map(e => e.session))].join(', ');

  const encabezado = [
    `## Contexto`,
    `- **Tipo:** ${type}`,
    `- **Prioridad:** ${meta.priority}`,
    `- **Sesiones afectadas:** ${sesiones}`,
    `- **Harness version:** ${version}`,
    `- **Capturado:** ${new Date().toISOString().slice(0, 10)}`,
    `- **Eventos agrupados:** ${events.length}`,
    '',
  ].join('\n');

  const cuerpoEventos = events.map((e, i) => [
    `### Evento ${i + 1} — ${e.ts.slice(0, 19)}`,
    `- **Herramienta:** \`${e.tool}\``,
    `- **Error:** ${e.error}`,
    e.context ? `- **Contexto:** \`${e.context}\`` : '',
    '',
  ].filter(Boolean).join('\n')).join('\n');

  const reproduccion = buildReproduction(type, events[0]);
  const propuesta    = buildProposal(type, events);

  return [encabezado, cuerpoEventos, reproduccion, propuesta].join('\n');
}

function buildReproduction(type, event) {
  const pasos = {
    mcp_failure:   `1. Iniciar sesion en Claude Code con ai-core\n2. Ejecutar herramienta \`${event.tool}\`\n3. Observar fallo: ${event.error}`,
    hook_failure:  `1. Trigger del hook (PreToolUse / PostToolUse)\n2. Script \`${event.tool}\` falla con: ${event.error}`,
    skill_gap:     `1. Usuario solicita: "${event.context}"\n2. Ningun skill existente cubre el caso adecuadamente`,
    pattern:       `Patron repetido detectado en sesion ${event.session}:\n${event.context}`,
    harness_error: `Error inesperado durante ejecucion:\n${event.error}`,
  };
  return `## Reproduccion\n${pasos[type] || event.error}\n`;
}

function buildProposal(type, events) {
  const propuestas = {
    mcp_failure:   '## Propuesta\n- Verificar disponibilidad del servidor MCP\n- Revisar variables de entorno requeridas\n- Considerar fallback automatico al tier siguiente',
    hook_failure:  '## Propuesta\n- Agregar manejo de error en el script del hook\n- Verificar que la ruta del archivo existe antes de procesarlo\n- Revisar permisos del archivo',
    skill_gap:     '## Propuesta\n- Evaluar si se necesita un skill nuevo\n- O extender el skill existente mas cercano al caso\n- Ver criterio en CLAUDE.md: "Cuando crear un agente nuevo"',
    pattern:       `## Propuesta\n- Automatizar el patron repetido como comando o skill dedicado\n- Evaluar si requiere un agente autonomo (ver criterio en CLAUDE.md)`,
    harness_error: '## Propuesta\n- Revisar logs del hook correspondiente\n- Verificar version de Node.js (requiere >= 18)\n- Ejecutar: `npm test` para detectar regresion',
  };
  return propuestas[type] || '## Propuesta\n- Revisar el contexto del error y proponer corrección.';
}

function getHarnessVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(CORE_PATH, 'package.json'), 'utf8'));
    return pkg.version || '?';
  } catch { return '?'; }
}

// ---------------------------------------------------------------------------
// Abrir issue en GitHub
// ---------------------------------------------------------------------------

function openIssue(type, events) {
  const meta  = ISSUE_META[type] || ISSUE_META.harness_error;
  const count = events.length > 1 ? ` (x${events.length})` : '';
  const title = `${meta.prefix} ${events[0].tool} — ${events[0].error.slice(0, 60)}${count}`;
  const body  = formatIssueBody(type, events);

  // Escribir body a archivo temporal para evitar problemas de escaping en shell
  const tmpFile = path.join(CORE_PATH, '.claude', `_issue_tmp_${type}.md`);
  fs.writeFileSync(tmpFile, body, 'utf8');

  try {
    const result = execSync(
      `gh issue create --repo "${REPO_TARGET}" --title "${title.replace(/"/g, "'")}" --body-file "${tmpFile}" --label "${meta.label}"`,
      { encoding: 'utf8', cwd: CORE_PATH }
    ).trim();
    process.stderr.write(`[ISSUE] Abierto: ${result}\n`);
    return true;
  } catch (e) {
    process.stderr.write(`[ISSUE] Error al abrir issue: ${e.message.split('\n')[0]}\n`);
    return false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Limpiar eventos reportados viejos (> 7 dias)
// ---------------------------------------------------------------------------

function cleanOldReported(events) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return events.filter(e =>
    !e.reported || new Date(e.ts).getTime() > cutoff
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const queue = readQueue();
const pending = queue.filter(e => !e.reported);

if (pending.length === 0) {
  process.stderr.write('[ISSUE-REPORTER] Sin eventos pendientes.\n');
  process.exit(0);
}

if (!ghAvailable()) {
  process.stderr.write('[ISSUE-REPORTER] gh CLI no disponible o no autenticado — issues no enviados.\n');
  process.stderr.write(`[ISSUE-REPORTER] ${pending.length} evento(s) en cola para el proximo intento.\n`);
  process.exit(0);
}

const groups = groupByType(queue);
let reportedIds = new Set();

for (const [type, events] of Object.entries(groups)) {
  const ok = openIssue(type, events);
  if (ok) events.forEach(e => reportedIds.add(e.id));
}

// Marcar como reportados y limpiar viejos
const updated = cleanOldReported(
  queue.map(e => reportedIds.has(e.id) ? { ...e, reported: true } : e)
);

writeQueue(updated);
process.stderr.write(`[ISSUE-REPORTER] ${reportedIds.size} evento(s) reportados a ${REPO_TARGET}.\n`);
