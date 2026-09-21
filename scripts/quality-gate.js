#!/usr/bin/env node
'use strict';
/**
 * quality-gate.js — Marco de calidad previo a publicar cambios.
 *
 * Ejecuta, en orden y sin cortocircuitar, los mismos validadores que rigen el
 * proyecto: limite de 300 lineas en codigo, archivos residuales, credenciales
 * en el working tree, limite de 500 lineas en SKILL.md (references/*.md
 * exento, contenido movido a proposito por G4), conformidad de skills y
 * agentes, vigencia de mercado y la suite completa de tests. Sale 1 si alguno
 * falla.
 *
 * Un pase completo se cachea por estado exacto del repo (HEAD + diff +
 * untracked): un push sin cambios desde el ultimo pase no repite la suite.
 *
 * Uso:
 *   node scripts/quality-gate.js              gate completo
 *   node scripts/quality-gate.js --fast       sin la suite de tests
 *   node scripts/quality-gate.js --pre-push   modo hook git (lee refs por stdin)
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { revisarResiduales, revisarSecretos, revisarLimiteSkills } = require('./quality-gate-checks');

const REPO = path.resolve(__dirname, '..');
const LIMITE_LINEAS = 300;
const CODIGO = /\.(js|ts|py)$/;
const ES_WINDOWS = process.platform === 'win32';
const CACHE_PATH = path.join(os.tmpdir(), 'ai-core-locks', 'quality-gate.json');

// Git inyecta GIT_DIR/GIT_INDEX_FILE al hook; heredadas, los tests que crean
// repos temporales terminan operando sobre el repo real.
function entornoSinGit(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('GIT_')));
}

function correr(cmd, args, cwd = REPO) {
  const r = spawnSync(cmd, args, { cwd, env: entornoSinGit(), encoding: 'utf8', shell: ES_WINDOWS && cmd === 'npm', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, salida: `${r.stdout || ''}${r.stderr || ''}` };
}

function archivosDeCodigo(repo) {
  const r = correr('git', ['ls-files', '--cached', '--others', '--exclude-standard'], repo);
  return r.salida.split('\n').filter((f) => CODIGO.test(f) && fs.existsSync(path.join(repo, f)));
}

function revisarLimiteDeLineas(repo = REPO) {
  const excedidos = archivosDeCodigo(repo)
    .map((f) => ({ f, n: fs.readFileSync(path.join(repo, f), 'utf8').split('\n').length - 1 }))
    .filter(({ n }) => n > LIMITE_LINEAS);
  const detalle = excedidos.map(({ f, n }) => `  ${n} lineas: ${f}`).join('\n');
  return { ok: excedidos.length === 0, detalle };
}

function revisarComando(cmd, args, { fallaConSalida = false } = {}) {
  const r = correr(cmd, args);
  const ok = fallaConSalida ? r.status === 0 && !r.salida.trim() : r.status === 0;
  return { ok, detalle: r.salida.split('\n').slice(-40).join('\n') };
}

function definirChecks(rapido) {
  const checks = [
    { nombre: `limite de ${LIMITE_LINEAS} lineas en codigo`, ejecutar: () => revisarLimiteDeLineas() },
    { nombre: 'archivos residuales', ejecutar: () => revisarResiduales(REPO) },
    { nombre: 'credenciales en el working tree', ejecutar: () => revisarSecretos(REPO) },
    { nombre: 'limite de 500 lineas en SKILL.md', ejecutar: () => revisarLimiteSkills(REPO) },
    { nombre: 'conformidad de skills', ejecutar: () => revisarComando(process.execPath, ['.claude/bin/validate-globals.js']) },
    { nombre: 'conformidad de agentes', ejecutar: () => revisarComando(process.execPath, ['.claude/bin/validate-agents.js']) },
    { nombre: 'vigencia de mercado', ejecutar: () => revisarComando(process.execPath, ['.claude/bin/audit-market.js', '--only-stale'], { fallaConSalida: true }) },
  ];
  if (!rapido) checks.push({ nombre: 'suite de tests', ejecutar: () => revisarComando('npm', ['test']) });
  return checks;
}

// Contenido de los archivos sin trackear: `git diff HEAD` solo cubre los trackeados.
function contenidoSinTrackear() {
  const r = correr('git', ['ls-files', '--others', '--exclude-standard']);
  return r.salida.split('\n').filter(Boolean).map((f) => {
    try { return `${f}:${crypto.createHash('sha1').update(fs.readFileSync(path.join(REPO, f))).digest('hex')}`; } catch { return f; }
  }).join('\n');
}

function huellaDelRepo() {
  const partes = [['rev-parse', 'HEAD'], ['status', '--porcelain'], ['diff', 'HEAD']].map((a) => correr('git', a).salida);
  return crypto.createHash('sha1').update([...partes, contenidoSinTrackear()].join('\0')).digest('hex');
}

function leerCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { return {}; }
}

function guardarCache(huella) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify({ ...leerCache(), [REPO]: huella }), 'utf8');
}

// Un push que solo borra refs (local sha = ceros) no publica codigo: no se valida.
function soloBorraRamas(stdin) {
  const lineas = stdin.split('\n').filter(Boolean);
  return lineas.length > 0 && lineas.every((l) => /^\S+\s+0{40,}\s/.test(l));
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--pre-push') && soloBorraRamas(fs.readFileSync(0, 'utf8'))) return 0;

  const rapido = args.includes('--fast');
  const huella = rapido ? null : huellaDelRepo();
  if (huella && leerCache()[REPO] === huella) {
    console.error('[quality-gate] Estado sin cambios desde el ultimo pase completo: se omite.');
    return 0;
  }

  const fallos = definirChecks(rapido).filter(({ nombre, ejecutar }) => {
    const r = ejecutar();
    console.error(`[quality-gate] ${r.ok ? 'OK   ' : 'FALLA'} ${nombre}`);
    if (!r.ok) console.error(r.detalle);
    return !r.ok;
  });

  if (fallos.length === 0 && huella) guardarCache(huella);
  console.error(fallos.length === 0 ? '[quality-gate] Marco de calidad: cumple.' : `[quality-gate] ${fallos.length} verificacion(es) fallidas: publicacion bloqueada.`);
  return fallos.length === 0 ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { soloBorraRamas, revisarLimiteDeLineas, definirChecks, entornoSinGit };
