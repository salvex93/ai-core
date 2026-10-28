'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Escribe un mapa {rutaRelativa: contenido} creando directorios intermedios
function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

function readSafe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

// Ejecuta la suite node:test del fixture; el exito es el codigo de salida
function runFixtureTests(dir, testFile) {
  const { spawnSync } = require('node:child_process');
  // NODE_TEST_CONTEXT heredado haria que el subproceso reporte exito falso
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', ...(testFile ? [testFile] : [])], { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
  return { pass: r.status === 0, detail: r.status === 0 ? 'tests ok' : (r.stdout || r.stderr || '').slice(-400) };
}

module.exports = { writeFiles, readSafe, runFixtureTests };
