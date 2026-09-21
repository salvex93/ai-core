'use strict';

/**
 * git-identity.js — Identidad de autor exigida por el Protocolo de Commits Git.
 * Compartida por setup (fijarla) y check-commit (verificarla).
 */

const { spawnSync } = require('node:child_process');

const IDENTIDAD_REQUERIDA = Object.freeze({
  name: 'Andrew Arizmendi',
  email: 'salvex93@gmail.com',
});

function git(cwd, env, ...args) {
  return spawnSync('git', args, { cwd, env, encoding: 'utf8' });
}

/**
 * @param {string} cwd - directorio del repo
 * @param {object} env - entorno del proceso git (por defecto el actual)
 * @returns {{name: string, email: string}} identidad efectiva (cualquier scope)
 */
function leerIdentidad(cwd, env = process.env) {
  return {
    name: git(cwd, env, 'config', 'user.name').stdout.trim(),
    email: git(cwd, env, 'config', 'user.email').stdout.trim(),
  };
}

function identidadValida({ name, email }) {
  return name === IDENTIDAD_REQUERIDA.name && email === IDENTIDAD_REQUERIDA.email;
}

/**
 * Fija en el repo solo los campos vacios; nunca pisa un valor ya configurado.
 * @param {string} cwd
 * @param {object} env
 */
function asegurarIdentidad(cwd, env = process.env) {
  const actual = leerIdentidad(cwd, env);
  for (const campo of ['name', 'email']) {
    if (!actual[campo]) git(cwd, env, 'config', '--local', `user.${campo}`, IDENTIDAD_REQUERIDA[campo]);
  }
}

module.exports = { IDENTIDAD_REQUERIDA, identidadValida, leerIdentidad, asegurarIdentidad };
