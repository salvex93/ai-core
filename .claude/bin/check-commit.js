#!/usr/bin/env node
'use strict';

/**
 * check-commit.js — Controles deterministas de commit para los hooks git.
 * Uso: check-commit.js mensaje <archivo> | check-commit.js identidad
 * Exit 1 bloquea el commit; git lo ejecuta fuera del Permission Model de Claude.
 */

const fs = require('node:fs');
const { tieneRastroDeIA } = require('./lib/commit-attribution');
const { IDENTIDAD_REQUERIDA, identidadValida, leerIdentidad } = require('./lib/git-identity');

function fallar(texto) {
  process.stderr.write(`[check-commit] ${texto}\n`);
  process.exit(1);
}

function verificarMensaje(archivo) {
  let contenido;
  try {
    contenido = fs.readFileSync(archivo, 'utf8');
  } catch (err) {
    fallar(`no se pudo leer el mensaje de commit (${err.message})`);
  }
  const mensaje = contenido.split('\n').filter(l => !l.startsWith('#')).join('\n');
  if (tieneRastroDeIA(mensaje)) {
    fallar('el mensaje contiene Co-Authored-By o atribucion de autoria a una IA (Protocolo de Commits Git). Reescribelo sin ese rastro.');
  }
}

function verificarIdentidad() {
  const actual = leerIdentidad(process.cwd());
  if (identidadValida(actual)) return;
  fallar(
    `identidad de autor invalida (${actual.name || 'sin nombre'} <${actual.email || 'sin email'}>). Corregir con:\n` +
    `  git config user.name "${IDENTIDAD_REQUERIDA.name}"\n` +
    `  git config user.email "${IDENTIDAD_REQUERIDA.email}"`
  );
}

const [modo, arg] = process.argv.slice(2);
if (modo === 'mensaje' && arg) verificarMensaje(arg);
else if (modo === 'identidad') verificarIdentidad();
else fallar('uso: check-commit.js mensaje <archivo> | check-commit.js identidad');
