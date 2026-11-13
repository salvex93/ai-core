'use strict';

/**
 * Ejecuta un hook con los flags de --permission EXACTOS que genera
 * buildHooksSection, pero sin pasar por un shell: ${PWD} y las comillas se
 * resuelven aqui, de modo que el resultado no depende de sh, cmd ni PowerShell.
 */

const path = require('node:path');
const fs   = require('node:fs');
const os   = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { BIN } = require('./_shared');

const { buildHooksSection } = require(path.join(BIN, 'hooks-definition.js'));
const TMP = fs.realpathSync(os.tmpdir());
const bin = (s) => `"${path.join(BIN, s)}"`;
const comandos = () => Object.values(buildHooksSection(bin, TMP)).flatMap((e) => e.flatMap((x) => x.hooks.map((h) => h.command)));

function flagsDe(script) {
  const comando = comandos().find((c) => c.includes(`${script}"`) && c.includes('--permission'));
  assert.ok(comando, `${script} debe estar registrado con --permission`);
  const tramo = comando.slice(comando.indexOf('node --permission'), comando.indexOf(bin(script)));
  return tramo.match(/--[\w-]+(?:="[^"]*")?/g).map((f) => f.replace(/="([^"]*)"$/, '=$1'));
}

/**
 * @param {string} script - nombre del hook, ej. 'syntax-check.js'
 * @param {string[]} resto - argumentos tras los flags (ruta del script o -e codigo)
 * @param {string} cwd - sustituye a ${PWD} en los flags
 */
function correrConPerfil(script, resto, cwd = process.cwd()) {
  const flags = flagsDe(script).map((f) => f.replace('${PWD}', cwd.replace(/\\/g, '/')));
  return spawnSync(process.execPath, [...flags, ...resto], { cwd, encoding: 'utf8', input: '' });
}

const correrScriptConPerfil = (script, args, cwd) => correrConPerfil(script, [path.join(BIN, script), ...args], cwd);
const correrCodigoConPerfil = (script, codigo, cwd) => correrConPerfil(script, ['-e', codigo], cwd);

module.exports = { correrScriptConPerfil, correrCodigoConPerfil, TMP };
