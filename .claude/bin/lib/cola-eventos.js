'use strict';

/**
 * Acceso a EVENTS_QUEUE.json compartido por capture-event.js e issue-reporter.js.
 * Una cola ilegible se aparta (nunca se trata como vacia y se sobrescribe), la
 * escritura es atomica (tmp + rename) y el ciclo leer-modificar-escribir se
 * serializa con un lock de directorio.
 */

const fs = require('node:fs');

const ESPERA_LOCK_MS = 20;
const INTENTOS_LOCK = 250;
const LOCK_VENCIDO_MS = 10000;

function apartarCorrupta(ruta, motivo) {
  const destino = `${ruta}.corrupt-${Date.now()}`;
  fs.renameSync(ruta, destino);
  process.stderr.write(`[COLA] ${motivo}: cola apartada en ${destino}; se inicia una vacia.\n`);
}

function leerCola(ruta) {
  if (!fs.existsSync(ruta)) return [];
  let datos;
  try {
    datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    apartarCorrupta(ruta, 'JSON invalido');
    return [];
  }
  if (Array.isArray(datos)) return datos;
  apartarCorrupta(ruta, 'la cola no es un arreglo');
  return [];
}

function escribirCola(ruta, eventos) {
  const tmp = `${ruta}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(eventos, null, 2), 'utf8');
  fs.renameSync(tmp, ruta);
}

function liberarSiVencido(lock) {
  try {
    if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_VENCIDO_MS) fs.rmdirSync(lock);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

function adquirirLock(lock) {
  for (let i = 0; i < INTENTOS_LOCK; i++) {
    try {
      fs.mkdirSync(lock);
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      liberarSiVencido(lock);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ESPERA_LOCK_MS);
    }
  }
  throw new Error(`no se pudo obtener el lock ${lock}`);
}

/**
 * @param {string} ruta
 * @param {(cola: object[]) => object[] | null} fn - null = no escribir
 */
function actualizarCola(ruta, fn) {
  const lock = `${ruta}.lock`;
  adquirirLock(lock);
  try {
    const nueva = fn(leerCola(ruta));
    if (nueva !== null) escribirCola(ruta, nueva);
  } finally {
    fs.rmdirSync(lock);
  }
}

module.exports = { leerCola, escribirCola, actualizarCola };
