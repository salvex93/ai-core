'use strict';
const path = require('node:path');
const { writeFiles, readSafe } = require('../lib/fs-util');

const TARGET = 'ERR-7741';
const LINES = 3000;

// Log determinista: una sola linea FATAL oculta entre ruido repetitivo
function buildLog() {
  const out = [];
  for (let i = 0; i < LINES; i++) {
    const ts = `2026-01-01T00:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`;
    out.push(i === 2187
      ? `${ts} FATAL payment-service code=${TARGET} reason=ledger_mismatch`
      : `${ts} INFO worker-${i % 7} processed job=${i} status=ok latency=${(i * 13) % 90}ms`);
  }
  return out.join('\n') + '\n';
}

module.exports = {
  id: 'log-analysis',
  category: 'lectura-masiva',
  prompt: 'El archivo app.log tiene miles de lineas. Encuentra la unica linea FATAL y escribe en answer.txt solo el valor de code= de esa linea, sin texto adicional.',
  build: (dir) => writeFiles(dir, { 'app.log': buildLog() }),
  reference: (dir) => writeFiles(dir, { 'answer.txt': TARGET + '\n' }),
  verify(dir) {
    const got = (readSafe(path.join(dir, 'answer.txt')) || '').trim();
    return { pass: got === TARGET, detail: got ? `respuesta: ${got}` : 'answer.txt ausente' };
  },
};
