'use strict';
/**
 * detox.js — Limpia archivos .md legacy de la raiz del proyecto.
 *
 * Solo aparta archivos .md que NO estan trackeados en git (nunca fueron commiteados):
 * los mueve a .claude/detox-cuarentena/<lote>/ en lugar de borrarlos, porque pueden ser
 * documentos del usuario que casualmente usan un prefijo legacy.
 * Esos son reportes generados automaticamente (TO_GEMINI.md, REPORT-*.md, etc.)
 * que contaminan el contexto si se acumulan entre sesiones.
 *
 * Archivos en git (.committed) nunca se tocan, sin importar su nombre.
 * Ejecutado via hook PostToolUse (Write|Edit) en settings.json.
 */
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LEGACY_PREFIXES = ['REPORT-', 'TO_GEMINI', 'AUDIT-', 'DIAGNOSTICO-', 'BACKLOG-v2'];

function detox() {
  const projectRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();

  // Archivos trackeados en git — nunca tocarlos
  const enGit = new Set(
    execSync('git ls-files', { cwd: projectRoot, encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean)
  );

  const archivos = fs.readdirSync(projectRoot);
  let purgados   = 0;
  let lote = null;

  // Cuarentena por lote: se crea solo si hay algo que apartar
  const apartar = (archivo) => {
    if (!lote) {
      lote = path.join(projectRoot, '.claude', 'detox-cuarentena', new Date().toISOString().replace(/[:.]/g, '-'));
      fs.mkdirSync(lote, { recursive: true });
    }
    fs.renameSync(path.join(projectRoot, archivo), path.join(lote, archivo));
  };

  for (const archivo of archivos) {
    if (path.extname(archivo) !== '.md') continue;
    if (enGit.has(archivo)) continue;  // esta en git → intocable

    // Solo apartar si tiene prefijo legacy conocido
    const esLegacy = LEGACY_PREFIXES.some(p => archivo.startsWith(p));
    if (!esLegacy) continue;

    try {
      apartar(archivo);
      purgados++;
      process.stderr.write(`[detox] Movido a cuarentena: ${archivo}\n`);
    } catch (e) {
      process.stderr.write(`[detox] Error moviendo ${archivo}: ${e.message}\n`);
    }
  }

  if (purgados > 0) {
    process.stderr.write(`[detox] ${purgados} archivo(s) legacy movidos a cuarentena (${path.relative(projectRoot, lote)}).\n`);
  }
}

detox();
