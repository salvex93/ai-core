#!/usr/bin/env node
/**
 * guard-read.js — Intercepta Read en archivos > 200 líneas.
 * Si el archivo supera el límite, imprime advertencia al stderr
 * y sale con código 2 para bloquear la herramienta (block mode).
 *
 * Uso: node guard-read.js <file_path>
 */

const fs = require('fs');
const path = require('path');

const MAX_LINES = 200;
const filePath = process.argv[2];

if (!filePath) process.exit(0);

// Solo archivos de texto con extensión relevante
const TEXT_EXTS = ['.js', '.ts', '.py', '.md', '.json', '.yaml', '.yml', '.sh', '.txt', '.env', '.toml', '.cfg', '.conf'];
const ext = path.extname(filePath).toLowerCase();
if (!TEXT_EXTS.includes(ext)) process.exit(0);

try {
  const content = fs.readFileSync(filePath, 'utf8');
  // Contar newlines de forma cross-platform (no depende de wc -l)
  let lineCount = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') lineCount++;
  }
  // Ajustar: si el archivo no termina en newline, la última línea no tiene \n
  if (content.length > 0 && content[content.length - 1] !== '\n') lineCount++;

  if (lineCount > MAX_LINES) {
    process.stderr.write(
      `[GUARD-READ] BLOQUEADO: ${filePath} tiene ${lineCount} lineas (limite: ${MAX_LINES}).\n` +
      `Usa mcp__gemini-bridge__analizar_archivo en su lugar para no quemar tokens de Claude.\n`
    );
    // Salir con código 2 = block en el harness de Claude Code hooks
    process.exit(2);
  }
} catch {
  // Si no se puede leer el archivo, dejar pasar
  process.exit(0);
}

process.exit(0);
