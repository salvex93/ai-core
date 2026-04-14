#!/usr/bin/env node
/**
 * query-backlog.js — Filtro de BACKLOG.md sin cargar el archivo en contexto activo.
 *
 * Por defecto muestra tareas con Estatus: Pendiente | Backlog | En Progreso.
 * Uso: node scripts/query-backlog.js [--status X] [--type X] [--text X] [--limit N] [--format table|json] [--file ruta]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    limit : 20,
    format: 'table',
    file  : path.resolve(process.cwd(), 'BACKLOG.md'),
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--status' && argv[i + 1])  args.status = argv[++i];
    if (argv[i] === '--type'   && argv[i + 1])  args.type   = argv[++i];
    if (argv[i] === '--text'   && argv[i + 1])  args.text   = argv[++i];
    if (argv[i] === '--limit'  && argv[i + 1])  args.limit  = parseInt(argv[++i], 10);
    if (argv[i] === '--format' && argv[i + 1])  args.format = argv[++i];
    if (argv[i] === '--file'   && argv[i + 1])  args.file   = path.resolve(argv[++i]);
  }
  return args;
}

// Parsear tabla Markdown del BACKLOG a array de objetos.
// Columnas: #Tarea | Notas | cTipo | Descripcion | Responsable | Fecha inicio | Fecha Fin | Estatus | Jerarquia | Estimacion | Planner | Compromiso
function parseBacklog(content) {
  const rows = [];
  for (const line of content.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('|---') || line.startsWith('| #')) continue;
    const cols = line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cols.length < 9) continue;
    rows.push({
      tarea      : cols[0],
      notas      : cols[1],
      tipo       : cols[2],
      descripcion: cols[3],
      responsable: cols[4],
      fechaInicio: cols[5],
      fechaFin   : cols[6],
      estatus    : cols[7],
      jerarquia  : cols[8],
      estimacion : cols[9]  || '',
      planner    : cols[10] || '',
      compromiso : cols[11] || '',
    });
  }
  return rows;
}

function filterRows(rows, args) {
  const OPEN_STATUSES = ['pendiente', 'backlog', 'en progreso'];
  let filtered = rows;

  if (args.status) {
    const s = args.status.toLowerCase();
    filtered = filtered.filter(r => r.estatus.toLowerCase().includes(s));
  } else {
    filtered = filtered.filter(r => OPEN_STATUSES.includes(r.estatus.toLowerCase()));
  }

  if (args.type) {
    const t = args.type.toLowerCase();
    filtered = filtered.filter(r => r.tipo.toLowerCase().includes(t));
  }

  if (args.text) {
    const q = args.text.toLowerCase();
    filtered = filtered.filter(r =>
      r.descripcion.toLowerCase().includes(q) || r.notas.toLowerCase().includes(q)
    );
  }

  return filtered.slice(0, args.limit);
}

function truncate(str, max) {
  return str.length <= max ? str : str.slice(0, max - 3) + '...';
}

function printTable(rows) {
  if (rows.length === 0) {
    process.stdout.write('Sin resultados.\n');
    return;
  }

  const W = { tarea: 6, tipo: 10, desc: 55, estatus: 14, jerarquia: 9 };
  const line = '+' + [W.tarea, W.tipo, W.desc, W.estatus, W.jerarquia]
    .map(w => '-'.repeat(w + 2)).join('+') + '+';
  const col = (val, w) => ' ' + val.padEnd(w) + ' ';

  process.stdout.write(line + '\n');
  process.stdout.write(
    '|' + col('#Tarea', W.tarea) + '|' + col('cTipo', W.tipo) + '|' +
    col('Descripcion', W.desc) + '|' + col('Estatus', W.estatus) + '|' +
    col('Jerarquia', W.jerarquia) + '|\n'
  );
  process.stdout.write(line + '\n');

  for (const r of rows) {
    process.stdout.write(
      '|' + col(r.tarea, W.tarea) +
      '|' + col(truncate(r.tipo, W.tipo), W.tipo) +
      '|' + col(truncate(r.descripcion, W.desc), W.desc) +
      '|' + col(truncate(r.estatus, W.estatus), W.estatus) +
      '|' + col(truncate(r.jerarquia, W.jerarquia), W.jerarquia) + '|\n'
    );
  }

  process.stdout.write(line + '\n');
  process.stdout.write(`${rows.length} tarea(s) encontrada(s).\n`);
}

function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.file)) {
    process.stderr.write(`[Error] BACKLOG.md no encontrado: ${args.file}\n`);
    process.exit(1);
  }

  const content  = fs.readFileSync(args.file, 'utf8');
  const rows     = parseBacklog(content);
  const filtered = filterRows(rows, args);

  if (args.format === 'json') {
    process.stdout.write(JSON.stringify(filtered, null, 2) + '\n');
  } else {
    printTable(filtered);
  }
}

main();
