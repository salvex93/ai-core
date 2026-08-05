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
 *   intent   — detect-role.js (clasificacion de rol del prompt entrante)
 *   moa      — moa-context-gatherer.js (fan-out MoA Gemini+DeepSeek).
 *              Categoria propia y distinta de "intent": ambos hooks corren
 *              en la misma lista de UserPromptSubmit y deben ejecutarse
 *              siempre, sin competir por el mismo lock de proceso.
 *
 * Uso: node process-guard.js <categoria> <comando...>
 *   node process-guard.js map node .claude/bin/validate-map.js
 *   node process-guard.js lint node .claude/bin/standards-guard.js /path/file.js
 *
 * "lint" es categoria de bloqueo: si se descarta por carga alta o lock activo,
 * sale con exit 1 (no 0) para no simular exito de standards-guard.js, el
 * unico guard invocado aqui sin "|| true" en su wrapper externo. Las demas
 * categorias siempre degradan a exit 0 (best-effort).
 */

const fs           = require('fs');
const path         = require('path');
const { spawnSync } = require('child_process');

const TIMEOUT_MS  = 8000;  // max tiempo de espera por lock (ms)
const LOCK_DIR    = path.join(require('os').tmpdir(), 'ai-core-locks');
const MAX_PROCS   = 4;     // procesos Node.js del harness maximos en paralelo

// Categoria "lint" envuelve standards-guard.js (PreToolUse Write|Edit), el
// unico guard de bloqueo real invocado a traves de process-guard.js sin
// "|| true" en su wrapper externo. Descartarla en silencio bajo carga
// anularia ese bloqueo. Las demas categorias (health, map, capture, intent,
// moa) siempre llevan "|| true" en su wrapper y son verificaciones
// best-effort — pueden degradar a exit 0 sin riesgo.
const CATEGORIAS_BLOQUEO = new Set(['lint']);

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

// Cuenta locks activos en LOCK_DIR en vez de interrogar al SO (ps/grep/wc no
// son nativos de Windows) — cada lock vivo representa un proceso del harness
// en curso, ya que acquireLock()/releaseLock() los crean y borran alrededor
// de cada spawnSync.
function countHarnessProcs() {
  try {
    return fs.readdirSync(LOCK_DIR)
      .filter(f => f.endsWith('.lock'))
      .filter(f => !isLockStale(readLockFile(path.join(LOCK_DIR, f))))
      .length;
  } catch {
    return 0;
  }
}

function readLockFile(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lock de archivo con PID y timestamp
// ---------------------------------------------------------------------------

function readLock() {
  return readLockFile(LOCK_FILE);
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

// Si hay demasiados procesos del harness corriendo, descartar el intento.
// Para categorias de bloqueo, exit 0 equivaldria a "aprobado" — evitarlo.
const carga = countHarnessProcs();
if (carga >= MAX_PROCS) {
  process.stderr.write(`[GUARD] Carga alta (${carga} procs) — ${categoria} pospuesto.\n`);
  process.exit(CATEGORIAS_BLOQUEO.has(categoria) ? 1 : 0);
}

if (!acquireLock()) {
  // Otro proceso de la misma categoria ya esta corriendo — saltarse
  process.exit(CATEGORIAS_BLOQUEO.has(categoria) ? 1 : 0);
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

  // Propagar el exit code real del comando envuelto — un guardia de bloqueo
  // (ej. standards-guard.js con exit 2) no debe quedar absorbido en 0.
  releaseLock();
  process.exit(result.status ?? 0);
} catch (err) {
  releaseLock();
  throw err;
}
