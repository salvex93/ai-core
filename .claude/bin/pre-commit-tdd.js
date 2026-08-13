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
const fs = require('node:fs');
const { execSync, execFileSync } = require('node:child_process');
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

/**
 * Estima si un archivo es un script ad-hoc/desechable (no codigo de
 * produccion real). El nombre/carpeta convencional (tmp_, scratch/,
 * .scripts/) es una condicion OBLIGATORIA, no una señal mas entre varias --
 * un archivo aislado sin imports (ej. un entrypoint app.js legitimo) se ve
 * identico a un script desechable si solo se mide "sin referencias" o "sin
 * hermanos testeados", asi que ninguna de esas dos puede decidir sola.
 *
 * Con el nombre ya confirmado, las otras dos señales solo pueden REFORZAR o
 * ANULAR la exencion (nunca otorgarla): si el archivo con nombre tmp_/scratch
 * SI esta referenciado por otro modulo real del repo, se trata como
 * produccion pese al nombre -- evita el blindaje trivial de "le pongo tmp_ a
 * un modulo real para evadir el gate".
 *
 * @param {string} repo - raiz del repo a auditar
 * @param {string} relPathPosix - ruta relativa del archivo, separador '/'
 * @returns {boolean}
 */
function pareceScriptDesechable(repo, relPathPosix) {
  const nombreConvencional = /(^|\/)(tmp_|scratch[_/]|\.scripts\/)/i.test(relPathPosix);
  if (!nombreConvencional) return false;

  // execFileSync con args array (no execSync con template string): el nombre
  // base del archivo lo controla quien invoca Write/Edit, no un literal
  // fijo -- interpolarlo en un comando de shell permitiria romper la sintaxis
  // o inyectar si el nombre contuviera comillas/metacaracteres.
  const nombreBase = path.basename(relPathPosix, path.extname(relPathPosix));
  try {
    const grep = execFileSync(
      'git', ['grep', '--untracked', '-l', '--fixed-strings', nombreBase, '--', '*.js', '*.ts'],
      { cwd: repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    const referenciadoPorOtro = grep.split('\n').filter(Boolean).some(f => f !== relPathPosix);
    return !referenciadoPorOtro;
  } catch (err) {
    // git grep sale con exit 1 exactamente cuando no hay matches -- ese caso
    // SI otorga la exencion (sin referencias reales, pareceScriptDesechable
    // = true). Cualquier otro exit code (repo corrupto, git no disponible,
    // permisos) es un fallo de entorno real: no se puede verificar si el
    // archivo esta referenciado, asi que NO se otorga la exencion
    // (fail-closed hacia el gate TDD, no fail-open silencioso).
    return err.status === 1;
  }
}

// Solo aplica a codigo fuente real dentro del repo, fuera de tests/, y que no
// parezca un script ad-hoc/desechable por convencion + ausencia de uso real.
if (!esArchivoFuente || esArchivoDeTest || esFueraDelRepo
    || pareceScriptDesechable(REPO, relPathPosix)) process.exit(0);

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
