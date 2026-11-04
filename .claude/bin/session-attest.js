#!/usr/bin/env node
'use strict';

/**
 * session-attest.js — CLI del informe de sesion firmado.
 *
 *   keygen   crea el par Ed25519 (privada 0600) fuera del repo; no sobrescribe
 *   sign     hook Stop: firma y encadena el informe; nunca falla (exit 0)
 *   verify   verifica firma y cadena con la clave publica; exit 1 si se rompe
 *
 * Entorno (todo opcional):
 *   AI_CORE_ATTEST_DIR          claves; por defecto ~/.config/ai-core
 *   AI_CORE_ATTEST_CHAIN        cadena; por defecto .claude/ATTESTATIONS.jsonl
 *   AI_CORE_ATTEST_BREAK_GLASS  registro break-glass; por defecto .claude/BREAK_GLASS_LOG.jsonl
 *   AI_CORE_GUARD_REPORT_PATH   reporte de guards de la sesion (ver guard-report.js)
 *   AI_CORE_POLICY              politica a evaluar; por defecto benchmark/policy.json (sin ella no hay cumplimiento)
 *
 * Sin clave privada, `sign` no hace nada: la firma es opt-in por maquina.
 */

const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const att   = require('./lib/session-attestation.js');
const store = require('./lib/session-attestation-store.js');
const pc    = require('./lib/policy-compliance.js');
const { GUARD_REPORT_PATH } = require('./lib/guard-report.js');

const REPO = path.resolve(__dirname, '../..');
const env  = process.env;
const DIR_CLAVES = env.AI_CORE_ATTEST_DIR || path.join(os.homedir(), '.config', 'ai-core');
const CADENA     = env.AI_CORE_ATTEST_CHAIN || path.join(REPO, '.claude', 'ATTESTATIONS.jsonl');
const BREAK_GLASS = env.AI_CORE_ATTEST_BREAK_GLASS || path.join(REPO, '.claude', 'BREAK_GLASS_LOG.jsonl');
const POLITICA = env.AI_CORE_POLICY || path.join(REPO, 'benchmark', 'policy.json');
const PRIVADA = path.join(DIR_CLAVES, 'attest.key');
const PUBLICA = path.join(DIR_CLAVES, 'attest.pub');

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
}

function version() {
  try { return JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version; } catch { return 'desconocida'; }
}

// Contenido atestado: lo unico que, si no cambia, hace innecesario otro sobre.
function huella(informe) {
  return att.canonicalizar({ s: informe.sessionId, g: informe.guards, b: informe.breakGlass });
}

const conDatos = (informe) => (informe.cumplimiento || []).some(r => r.estado !== 'sin_datos');

// Sin artefactos nuevos que evaluar el cumplimiento no cambia el contenido atestado
function mismoContenido(previo, nuevo) {
  if (huella(previo) !== huella(nuevo)) return false;
  return !conDatos(nuevo) || att.canonicalizar([previo.politica, previo.cumplimiento]) === att.canonicalizar([nuevo.politica, nuevo.cumplimiento]);
}

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

// Commits desde el sobre anterior (o solo HEAD si no hay referencia valida) y sus archivos de codigo vivos
function artefactosDeSesion(desdeHead) {
  const rango = desdeHead ? `${desdeHead}..HEAD` : 'HEAD^..HEAD';
  let salida;
  try { salida = git(['log', rango, '--format=%h%x1f%an%x1f%B%x1e']); } catch { return { commits: [], archivos: [] }; }
  const commits = salida.split('\x1e').map(s => s.trim()).filter(Boolean).map(s => {
    const [hash, autor, mensaje] = s.split('\x1f');
    return { hash, autor, mensaje };
  });
  const rutas = commits.length ? git(['diff', '--name-only', '--diff-filter=AM', rango]).split('\n').filter(Boolean) : [];
  const archivos = rutas.filter(r => fs.existsSync(path.join(REPO, r)))
    .map(r => ({ ruta: r, lineas: fs.readFileSync(path.join(REPO, r), 'utf8').split('\n').length - 1 }));
  return { commits, archivos };
}

function cumplimientoDeSesion(desdeHead) {
  if (!fs.existsSync(POLITICA)) return {};
  const politica = JSON.parse(fs.readFileSync(POLITICA, 'utf8'));
  const { commits, archivos } = artefactosDeSesion(desdeHead);
  const cumplimiento = pc.evaluarCumplimiento({ commits, archivos, politica });
  return { politicaHash: pc.hashPolitica(politica), cumplimiento };
}

function firmar() {
  if (!fs.existsSync(PRIVADA)) return;
  const sobres = store.leerJsonl(CADENA);
  const ultimo = sobres[sobres.length - 1];
  const desde = ultimo ? ultimo.informe.emitidoEn : '';
  const informe = att.construirInforme({
    sessionId: env.CLAUDE_CODE_SESSION_ID || 'desconocida',
    version: version(),
    gitHead: gitHead(),
    guardReportes: store.leerJsonl(env.AI_CORE_GUARD_REPORT_PATH || GUARD_REPORT_PATH),
    breakGlass: store.leerJsonl(BREAK_GLASS).filter(b => (b.confirmadoEn || '') > desde),
    prevHash: ultimo ? ultimo.hash : att.GENESIS,
    ...cumplimientoDeSesion(ultimo ? ultimo.informe.gitHead : null),
  });
  const vacio = informe.guards.total.ok + informe.guards.total.warn + informe.guards.total.blocked + informe.breakGlass.length === 0 && !conDatos(informe);
  if (vacio) return;
  if (ultimo && ultimo.informe.sessionId === informe.sessionId && mismoContenido(ultimo.informe, informe)) return;
  store.agregarSobre(CADENA, att.firmarInforme(informe, fs.readFileSync(PRIVADA, 'utf8')));
}

function verificar() {
  if (!fs.existsSync(PUBLICA)) { console.error(`Falta la clave publica: ${PUBLICA}`); return 1; }
  const sobres = store.leerJsonl(CADENA);
  const r = att.verificarCadena(sobres, fs.readFileSync(PUBLICA, 'utf8'));
  if (!r.ok) { console.log(`Cadena invalida en el sobre ${r.indiceRoto}: ${r.motivo}`); return 1; }
  console.log(`Cadena valida: ${sobres.length} sobre(s). Hash de cabeza (anclar fuera del equipo): ${store.hashCabeza(CADENA)}`);
  return 0;
}

function main(cmd) {
  if (cmd === 'sign') { try { firmar(); } catch { /* el hook Stop nunca debe fallar */ } return 0; }
  if (cmd === 'verify') return verificar();
  if (cmd === 'keygen') {
    try { const r = store.generarClaves(DIR_CLAVES); console.log(`Privada: ${r.privada}\nPublica: ${r.publica}`); return 0; }
    catch (e) { console.error(e.message); return 1; }
  }
  console.error('Uso: session-attest.js <keygen|sign|verify>');
  return 2;
}

process.exitCode = main(process.argv[2]);
