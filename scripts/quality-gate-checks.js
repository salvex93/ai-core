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
// Solo el nucleo de cada skill -- references/*.md es contenido movido a proposito (G4).
const SKILL_MD = /^\.claude\/skills\/[^/]+\/SKILL\.md$/;
const LIMITE_LINEAS_SKILL = 500;

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

// Solo el nucleo (SKILL.md); references/*.md es donde G4 mueve contenido expansivo a proposito.
function revisarLimiteSkills(repo, limite = LIMITE_LINEAS_SKILL) {
  const excedidos = archivosDelRepo(repo)
    .filter((f) => SKILL_MD.test(f))
    .map((f) => ({ f, n: fs.readFileSync(path.join(repo, f), 'utf8').split('\n').length - 1 }))
    .filter(({ n }) => n > limite);
  const detalle = excedidos.map(({ f, n }) => `  ${n} lineas: ${f}`).join('\n');
  return { ok: excedidos.length === 0, detalle };
}

module.exports = { revisarResiduales, revisarSecretos, revisarLimiteSkills };
