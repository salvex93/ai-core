'use strict';
/**
 * quality-gate-checks.js — verificaciones del gate sobre el working tree
 * (archivos residuales de merges/parches y credenciales de alta confianza).
 * Separado de quality-gate.js para mantener cada modulo bajo el limite de lineas.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ALTA_CONFIANZA } = require('../.claude/bin/lib/patrones-secretos');

const RESIDUAL = /\.(new|orig|rej)$/;
// Los tests incluyen credenciales falsas a proposito para probar los guards.
const RUTA_EXENTA_DE_SECRETOS = /^tests\//;
const MAX_BYTES_ESCANEO = 1024 * 1024;

function archivosDelRepo(repo) {
  const r = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return (r.stdout || '').split('\n').filter((f) => f && fs.existsSync(path.join(repo, f)));
}

function leerTextoAcotado(ruta) {
  const st = fs.statSync(ruta);
  if (!st.isFile() || st.size > MAX_BYTES_ESCANEO) return null;
  const buffer = fs.readFileSync(ruta);
  return buffer.includes(0) ? null : buffer.toString('utf8');
}

function revisarResiduales(repo) {
  const residuales = archivosDelRepo(repo).filter((f) => RESIDUAL.test(f));
  return { ok: residuales.length === 0, detalle: residuales.map((f) => `  residual: ${f}`).join('\n') };
}

function etiquetasEnTexto(texto) {
  return ALTA_CONFIANZA.filter(({ re }) => re.test(texto)).map(({ etiqueta }) => etiqueta);
}

function revisarSecretos(repo) {
  const hallazgos = [];
  for (const f of archivosDelRepo(repo).filter((r) => !RUTA_EXENTA_DE_SECRETOS.test(r))) {
    const texto = leerTextoAcotado(path.join(repo, f));
    if (texto) etiquetasEnTexto(texto).forEach((etiqueta) => hallazgos.push(`  ${etiqueta}: ${f}`));
  }
  return { ok: hallazgos.length === 0, detalle: hallazgos.join('\n') };
}

module.exports = { revisarResiduales, revisarSecretos };
