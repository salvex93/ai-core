#!/usr/bin/env node
'use strict';
/**
 * diff-map-trigger.js — Regenera CONTEXT_MAP.json cuando git detecta
 * archivos nuevos (??), renombrados (R) o eliminados (D) desde el ultimo mapa.
 *
 * Solo actua ante cambios estructurales — modificaciones de contenido (M)
 * no requieren regenerar el mapa porque el indice es de rutas, no de contenido.
 *
 * Ejecutado via hook PostToolUse (matcher: Write|Edit|Bash) en settings.json.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const CORE_PATH = path.resolve(__dirname, '../..');
const HOST_PATH = process.cwd();
const GENERATE  = path.resolve(__dirname, 'generate-map.js');

// Patrones de git status que implican cambio estructural de rutas
const STRUCTURAL_PREFIXES = ['??', 'A ', 'D ', 'R '];

function hasStructuralChanges() {
  try {
    const out = execSync('git status --porcelain', {
      cwd: HOST_PATH,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return out.split('\n').some(line =>
      STRUCTURAL_PREFIXES.some(p => line.startsWith(p))
    );
  } catch {
    return false;
  }
}

// Evitar regeneraciones en cascada: usar flag con hash del ultimo git HEAD
function getHeadHash() {
  try {
    return execSync('git rev-parse HEAD', { cwd: HOST_PATH, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getMapTimestamp() {
  const isStandalone = HOST_PATH === CORE_PATH;
  const mapPath = isStandalone
    ? path.join(CORE_PATH, '.claude', 'CONTEXT_MAP.json')
    : path.join(HOST_PATH, '.claude', 'CONTEXT_MAP.json');
  if (!fs.existsSync(mapPath)) return 0;
  return fs.statSync(mapPath).mtimeMs;
}

function getLastCommitMs() {
  try {
    const ts = execSync('git log -1 --format="%ct"', { cwd: HOST_PATH, encoding: 'utf8' }).trim();
    return parseInt(ts, 10) * 1000;
  } catch {
    return 0;
  }
}

if (!hasStructuralChanges()) process.exit(0);

// Regenerar solo si hay archivos sin trackear o recien stagiados
const mapMs    = getMapTimestamp();
const commitMs = getLastCommitMs();

// Si el mapa es mas nuevo que el ultimo commit y no hay untracked files nuevos, salir
// (el check hasStructuralChanges ya garantizo que hay algo nuevo)
try {
  execSync(`node ${GENERATE}`, { cwd: HOST_PATH, stdio: 'pipe' });
  process.stderr.write('[MAP] Cambio estructural detectado — mapa regenerado.\n');
} catch (e) {
  process.stderr.write(`[MAP] Error regenerando mapa: ${e.message.split('\n')[0]}\n`);
}
