#!/usr/bin/env node
'use strict';
/**
 * pre-commit-tdd.js — Gate TDD por heuristica de presencia (Zero-Regression).
 *
 * Bloquea la escritura de un archivo fuente (fuera de tests/) si la sesion
 * actual no ha tocado ningun archivo de test (*.test.js) segun `git status
 * --porcelain`. No verifica que la prueba cubra la logica exacta ni que haya
 * fallado antes del cambio (Red-Green real) — eso requeriria ejecutar la
 * suite completa en cada Write/Edit, demasiado caro para un hook por archivo.
 * Es una heuristica determinista y barata: exige evidencia de que se escribio
 * o toco una prueba en la misma sesion, antes de aceptar codigo de produccion.
 *
 * Ejecutado via hook PreToolUse(Write|Edit) en settings.json.
 * Exit 2 bloquea la escritura y devuelve el motivo al modelo via stderr.
 * Exit 0 permite continuar.
 */

const path = require('node:path');
const { execSync } = require('node:child_process');
const { leerEventoDeStdin } = require('./lib/hook-stdin');
const { emitirReporte }     = require('./lib/guard-report');

// El repo a auditar es el directorio de trabajo activo (proyecto anfitrion o
// el propio ai-core en standalone) — no la ruta de instalacion de este script,
// que en modo submodulo vive dentro de .claude/ai-core/ del anfitrion.
const REPO = process.cwd();

// CLAUDE_TOOL_INPUT_file_path nunca existio como variable de entorno real
// (confirmado contra code.claude.com/docs/en/hooks) -- el JSON de stdin trae
// tool_input.file_path.
const filePath = process.argv[2]
  || process.env.CLAUDE_TOOL_INPUT_file_path
  || leerEventoDeStdin().tool_input?.file_path
  || '';
if (!filePath) process.exit(0);

const TEST_EXTS = ['.js', '.ts', '.py'];
const ext = path.extname(filePath).toLowerCase();
const esArchivoFuente = TEST_EXTS.includes(ext);
const relPath = path.relative(REPO, path.resolve(filePath));
const relPathPosix = relPath.split(path.sep).join('/');

const esArchivoDeTest = /\.test\.js$|\.spec\.js$|^tests\//.test(relPathPosix);
const esFueraDelRepo  = relPath.startsWith('..');

// Solo aplica a codigo fuente real dentro del repo, fuera de tests/
if (!esArchivoFuente || esArchivoDeTest || esFueraDelRepo) process.exit(0);

function sesionTocoAlgunTest() {
  try {
    const out = execSync('git status --porcelain', { cwd: REPO, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return out.split('\n').some(line => /\.test\.js$|\.spec\.js$/.test(line.trim()));
  } catch {
    return true; // sin repo git legible: no bloquear por un fallo de entorno
  }
}

if (sesionTocoAlgunTest()) {
  emitirReporte({ guard: 'pre-commit-tdd', verdict: 'ok', severity: 'baja' });
  process.exit(0);
}

process.stderr.write(
  `[TDD-GATE] Rechazado: "${relPath}" es codigo fuente y ningun archivo *.test.js tiene cambios en la sesion actual.\n` +
  `[TDD-GATE] Ciclo TDD obligatorio: escribe o modifica primero la prueba que cubre este cambio, luego reintenta.\n`
);
emitirReporte({ guard: 'pre-commit-tdd', verdict: 'blocked', severity: 'alta', hallazgos: [`${relPath} sin test tocado en la sesion`] });
process.exit(2);
