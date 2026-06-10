#!/usr/bin/env node
'use strict';

/**
 * migrator.js — Aplica migraciones de versión al actualizar ai-core.
 *
 * Lee DEPRECATIONS.json y aplica los cambios delta entre la versión
 * instalada y la versión objetivo. Elimina archivos deprecados, ejecuta
 * scripts de migración de configuración y reporta el resultado.
 *
 * Uso:
 *   node scripts/migrator.js [--from <version>] [--dry-run]
 *
 * Si --from no se especifica, lee la versión anterior del historial de git.
 * Con --dry-run imprime los cambios sin aplicarlos.
 */

const fs   = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..');
const PKG          = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const DEPFILE      = path.join(ROOT, 'DEPRECATIONS.json');
const TARGET       = PKG.version;

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const fromIdx   = args.indexOf('--from');
const FROM_ARG  = fromIdx !== -1 ? args[fromIdx + 1] : null;

function semverGte(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return true;
}

function resolveFrom() {
  if (FROM_ARG) return FROM_ARG;
  // Intentar leer de git log la versión anterior en package.json
  try {
    const { execSync } = require('child_process');
    const prev = execSync('git show HEAD~1:package.json 2>/dev/null', { encoding: 'utf8', cwd: ROOT });
    return JSON.parse(prev).version;
  } catch {
    return null;
  }
}

function main() {
  if (!fs.existsSync(DEPFILE)) {
    process.stdout.write('[migrator] DEPRECATIONS.json no encontrado — nada que migrar.\n');
    return;
  }

  const deprecations = JSON.parse(fs.readFileSync(DEPFILE, 'utf8'));
  const from = resolveFrom();

  if (!from) {
    process.stdout.write('[migrator] No se pudo determinar la version anterior. Usa --from <version>.\n');
    return;
  }

  if (from === TARGET) {
    process.stdout.write(`[migrator] Version ${TARGET} ya activa — sin cambios.\n`);
    return;
  }

  process.stdout.write(`[migrator] Migrando de v${from} → v${TARGET}${DRY_RUN ? ' (dry-run)' : ''}\n`);

  let removed = 0;
  let errors  = 0;

  for (const [version, changes] of Object.entries(deprecations)) {
    if (!semverGte(version, from) || !semverGte(TARGET, version)) continue;

    process.stdout.write(`\n  [v${version}]\n`);

    for (const entry of (changes.remove || [])) {
      const target = path.join(ROOT, entry.path);
      const exists = fs.existsSync(target);
      if (!exists) {
        process.stdout.write(`  SKIP  ${entry.path} (ya eliminado)\n`);
        continue;
      }
      process.stdout.write(`  REMOVE ${entry.path} — ${entry.reason}\n`);
      if (!DRY_RUN) {
        try {
          fs.rmSync(target, { force: true });
          removed++;
        } catch (e) {
          process.stderr.write(`  ERROR al eliminar ${entry.path}: ${e.message}\n`);
          errors++;
        }
      } else {
        removed++;
      }
    }

    for (const entry of (changes.rename || [])) {
      const src  = path.join(ROOT, entry.from);
      const dest = path.join(ROOT, entry.to);
      if (!fs.existsSync(src)) {
        process.stdout.write(`  SKIP  ${entry.from} (no existe origen)\n`);
        continue;
      }
      process.stdout.write(`  RENAME ${entry.from} → ${entry.to} — ${entry.reason}\n`);
      if (!DRY_RUN) {
        try {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.renameSync(src, dest);
        } catch (e) {
          process.stderr.write(`  ERROR al renombrar ${entry.from}: ${e.message}\n`);
          errors++;
        }
      }
    }

    for (const entry of (changes.warn || [])) {
      process.stdout.write(`  WARN  ${entry.path} — ${entry.reason}\n`);
    }
  }

  const status = DRY_RUN ? '(dry-run — sin cambios reales)' : `${removed} eliminado(s), ${errors} error(es)`;
  process.stdout.write(`\n[migrator] Completado: ${status}\n`);

  if (errors > 0) process.exit(1);
}

main();
