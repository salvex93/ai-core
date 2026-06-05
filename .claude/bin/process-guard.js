#!/usr/bin/env node
'use strict';
/**
 * process-guard.js — Semaforo de procesos del harness.
 *
 * Problema: cada tool call puede disparar 3-5 scripts Node.js en paralelo.
 * En sesiones de 50+ tool calls = 200+ procesos, saturacion de memoria.
 *
 * Solucion: lock de archivo por categoria de script. Si ya hay un proceso
 * del mismo tipo corriendo, el nuevo espera hasta TIMEOUT_MS o se descarta.
 *
 * Categorias (no pueden solaparse entre si):
 *   map      — validate-map, diff-map-trigger, generate-map
 *   health   — health-check, health-sync, health-worker
 *   lint     — standards-guard, detox, syntax-check
 *   capture  — capture-event, issue-reporter
 *
 * Uso: node process-guard.js <categoria> <comando...>
 *   node process-guard.js map node .claude/bin/validate-map.js
 *   node process-guard.js lint node .claude/bin/standards-guard.js /path/file.js
 */

const fs           = require('fs');
const path         = require('path');
const { execSync, spawnSync } = require('child_process');

const TIMEOUT_MS  = 8000;  // max tiempo de espera por lock (ms)
const LOCK_DIR    = path.join(require('os').tmpdir(), 'ai-core-locks');
const MAX_PROCS   = 4;     // procesos Node.js del harness maximos en paralelo

const categoria = process.argv[2];
const comando   = process.argv.slice(3);

if (!categoria || comando.length === 0) {
  process.stderr.write('[GUARD] Uso: process-guard.js <categoria> <cmd> [args...]\n');
  process.exit(0);
}

// Asegurar directorio de locks
if (!fs.existsSync(LOCK_DIR)) {
  try { fs.mkdirSync(LOCK_DIR, { recursive: true }); } catch {}
}

const LOCK_FILE = path.join(LOCK_DIR, `${categoria}.lock`);

// ---------------------------------------------------------------------------
// Verificar carga global de procesos Node del harness
// ---------------------------------------------------------------------------

function countHarnessProcs() {
  try {
    // Contar procesos node que tienen 'ai-core' en su ruta de comando
    const out = execSync(
      "ps aux 2>/dev/null | grep 'ai-core/.claude/bin' | grep -v grep | wc -l",
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    return parseInt(out, 10) || 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Lock de archivo con PID y timestamp
// ---------------------------------------------------------------------------

function readLock() {
  try {
    const data = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    return data;
  } catch {
    return null;
  }
}

function isLockStale(lock) {
  if (!lock) return true;
  // PID ya no existe
  try {
    process.kill(lock.pid, 0); // signal 0 = verificar existencia
  } catch {
    return true; // proceso muerto
  }
  // Lock mas viejo que TIMEOUT_MS
  return (Date.now() - lock.ts) > TIMEOUT_MS;
}

function acquireLock() {
  const lock = readLock();
  if (lock && !isLockStale(lock)) {
    return false; // lock activo
  }
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, ts: Date.now() }), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch {}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Si hay demasiados procesos del harness corriendo, descartar silenciosamente
const carga = countHarnessProcs();
if (carga >= MAX_PROCS) {
  process.stderr.write(`[GUARD] Carga alta (${carga} procs) — ${categoria} pospuesto.\n`);
  process.exit(0);
}

if (!acquireLock()) {
  // Otro proceso de la misma categoria ya esta corriendo — saltarse
  process.exit(0);
}

try {
  const [bin, ...args] = comando;
  const result = spawnSync(bin, args, {
    stdio: 'inherit',
    timeout: TIMEOUT_MS,
    cwd: path.resolve(__dirname, '../..'),
  });

  if (result.signal === 'SIGTERM' || result.error?.code === 'ETIMEDOUT') {
    process.stderr.write(`[GUARD] Timeout (${TIMEOUT_MS}ms) — ${categoria} cancelado.\n`);
  }
} finally {
  releaseLock();
}
