'use strict';

/**
 * Regresion de la auditoria: acquireLock leia y luego escribia sin la bandera
 * 'wx', asi que dos hooks simultaneos de la misma categoria podian adquirir el
 * lock a la vez. La creacion exclusiva garantiza un unico ganador.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawn } = require('node:child_process');
const { BIN } = require('./_shared');

const SCRIPT = path.join(BIN, 'process-guard.js');

function lanzar(categoria, lockDir, marcador, esperaMs) {
  const codigo = `require('node:fs').appendFileSync(${JSON.stringify(marcador)}, 'x'); setTimeout(() => {}, ${esperaMs});`;
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT, categoria, process.execPath, '-e', codigo], {
      env: { ...process.env, AI_CORE_PROCESS_GUARD_LOCK_DIR: lockDir }, stdio: 'ignore',
    });
    p.on('exit', (c) => resolve(c));
  });
}

test('seis hooks simultaneos de la misma categoria: solo uno ejecuta el comando', async () => {
  const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-excl-'));
  const marcador = path.join(lockDir, 'ejecuciones.txt');
  await Promise.all(Array.from({ length: 6 }, () => lanzar('map', lockDir, marcador, 800)));
  assert.equal(fs.readFileSync(marcador, 'utf8').length, 1);
  fs.rmSync(lockDir, { recursive: true, force: true });
});

test('un lock vencido (PID inexistente) se reemplaza y el comando corre', async () => {
  const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-stale-'));
  fs.writeFileSync(path.join(lockDir, 'map.lock'), JSON.stringify({ pid: 2 ** 22 + 12345, ts: Date.now() }));
  const marcador = path.join(lockDir, 'ejecuciones.txt');
  await lanzar('map', lockDir, marcador, 50);
  assert.equal(fs.readFileSync(marcador, 'utf8').length, 1);
  fs.rmSync(lockDir, { recursive: true, force: true });
});

test('error: con un lock vivo de otro proceso Node el comando no corre', async () => {
  const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-vivo-'));
  fs.writeFileSync(path.join(lockDir, 'map.lock'), JSON.stringify({ pid: process.pid, ts: Date.now() }));
  const marcador = path.join(lockDir, 'ejecuciones.txt');
  await lanzar('map', lockDir, marcador, 50);
  assert.equal(fs.existsSync(marcador), false);
  fs.rmSync(lockDir, { recursive: true, force: true });
});
