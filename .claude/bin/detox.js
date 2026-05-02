'use strict';
/**
 * detox.js — Limpia archivos .md legacy de la raiz del proyecto.
 *
 * Solo elimina archivos .md que NO estan trackeados en git (nunca fueron commiteados).
 * Esos son reportes generados automaticamente (TO_GEMINI.md, REPORT-*.md, etc.)
 * que contaminan el contexto si se acumulan entre sesiones.
 *
 * Archivos en git (.committed) nunca se tocan, sin importar su nombre.
 * Ejecutado via hook PreToolUse en settings.json.
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

  for (const archivo of archivos) {
    if (path.extname(archivo) !== '.md') continue;
    if (enGit.has(archivo)) continue;  // esta en git → intocable

    // Solo eliminar si tiene prefijo legacy conocido o es un untracked generico
    const esLegacy = LEGACY_PREFIXES.some(p => archivo.startsWith(p));
    if (!esLegacy) continue;

    try {
      fs.unlinkSync(path.join(projectRoot, archivo));
      purgados++;
      process.stderr.write(`[detox] Eliminado: ${archivo}\n`);
    } catch (e) {
      process.stderr.write(`[detox] Error eliminando ${archivo}: ${e.message}\n`);
    }
  }

  if (purgados > 0) {
    process.stderr.write(`[detox] ${purgados} archivo(s) legacy eliminados.\n`);
  }
}

detox();
