#!/usr/bin/env node
/**
 * session-close.js — Ejecutado por el hook Stop de Claude Code.
 *
 * Por que: automatiza la Regla 19 (guardar antes de cerrar). Sin este script,
 * el contexto de cada sesion muere con el /clear y la proxima sesion quema tokens
 * re-derivando lo mismo. Este script sobreescribe last_session.md con el estado
 * actual del backlog para que la proxima sesion lo reciba sin cost de lectura.
 *
 * No persiste conversacion ni codigo — solo el delta de estado (tareas abiertas).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const BACKLOG_PATH  = path.resolve(__dirname, '../BACKLOG.md');

// Deriva el ID de proyecto que Claude Code genera a partir de la ruta:
// cada caracter :  \  /  espacio se reemplaza por un guion individual.
const MEMORY_DIR = (function () {
  const base        = process.env.USERPROFILE || process.env.HOME;
  const projectRoot = path.resolve(__dirname, '..');
  const projectId   = projectRoot.replace(/[:\\/\s]/g, '-');
  return path.resolve(base, `.claude/projects/${projectId}/memory`);
})();

const SNAPSHOT_PATH = path.join(MEMORY_DIR, 'last_session.md');

// Parsear filas de la tabla Markdown del BACKLOG
function parseBacklog(content) {
  const rows = [];
  for (const line of content.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('|---') || line.startsWith('| #')) continue;
    const cols = line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cols.length < 8) continue;
    rows.push({ tarea: cols[0], tipo: cols[2], descripcion: cols[3], estatus: cols[7], jerarquia: cols[8] || '' });
  }
  return rows;
}

function main() {
  if (!fs.existsSync(BACKLOG_PATH)) {
    process.stdout.write('[session-close] BACKLOG.md no encontrado. Nada que persistir.\n');
    return;
  }

  const content = fs.readFileSync(BACKLOG_PATH, 'utf8');
  const rows    = parseBacklog(content);
  const OPEN    = ['pendiente', 'backlog', 'en progreso'];
  const open    = rows.filter(r => OPEN.includes(r.estatus.toLowerCase()));
  const today   = new Date().toISOString().slice(0, 10);

  const lines = [
    '---',
    'name: last_session',
    'description: Snapshot de tareas abiertas al cierre de la ultima sesion. Cargado automaticamente al inicio.',
    'type: project',
    '---',
    '',
    `Generado: ${today}`,
    '',
    '## Tareas abiertas al cierre',
    '',
  ];

  if (open.length === 0) {
    lines.push('Ninguna tarea abierta. Backlog limpio.');
  } else {
    lines.push('| # | Tipo | Descripcion | Estatus | Jerarquia |');
    lines.push('|---|---|---|---|---|');
    for (const r of open) {
      const desc = r.descripcion.length > 60 ? r.descripcion.slice(0, 57) + '...' : r.descripcion;
      lines.push(`| ${r.tarea} | ${r.tipo} | ${desc} | ${r.estatus} | ${r.jerarquia} |`);
    }
  }

  lines.push('');
  lines.push('Para detalle completo: `node scripts/query-backlog.js --status Pendiente`');

  fs.writeFileSync(SNAPSHOT_PATH, lines.join('\n'), 'utf8');
  process.stdout.write(`[session-close] Snapshot guardado: ${open.length} tarea(s) abierta(s) en last_session.md\n`);
}

main();
