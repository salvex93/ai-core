#!/usr/bin/env node
'use strict';
/**
 * validate-map.js — Detecta drift entre CONTEXT_MAP.json y git ls-files.
 * Si hay diferencia >= DRIFT_THRESHOLD archivos, regenera el mapa automaticamente.
 * Ejecutado via hook PreToolUse en settings.json.
 */
const fs          = require('fs');
const path        = require('path');
const { execSync } = require('child_process');

const DRIFT_THRESHOLD = 3;
const ROOT      = path.resolve(__dirname, '../..');
const MAP_PATH  = path.resolve(__dirname, '../CONTEXT_MAP.json');

if (!fs.existsSync(MAP_PATH)) {
  execSync(`node ${path.resolve(__dirname, 'generate-map.js')}`, { cwd: ROOT });
  process.exit(0);
}

const map      = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const enMapa   = [
  ...(map.map?.root_files ?? []),
  ...Object.values(map.map?.directories ?? {}).flat(),
].length;

const enGit = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(f => f && !f.startsWith('node_modules/')).length;

const drift = Math.abs(enGit - enMapa);
if (drift >= DRIFT_THRESHOLD) {
  execSync(`node ${path.resolve(__dirname, 'generate-map.js')}`, { cwd: ROOT });
  process.stderr.write(`[MAP] Drift detectado (${drift} archivos) — mapa regenerado.\n`);
}
