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

// Copyleft fuerte (obliga a liberar codigo derivado bajo la misma licencia) --
// incompatible con distribuir ai-core como submodulo cerrado en un proyecto
// anfitrion de terceros. Copyleft debil (LGPL, MPL) se deja pasar a proposito:
// afecta solo al propio paquete modificado, no al codigo que lo consume.
const LICENCIAS_PROHIBIDAS = /^(A?GPL|SSPL)(-|\b)/i;

function recolectarPaquetes(dependencies, acc = []) {
  if (!dependencies) return acc;
  for (const [nombre, info] of Object.entries(dependencies)) {
    acc.push({ nombre, version: info.version, license: info.license });
    recolectarPaquetes(info.dependencies, acc);
  }
  return acc;
}

/**
 * Audita el arbol de dependencias (salida de `npm ls --all --json --long`)
 * en busca de licencias copyleft fuerte (GPL/AGPL/SSPL) no declaradas en
 * package.json -- gap real detectado en revision de gobierno 2026-09-22
 * (control "license governance" del marco enterprise de agentes): las 3
 * dependencias directas son MIT/Apache-2.0, pero el arbol transitivo nunca
 * se auditaba.
 * @param {string} salidaNpmLs - JSON crudo de `npm ls --all --json --long`
 * @returns {{ok: boolean, detalle: string}}
 */
function revisarLicencias(salidaNpmLs) {
  let data;
  try { data = JSON.parse(salidaNpmLs); } catch {
    return { ok: false, detalle: '  no se pudo interpretar la salida de "npm ls" como JSON' };
  }

  const paquetes = recolectarPaquetes(data.dependencies);
  const prohibidos = paquetes.filter((p) => p.license && LICENCIAS_PROHIBIDAS.test(p.license));
  const sinDeclarar = paquetes.filter((p) => !p.license);

  const detalle = [
    ...prohibidos.map((p) => `  ${p.license}: ${p.nombre}@${p.version}`),
    ...sinDeclarar.map((p) => `  sin license declarado: ${p.nombre}@${p.version} (revisar manualmente)`),
  ].join('\n');

  return { ok: prohibidos.length === 0, detalle };
}

module.exports = { revisarResiduales, revisarSecretos, revisarLimiteSkills, revisarLicencias };
