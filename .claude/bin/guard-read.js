#!/usr/bin/env node
/**
 * guard-read.js — Intercepta Read en archivos > 200 líneas.
 * Si el archivo supera el límite, emite permissionDecision:"deny" (JSON en
 * stdout, exit 0) en vez de exit 2 -- es un limite de ahorro de tokens, no
 * un riesgo de seguridad, y esta via (recomendada por Anthropic en
 * code.claude.com/docs/en/hooks) deja que Claude vea el motivo y reformule
 * en el mismo turno (ej. usar Gemini) en vez de quedar con un bloqueo duro.
 *
 * Uso: node guard-read.js <file_path>
 */

const fs = require('fs');
const path = require('path');
const { denegarConRazon } = require('./lib/permission-decision');
const { loadEnv } = require('../../scripts/services/GeminiApiClient');

// Bloquear Read para forzar analizar_archivo (Gemini) solo tiene sentido si
// Gemini esta realmente disponible -- sin GEMINI_API_KEY, el deny dejaria a
// Claude sin ninguna forma de leer el archivo (degradacion total, peor que
// simplemente permitir el Read nativo). Decision explicita del usuario
// 2026-09-01: fallback automatico a permitir, nunca bloqueo estricto sin
// alternativa real disponible.
loadEnv();
const GEMINI_DISPONIBLE = Boolean(process.env.GEMINI_API_KEY);

const MAX_LINES = 200;
// ~80 chars/linea es una estimacion conservadora de codigo/texto real -- un
// archivo sin ningun separador de linea (JSON minificado, CRLF puro) que
// supere MAX_LINES * MAX_CHARS_POR_LINEA bytes se trata como voluminoso
// igual, aunque el conteo de '\n' de lo cuente (red-team 2026-08-15).
const MAX_CHARS_POR_LINEA = 80;
const filePath = process.argv[2];

if (!filePath) process.exit(0);

// Solo archivos de texto con extensión relevante (red-team 2026-08-15:
// whitelist ampliada con extensiones de codigo fuente de texto plano que
// antes evadian el guard sin limite de tamaño).
const TEXT_EXTS = [
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.py', '.md', '.json',
  '.yaml', '.yml', '.sh', '.txt', '.env', '.toml', '.cfg', '.conf',
  '.go', '.rs', '.java', '.rb', '.php', '.c', '.cpp', '.h', '.hpp',
];
const ext = path.extname(filePath).toLowerCase();
if (!TEXT_EXTS.includes(ext)) process.exit(0);

try {
  const content = fs.readFileSync(filePath, 'utf8');
  // Contar lineas logicas de forma cross-platform (no depende de wc -l).
  // Cuenta '\n' y tambien '\r' que NO vaya seguido de '\n' (CRLF cuenta una
  // sola vez por el '\n'; CR solo -- Mac clasico o exports raros -- cuenta
  // por si mismo, evitando el bypass de line-ending detectado en red-team).
  let lineCount = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') lineCount++;
    else if (content[i] === '\r' && content[i + 1] !== '\n') lineCount++;
  }
  // Ajustar: si el archivo no termina en separador de linea, la ultima linea no se conto
  const ultimoChar = content[content.length - 1];
  if (content.length > 0 && ultimoChar !== '\n' && ultimoChar !== '\r') lineCount++;

  const excedePorLineas = lineCount > MAX_LINES;
  const excedePorTamano = content.length > MAX_LINES * MAX_CHARS_POR_LINEA && lineCount <= 1;

  if ((excedePorLineas || excedePorTamano) && GEMINI_DISPONIBLE) {
    const motivo = excedePorLineas
      ? `${filePath} tiene ${lineCount} lineas (limite: ${MAX_LINES})`
      : `${filePath} tiene ${content.length} caracteres sin separadores de linea reales (equivalente a mas de ${MAX_LINES} lineas)`;
    process.stdout.write(denegarConRazon(
      'PreToolUse',
      `${motivo}. Usa mcp__gemini-bridge__analizar_archivo en su lugar para no quemar tokens de Claude.`
    ));
    process.exit(0);
  }
} catch {
  // Si no se puede leer el archivo, dejar pasar
  process.exit(0);
}

process.exit(0);
