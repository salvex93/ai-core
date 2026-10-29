'use strict';

/**
 * lib/session-attestation-store.js — persistencia del informe firmado.
 *
 * Unica responsabilidad: leer y escribir disco para session-attestation.js
 * (cadena JSONL, par de claves). No firma ni verifica; eso vive en el modulo
 * puro. Todas las rutas llegan por parametro: quien llama decide el entorno.
 */

const fs     = require('node:fs');
const path   = require('node:path');
const { GENESIS, generarParDeClaves } = require('./session-attestation.js');

/** @returns {object[]} lineas JSON validas; [] si el archivo no existe */
function leerJsonl(ruta) {
  let texto;
  try { texto = fs.readFileSync(ruta, 'utf8'); } catch { return []; }
  const filas = [];
  for (const linea of texto.split('\n')) {
    if (!linea.trim()) continue;
    try { filas.push(JSON.parse(linea)); } catch { /* linea corrupta: se omite */ }
  }
  return filas;
}

/** @returns {string} hash del ultimo sobre de la cadena, o GENESIS si esta vacia */
function hashCabeza(rutaCadena) {
  const sobres = leerJsonl(rutaCadena);
  return sobres.length ? sobres[sobres.length - 1].hash : GENESIS;
}

function agregarSobre(rutaCadena, sobre) {
  fs.mkdirSync(path.dirname(rutaCadena), { recursive: true });
  fs.appendFileSync(rutaCadena, `${JSON.stringify(sobre)}\n`);
}

/**
 * Crea attest.key (0600) y attest.pub en `dir`. Nunca sobrescribe: perder la
 * privada invalida la cadena existente.
 * @returns {{privada: string, publica: string}} rutas
 */
function generarClaves(dir) {
  const privada = path.join(dir, 'attest.key');
  const publica = path.join(dir, 'attest.pub');
  if (fs.existsSync(privada) || fs.existsSync(publica)) {
    throw new Error(`session-attestation-store: ya existe un par de claves en ${dir}`);
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const par = generarParDeClaves();
  fs.writeFileSync(privada, par.privada, { mode: 0o600 });
  fs.writeFileSync(publica, par.publica, { mode: 0o644 });
  return { privada, publica };
}

module.exports = { leerJsonl, hashCabeza, agregarSobre, generarClaves };
