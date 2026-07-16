#!/usr/bin/env node
'use strict';
/**
 * syntax-check.js — Verifica sintaxis de un archivo .js recien escrito.
 *
 * Reemplaza el hook inline `FILE="$VAR"; if [[ "$FILE" == *.js ]]; then ...`
 * que usaba sintaxis de bash ([[ ]]) invalida en cmd.exe y en sh POSIX
 * estricto — este script es Node puro, portable a cualquier shell que
 * invoque el hook.
 *
 * Ejecutado via hook PostToolUse (matcher: Write|Edit) en settings.json.
 * Uso: node syntax-check.js <ruta-archivo>
 */

const { execFileSync } = require('node:child_process');

const filePath = process.argv[2] || process.env.CLAUDE_TOOL_INPUT_file_path || '';
if (!filePath.endsWith('.js')) process.exit(0);

try {
  execFileSync('node', ['--check', filePath], { stdio: 'pipe' });
  console.log(`[syntax-ok] ${filePath}`);
} catch (e) {
  console.log(`[syntax-error] ${filePath}`);
  if (e.stderr) process.stderr.write(e.stderr.toString());
}
