/**
 * _shared.js — Helpers y constantes compartidas por los tests de tests/harness/
 * Extraido de tests/harness.test.js al dividir el archivo por modulo auditado.
 */

'use strict';

const path = require('node:path');
const fs   = require('node:fs');
const os   = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REPO     = path.resolve(__dirname, '..', '..');
const BIN      = path.join(REPO, '.claude', 'bin');
const SKILLS   = path.join(REPO, '.claude', 'skills');
const SETTINGS = path.join(REPO, '.claude', 'settings.json');
// Aislado por proceso de test: sin esto, cada guard bajo prueba deja
// solicitudes de break-glass en el tmpdir real (670 acumuladas) mezcladas con
// las del uso interactivo. Lo heredan los hijos lanzados con spawnSync.
process.env.AI_CORE_BREAK_GLASS_DIR = process.env.AI_CORE_BREAK_GLASS_DIR
  || path.join(os.tmpdir(), 'ai-core-test-break-glass', String(process.pid));

function runScript(scriptPath, args = [], env = {}) {
  const result = spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
    // AI_CORE_TEST_MODE=1 le indica a capture-event.js que no escriba en
    // EVENTS_QUEUE.json real -- sin esto, cada test que ejercita un guard
    // (standards-guard.js, etc.) contamina la cola con eventos de archivos
    // temporales de test, no fallos reales del harness.
    env: { ...process.env, AI_CORE_TEST_MODE: '1', ...env },
    cwd: REPO,
    // Sin esto, salida JSON grande (ej. audit-market.js --json, ~14KB) se
    // trunca en macOS/Node 20 antes del default de 1MB -- confirmado en CI.
    maxBuffer: 10 * 1024 * 1024,
  });
  return result;
}

function tmpFile(content = '') {
  // Date.now() a solas colisiona entre llamadas sucesivas dentro del mismo
  // milisegundo (confirmado: 19/20 colisiones en una rafaga sincrona) -- el
  // sufijo aleatorio garantiza unicidad real por llamada.
  const f = path.join(os.tmpdir(), `harness-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tmp`);
  fs.writeFileSync(f, content, 'utf8');
  return f;
}

// Config global vacia real: git para Windows no lee bien os.devNull ('\\.\nul')
// como GIT_CONFIG_GLOBAL y devolvia identidad vacia en CI.
let configGlobalVacia;
function entornoGitAislado() {
  configGlobalVacia ||= tmpFile('');
  const limpio = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  return { ...limpio, GIT_CONFIG_GLOBAL: configGlobalVacia, GIT_CONFIG_NOSYSTEM: '1' };
}

module.exports = { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile, entornoGitAislado };
