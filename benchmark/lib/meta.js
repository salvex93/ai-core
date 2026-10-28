'use strict';
const { spawnSync } = require('node:child_process');

function run(bin, args, cwd) {
  const r = spawnSync(bin, args, { cwd, encoding: 'utf8', timeout: 15000 });
  return r.status === 0 ? r.stdout.trim() : null;
}

// Datos minimos para repetir una corrida: fecha, runtime, version del CLI y commit de cada raiz medida
function collectMeta(roots) {
  const info = {};
  for (const [name, dir] of Object.entries(roots)) {
    info[name] = { path: dir, commit: run('git', ['rev-parse', 'HEAD'], dir) };
  }
  return {
    date: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    claude: run('claude', ['--version']) || 'desconocida',
    roots: info,
  };
}

module.exports = { collectMeta };
