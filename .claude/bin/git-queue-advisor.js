#!/usr/bin/env node
'use strict';
/**
 * git-queue-advisor.js — Informa sobre eventos pendientes en EVENTS_QUEUE
 * justo antes de git push o justo despues de git pull.
 *
 * Modo push (PreToolUse): lee la queue, muestra resumen, deja continuar.
 * Modo pull (PostToolUse): lee la queue post-pull, avisa si hay eventos nuevos
 *   que sugieren trabajo pendiente en la rama recibida.
 *
 * Uso:
 *   node git-queue-advisor.js push
 *   node git-queue-advisor.js pull
 *
 * Variable de entorno util:
 *   CLAUDE_TOOL_INPUT_command — el comando Bash completo (para detectar push/pull)
 */

const fs   = require('fs');
const path = require('path');

const CORE_PATH  = path.resolve(__dirname, '../..');
const QUEUE_PATH = path.join(CORE_PATH, '.claude', 'EVENTS_QUEUE.json');

// Los eventos de capture-event.js no tienen campo "sev" -- la severidad real
// se deriva de "type", igual que ISSUE_META en issue-reporter.js (no se
// importa de ahi para no acoplar ambos scripts de entrada directa; mantener
// esta tabla sincronizada si issue-reporter.js cambia sus prioridades).
const PRIORIDAD_POR_TIPO = {
  mcp_failure:   'alta',
  hook_failure:  'alta',
  harness_error: 'alta',
  skill_gap:     'media',
  pattern:       'baja',
};

const SEV_ORDER = { critica: 0, alta: 1, media: 2, baja: 3 };
const SEV_LABEL = { critica: 'CRITICA', alta: 'ALTA', media: 'MEDIA', baja: 'BAJA' };

function severidadDe(evento) {
  return evento.sev || PRIORIDAD_POR_TIPO[evento.type] || 'baja';
}

// ---------------------------------------------------------------------------
// Leer queue
// ---------------------------------------------------------------------------

function readPending() {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  try {
    const all = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    return all
      .filter(e => !e.reported)
      .sort((a, b) => (SEV_ORDER[severidadDe(a)] ?? 9) - (SEV_ORDER[severidadDe(b)] ?? 9));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Detectar si el comando Bash es push o pull
// ---------------------------------------------------------------------------

function detectMode() {
  const mode = process.argv[2];
  if (mode === 'push' || mode === 'pull') return mode;

  // Fallback: nunca se ejecuta en produccion real -- hooks-definition.js
  // siempre pasa "push"/"pull" como argv[2] explicito. CLAUDE_TOOL_INPUT_command
  // nunca existio como variable de entorno real (confirmado contra
  // code.claude.com/docs/en/hooks); se deja el intento por stdin por si algun
  // caller futuro invoca este script sin el argumento posicional.
  const { leerEventoDeStdin } = require('./lib/hook-stdin');
  const cmd = process.env.CLAUDE_TOOL_INPUT_command || leerEventoDeStdin().tool_input?.command || '';
  if (cmd.includes('git push')) return 'push';
  if (cmd.includes('git pull')) return 'pull';
  return null;
}

// ---------------------------------------------------------------------------
// Formatear resumen de eventos
// ---------------------------------------------------------------------------

function formatEvent(e) {
  const sev     = SEV_LABEL[severidadDe(e)] || 'INFO';
  const tool    = (e.tool || 'unknown').padEnd(20);
  const detalle = (e.error || '').slice(0, 60);
  return `  - ${sev.padEnd(8)} | ${tool} | ${detalle}`;
}

function buildSummary(pending, mode) {
  const lines = [];
  const criticos = pending.filter(e => severidadDe(e) === 'critica');
  const altos    = pending.filter(e => severidadDe(e) === 'alta');
  const resto    = pending.filter(e => !['critica', 'alta'].includes(severidadDe(e)));

  if (mode === 'push') {
    lines.push(`[PRE-PUSH] ${pending.length} evento(s) pendiente(s) en queue:`);
  } else {
    lines.push(`[POST-PULL] ${pending.length} evento(s) pendiente(s) en queue:`);
  }

  if (criticos.length) {
    lines.push('');
    criticos.forEach(e => lines.push(formatEvent(e)));
  }
  if (altos.length) {
    if (!criticos.length) lines.push('');
    altos.forEach(e => lines.push(formatEvent(e)));
  }
  if (resto.length) {
    lines.push('');
    resto.forEach(e => lines.push(formatEvent(e)));
  }

  lines.push('');

  if (mode === 'push') {
    if (criticos.length > 0) {
      lines.push('Recomendacion: revisa los eventos CRITICOS antes de que el push llegue al repo.');
      lines.push('Los issues se enviaran automaticamente al cerrar la sesion.');
    } else {
      lines.push('Push procediendo. Los issues se enviaran a GitHub al cerrar la sesion.');
    }
  } else {
    lines.push('Post-pull: si el pull trajo cambios al harness, ejecuta `npm test` para verificar integridad.');
    if (pending.length > 0) {
      lines.push('Los eventos pendientes seran enviados como issues al cerrar la sesion.');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const mode = detectMode();
if (!mode) process.exit(0);

const pending = readPending();
if (pending.length === 0) process.exit(0);

process.stderr.write(buildSummary(pending, mode) + '\n');
// Siempre exit 0 — nunca bloquear push/pull
process.exit(0);
