#!/usr/bin/env node
/**
 * guard-read.js — Intercepta Read en archivos > 200 líneas.
 * Si el archivo supera el límite, imprime advertencia al stderr
 * y sale con código 2 para bloquear la herramienta (block mode).
 *
 * Uso: node guard-read.js <file_path>
 */

const { execSync } = require('child_process');
const path = require('path');

const MAX_LINES = 200;
const filePath = process.argv[2];

if (!filePath) process.exit(0);

// Solo archivos de texto con extensión relevante
const TEXT_EXTS = ['.js', '.ts', '.py', '.md', '.json', '.yaml', '.yml', '.sh', '.txt', '.env', '.toml', '.cfg', '.conf'];
const ext = path.extname(filePath).toLowerCase();
if (!TEXT_EXTS.includes(ext)) process.exit(0);

try {
  const result = execSync(`wc -l "${filePath}" 2>/dev/null`, { encoding: 'utf8' }).trim();
  const lineCount = parseInt(result.split(' ')[0], 10);

  if (!isNaN(lineCount) && lineCount > MAX_LINES) {
    process.stderr.write(
      `[GUARD-READ] BLOQUEADO: ${filePath} tiene ${lineCount} lineas (limite: ${MAX_LINES}).\n` +
      `Usa mcp__gemini-bridge__analizar_archivo en su lugar para no quemar tokens de Claude.\n`
    );
    // Salir con código 2 = block en el harness de Claude Code hooks
    process.exit(2);
  }
} catch {
  // Si no se puede medir, dejar pasar
  process.exit(0);
}

process.exit(0);
