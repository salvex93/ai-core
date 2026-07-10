#!/usr/bin/env node
'use strict';
/**
 * memory-index-stop.js — Wrapper de cierre de sesion para memory-index.js.
 *
 * Lee el estado efimero .claude/.current_role escrito por detect-role.js
 * (hook UserPromptSubmit) y lo consume de forma destructiva antes de invocar
 * `memory-index.js index --rol=<rol>`, garantizando que cada sesion indexe
 * en el namespace del rol que estuvo activo. Si el archivo no existe o falla
 * la lectura, cae a --rol=general.
 *
 * Ejecutado via hook Stop en settings.json, en lugar de invocar
 * memory-index.js directamente.
 */

const fs   = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROLE_FILE  = path.join(__dirname, '..', '.current_role');
const MEMORY_IDX = path.join(__dirname, 'memory-index.js');
const ROLES_VALIDOS = ['architect', 'coder', 'auditor'];

function leerYConsumirRol() {
  try {
    const rol = fs.readFileSync(ROLE_FILE, 'utf8').trim();
    fs.unlinkSync(ROLE_FILE);
    return ROLES_VALIDOS.includes(rol) ? rol : 'general';
  } catch {
    return 'general';
  }
}

const rol = leerYConsumirRol();
spawnSync('node', [MEMORY_IDX, 'index', `--rol=${rol}`], { stdio: 'inherit' });
