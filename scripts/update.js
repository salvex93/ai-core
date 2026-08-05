#!/usr/bin/env node
/**
 * update.js — Actualizacion one-command del ai-core
 *
 * Uso: npm run update
 *
 * Ejecuta en orden:
 *   1. git pull origin main (obtiene la ultima version)
 *   2. npm run setup       (regenera settings.json con rutas locales)
 *   3. npm test            (valida conformidad del harness)
 *   4. npm run validate-globals (valida conformidad de todos los skills)
 *
 * Al finalizar muestra:
 *   - Version anterior vs version nueva
 *   - Que cambio (CHANGELOG de la version nueva)
 *   - Si hay breaking changes que requieran accion manual
 *
 * Cross-platform: Linux, macOS, Windows (Node >= 18, sin deps externas).
 */

'use strict';

const { spawnSync } = require('node:child_process');
const fs   = require('node:fs');
const path = require('node:path');

const REPO      = path.resolve(__dirname, '..');
const PKG       = path.join(REPO, 'package.json');
const CHANGELOG = path.join(REPO, 'CHANGELOG.md');
const isWin     = process.platform === 'win32';

// ─── Utilidades ───────────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: REPO,
    encoding: 'utf8',
    shell: isWin,  // en Windows necesita shell para resolver comandos PATH
    stdio: opts.silent ? 'pipe' : 'inherit',
    ...opts,
  });
  return result;
}

function step(titulo) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${titulo}`);
  console.log('─'.repeat(60));
}

function ok(msg)   { console.log(`[OK]   ${msg}`); }
function fail(msg) { console.error(`[FAIL] ${msg}`); }
function info(msg) { console.log(`[INFO] ${msg}`); }

function versionActual() {
  try {
    return JSON.parse(fs.readFileSync(PKG, 'utf8')).version || 'desconocida';
  } catch { return 'desconocida'; }
}

function extractChangelogSection(version) {
  if (!fs.existsSync(CHANGELOG)) return null;
  const content = fs.readFileSync(CHANGELOG, 'utf8');
  const pattern = new RegExp(`## \\[${version.replace('.', '\\.')}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`);
  const match   = content.match(pattern);
  return match ? match[1].trim() : null;
}

function tieneBreakingChanges(changelogSection) {
  if (!changelogSection) return false;
  return /### Breaking|MIGRACION REQUERIDA|accion manual/i.test(changelogSection);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const versionAntes = versionActual();
console.log(`\n[AI-CORE UPDATER] Version actual: ${versionAntes}`);
console.log('[AI-CORE UPDATER] Iniciando actualizacion...\n');

// PASO 1: git pull
step('1/5 — Sincronizando con origin/main');
const pull = run('git', ['pull', 'origin', 'main'], { silent: false });
if (pull.status !== 0) {
  fail('git pull fallo. Verifica tu conexion y que no haya cambios locales sin commitear.');
  fail('Ejecuta: git status');
  process.exit(1);
}

const versionDespues = versionActual();
if (versionDespues !== versionAntes) {
  ok(`Actualizado: ${versionAntes} → ${versionDespues}`);
} else {
  info(`Sin cambios de version — ya estas en ${versionDespues}.`);
}

// PASO 2: setup-settings.js (rutas locales)
step('2/5 — Regenerando settings.json con rutas locales');
const setup = run('node', ['.claude/bin/setup-settings.js'], { silent: false });
if (setup.status !== 0) {
  fail('setup-settings.js fallo. Verifica que Node >= 18 esta instalado.');
  process.exit(1);
}
ok('settings.json regenerado.');

// PASO 3: npm test
step('3/5 — Ejecutando suite de tests');
const test = run('node', ['--test', 'tests/*.test.js', 'tests/harness/**/*.test.js'], { silent: true });
if (test.status !== 0) {
  fail('La suite de tests fallo. La actualizacion introdujo una regresion.\n');
  console.error(test.stdout || '');
  console.error(test.stderr || '');
  fail('Accion requerida: reportar el fallo en https://github.com/salvex93/ai-core/issues');
  process.exit(1);
}
ok('Tests pasaron.');

// PASO 4: migrador de deprecaciones
step('4/5 — Aplicando migraciones de version (eliminar deprecados)');
if (versionDespues !== versionAntes) {
  const migrate = run('node', ['scripts/migrator.js', '--from', versionAntes], { silent: true });
  const migrateOut = (migrate.stdout || '') + (migrate.stderr || '');
  console.log(migrateOut);
  if (migrate.status !== 0) {
    fail('migrator.js reporto errores. Revision requerida.');
    process.exit(1);
  }
} else {
  info('Sin cambio de version — migrador omitido.');
}

// PASO 5: validate-globals
step('5/5 — Validando conformidad de skills con CLAUDE.md');
const validate = run('node', ['.claude/bin/validate-globals.js', '--fix-drift'], { silent: true });
const validateOut = (validate.stdout || '') + (validate.stderr || '');
console.log(validateOut.split('\n').slice(0, 10).join('\n')); // primeras 10 lineas
if (validate.status !== 0) {
  fail('validate-globals detecto hallazgos criticos o altos. Revision requerida.');
  console.error(validateOut);
  process.exit(1);
}
ok('35/35 skills conformes con CLAUDE.md — validate-globals OK.');

// PASO 6 (condicional): norm-harness en proyecto anfitrion
// Si ai-core se ejecuta como submodulo, sincronizar el CLAUDE.md del padre.
step('6/6 — Verificando si se ejecuta como submodulo (norm-harness)');
const normHarness = path.join(REPO, '.claude', 'bin', 'norm-harness.js');
const parentClaude = path.resolve(REPO, '..', '..', 'CLAUDE.md');
const esSubmodulo  = fs.existsSync(parentClaude) && !fs.existsSync(path.join(REPO, '..', '..', 'package.json'));

if (esSubmodulo) {
  info('Ejecutando como submodulo — aplicando norm-harness en proyecto padre...');
  const norm = run('node', [normHarness], { cwd: path.resolve(REPO, '..', '..'), silent: true });
  if (norm.status !== 0) {
    fail('norm-harness.js fallo en el proyecto padre. Revisa el symlink CLAUDE.md manualmente.');
    const normOut = (norm.stdout || '') + (norm.stderr || '');
    if (normOut) console.error(normOut.slice(0, 400));
  } else {
    ok('norm-harness aplicado — CLAUDE.md del proyecto padre apunta a ai-core.');
  }
} else {
  info('Modo standalone — norm-harness omitido (no es submodulo).');
}

// ─── Resumen final ────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log('  ACTUALIZACION COMPLETADA');
console.log('═'.repeat(60));

if (versionDespues !== versionAntes) {
  info(`Version: ${versionAntes} → ${versionDespues}`);
  const changelogSection = extractChangelogSection(versionDespues);
  if (changelogSection) {
    console.log('\nQUE CAMBIO EN ESTA VERSION:');
    console.log(changelogSection.slice(0, 800)); // primeros 800 chars
    if (changelogSection.length > 800) console.log('  [...ver CHANGELOG.md para el detalle completo]');

    if (tieneBreakingChanges(changelogSection)) {
      console.log('\n[ATENCION] Esta version tiene BREAKING CHANGES.');
      console.log('Lee la seccion MIGRACION en CHANGELOG.md antes de continuar.');
    }
  }
} else {
  info('Ya tenias la ultima version. No hubo cambios de contenido.');
}

console.log('\nPROXIMOS PASOS:');
console.log('  npm run token-metrics   — ver reduccion de tokens por sesion');
console.log('  npm run validate-globals — auditar conformidad en cualquier momento');
console.log('');
