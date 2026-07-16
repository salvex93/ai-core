'use strict';

/**
 * session-summary.js — Genera un resumen breve de la sesion al hacer Stop.
 * Inspirado en ECC session-summary kiro hook. Lee EVENTS_QUEUE.json y el
 * estado git para producir 2-3 lineas: archivos modificados, eventos capturados
 * y estado final. Solo imprime si hay actividad relevante.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CORE_PATH  = path.resolve(__dirname, '../..');
const QUEUE_PATH = path.join(CORE_PATH, '.claude', 'EVENTS_QUEUE.json');

function exec(cmd) {
  try { return execSync(cmd, { cwd: CORE_PATH, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch { return ''; }
}

// ── Archivos modificados en esta sesion (git working tree) ─────────────────
const gitStatus = exec('git status --short');
const archivosModificados = gitStatus
  ? gitStatus.split('\n').filter(Boolean).length
  : 0;

// ── Commits realizados en la sesion (desde el inicio — ultimos 10) ─────────
const ultimoCommit = exec('git log -1 --format="%s"');

// ── Eventos capturados en cola ─────────────────────────────────────────────
let eventosPendientes = 0;
let tiposEventos = [];
if (fs.existsSync(QUEUE_PATH)) {
  try {
    const cola = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    const pendientes = cola.filter(e => !e.reported);
    eventosPendientes = pendientes.length;
    tiposEventos = [...new Set(pendientes.map(e => e.type))];
  } catch { /* cola malformada — ignorar */ }
}

// ── Sin actividad relevante: no imprimir nada ─────────────────────────────
if (archivosModificados === 0 && eventosPendientes === 0 && !ultimoCommit) {
  process.exit(0);
}

// ── Resumen compacto ───────────────────────────────────────────────────────
const partes = [];

if (ultimoCommit) {
  partes.push(`commit: "${ultimoCommit.slice(0, 60)}"`);
}
if (archivosModificados > 0) {
  partes.push(`${archivosModificados} archivo(s) con cambios pendientes`);
}
if (eventosPendientes > 0) {
  partes.push(`${eventosPendientes} evento(s) en cola [${tiposEventos.join(', ')}]`);
}

process.stdout.write(`[SESSION] ${partes.join(' | ')}\n`);
