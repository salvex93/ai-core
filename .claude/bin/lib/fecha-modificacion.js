'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/**
 * fecha-modificacion.js -- Fecha de ultima modificacion de un archivo, derivada de git.
 *
 * El mtime del sistema de archivos cambia en cualquier checkout, clonado o
 * `git submodule update`: usarlo como proxy marca como "modificado hoy" todo
 * archivo recien descargado y, con --fix-drift, reescribiria last_updated de
 * archivos que nadie toco. Aqui un archivo limpio vale lo que dice su ultimo
 * commit; solo los cambios sin confirmar cuentan como de hoy.
 */

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// Devuelve la fecha ISO (YYYY-MM-DD) o null si el archivo no esta en un repositorio git usable.
function fechaGit(file, hoy) {
  const dir = path.dirname(file);
  const nombre = path.basename(file);
  try {
    if (git(dir, ['status', '--porcelain', '--', nombre])) return hoy;
    return git(dir, ['log', '-1', '--format=%cs', '--', nombre]) || null;
  } catch {
    // Sin git, sin repositorio o sin commits: el llamador usa el mtime como respaldo.
    return null;
  }
}

function fechaModificacion(file, hoy = new Date().toISOString().slice(0, 10)) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (err) {
    throw new Error(`fechaModificacion: no se pudo leer ${file}: ${err.message}`);
  }
  return fechaGit(file, hoy) || stat.mtime.toISOString().slice(0, 10);
}

module.exports = { fechaModificacion };
