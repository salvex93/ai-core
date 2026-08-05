#!/usr/bin/env node
'use strict';
/**
 * validate-map.js — Detecta drift entre CONTEXT_MAP.json y git ls-files.
 * Si hay diferencia >= DRIFT_THRESHOLD archivos, regenera el mapa automaticamente.
 * Ejecutado via hook PreToolUse en settings.json.
 */
const fs          = require('fs');
const path        = require('path');
const { execSync, execFileSync } = require('child_process');

const DRIFT_THRESHOLD = 1; // cualquier drift real dispara regeneracion — el mapa es barato de regenerar, la desincronizacion no
const CORE_PATH = path.resolve(__dirname, '../..');
const HOST_PATH = process.cwd();
// El mapa vive siempre en .claude/ del proyecto anfitrion (o core si standalone)
const isStandalone = HOST_PATH === CORE_PATH;
const MAP_DIR   = isStandalone ? path.join(CORE_PATH, '.claude') : path.join(HOST_PATH, '.claude');
const MAP_PATH  = path.join(MAP_DIR, 'CONTEXT_MAP.json');
const GENERATE  = path.resolve(__dirname, 'generate-map.js');

if (!fs.existsSync(MAP_PATH)) {
  execFileSync('node', [GENERATE], { cwd: HOST_PATH });
  process.exit(0);
}

let map;
try {
  map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
} catch (err) {
  process.stderr.write(`[MAP] CONTEXT_MAP.json corrupto (${err.message}) — regenerando.\n`);
  execFileSync('node', [GENERATE], { cwd: HOST_PATH });
  process.exit(0);
}

// Contar archivos del host en el mapa (clave nueva: host.total_files, fallback al esquema legacy)
const enMapa = map.host?.total_files
  ?? [
      ...(map.map?.root_files ?? []),
      ...Object.values(map.map?.directories ?? {}).flat(),
    ].length;

let enGit;
try {
  enGit = execSync('git ls-files', { cwd: HOST_PATH, encoding: 'utf8' })
    .split('\n')
    .filter(f => f && !f.startsWith('node_modules/') && !f.startsWith('.claude/ai-core/')).length;
} catch (err) {
  process.stderr.write(`[MAP] git ls-files fallo (${err.message}) — no se puede validar drift.\n`);
  process.exit(0);
}

const drift = Math.abs(enGit - enMapa);
if (drift >= DRIFT_THRESHOLD) {
  execFileSync('node', [GENERATE], { cwd: HOST_PATH });
  process.stderr.write(`[MAP] Drift detectado (${drift} archivos) — mapa regenerado.\n`);
}
