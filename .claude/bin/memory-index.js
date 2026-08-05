#!/usr/bin/env node
/**
 * memory-index.js — CLI del vault de memoria semantica (motor BM25 en lib/bm25-engine.js)
 *
 * Comandos:
 *   node memory-index.js index [--rol=architect|coder|auditor]
 *     indexa .raw/<rol>/ → .wiki/<rol>/ (ejecutar en Stop hook)
 *     --rol indica donde escribir/reindexar; si se omite, opera sobre "general"
 *     y sobre cualquier .raw/<rol>/ ya existente (reindexa todo el vault).
 *   node memory-index.js query "terminos" [--rol=architect|coder|auditor]
 *     busca y devuelve top-5 fragmentos relevantes.
 *     --rol filtra la busqueda a ese namespace; sin --rol busca cross-rol
 *     (util cuando un hallazgo de un rol es relevante para otro).
 *   node memory-index.js status             — muestra estado del vault por rol
 *
 * Arquitectura:
 *   .raw/<rol>/   — fuentes originales por rol (markdown plano, una entrada por archivo)
 *   .wiki/<rol>/  — fragmentos indexados con backlinks y metadatos BM25
 *   index.json    — indice invertido BM25 global (regenerado en cada `index`),
 *                   cada fragmento lleva su `rol` de origen para poder filtrar
 *
 * Namespacing: el aislamiento es por convencion de carpeta, no por archivo
 * separado — permite busqueda cross-rol explicita sin duplicar el indice.
 * Entradas legacy sin subcarpeta de rol (root de .raw/) se tratan como "general".
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const { fragmentar, buildIndex, bm25Score } = require('./lib/bm25-engine');

const REPO  = path.resolve(__dirname, '..', '..');
// AI_CORE_MEMORY_VAULT_PATH permite operar sobre un vault temporal en tests
// aislados -- sin ella, comportamiento identico (vault real del repo).
const VAULT = process.env.AI_CORE_MEMORY_VAULT_PATH || path.join(REPO, '.claude', 'memory-vault');
const RAW   = path.join(VAULT, '.raw');
const WIKI  = path.join(VAULT, '.wiki');
const INDEX = path.join(VAULT, 'index.json');

const ROLES_VALIDOS = ['architect', 'coder', 'auditor'];
const ROL_DEFECTO   = 'general';

function parseRolArg(args) {
  const flag = args.find(a => a.startsWith('--rol='));
  if (!flag) return null;
  const rol = flag.slice('--rol='.length);
  return ROLES_VALIDOS.includes(rol) ? rol : null;
}

// ─── Descubrimiento de namespaces por rol en .raw/ ───────────────────────────
// Un archivo directamente en .raw/ (sin subcarpeta) pertenece al namespace
// ROL_DEFECTO ("general") — cubre las entradas legacy previas al namespacing.
function descubrirNamespaces() {
  if (!fs.existsSync(RAW)) return [];

  const entradas = fs.readdirSync(RAW, { withFileTypes: true });
  const namespaces = [];

  const sueltos = entradas.filter(e => e.isFile() && e.name.endsWith('.md'));
  if (sueltos.length > 0) namespaces.push({ rol: ROL_DEFECTO, dir: RAW, files: sueltos.map(e => e.name) });

  for (const e of entradas.filter(e => e.isDirectory())) {
    const dir = path.join(RAW, e.name);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    if (files.length > 0) namespaces.push({ rol: e.name, dir, files });
  }

  return namespaces;
}

// ─── Comandos ─────────────────────────────────────────────────────────────────

function cmdIndex(rolFiltro) {
  if (!fs.existsSync(RAW)) { console.error('[memory] .raw/ no existe'); process.exit(1); }

  const namespaces = descubrirNamespaces()
    .filter(ns => !rolFiltro || ns.rol === rolFiltro);

  if (namespaces.length === 0) {
    console.log('[memory] vault vacio — nada que indexar');
    return;
  }

  const allFrags = [];
  for (const ns of namespaces) {
    fs.mkdirSync(path.join(WIKI, ns.rol === ROL_DEFECTO ? '.' : ns.rol), { recursive: true });
    for (const f of ns.files) {
      const content = fs.readFileSync(path.join(ns.dir, f), 'utf8');
      allFrags.push(...fragmentar(content, f, ns.rol));
    }
  }

  const index = buildIndex(allFrags);
  index.frags = allFrags.reduce((acc, f) => { acc[f.id] = f; return acc; }, {});
  index.builtAt = new Date().toISOString();

  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2), 'utf8');

  // Generar .wiki/<rol>/ — un archivo por fuente con backlinks
  for (const ns of namespaces) {
    const wikiDir = ns.rol === ROL_DEFECTO ? WIKI : path.join(WIKI, ns.rol);
    for (const f of ns.files) {
      const nombre = path.basename(f, '.md');
      const fragIds = allFrags.filter(fr => fr.source === nombre && fr.rol === ns.rol).map(fr => fr.id);
      const wikiContent = [
        `# ${nombre} — wiki [${ns.rol}]`,
        `> Generado: ${new Date().toISOString().slice(0, 10)} | Fragmentos: ${fragIds.length}`,
        '',
        fs.readFileSync(path.join(ns.dir, f), 'utf8').trim(),
      ].join('\n');
      fs.writeFileSync(path.join(wikiDir, f), wikiContent, 'utf8');
    }
  }

  const totalFiles = namespaces.reduce((s, ns) => s + ns.files.length, 0);
  console.log(`[memory] indexados ${allFrags.length} fragmentos de ${totalFiles} archivos (namespaces: ${namespaces.map(n => n.rol).join(', ')})`);
}

function leerIndice() {
  try {
    return JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  } catch (err) {
    console.error(`[memory] indice corrupto (${err.message}) — ejecutar: node memory-index.js index`);
    return null;
  }
}

function cmdQuery(query, rolFiltro) {
  if (!query) { console.error('[memory] query vacia'); process.exit(1); }
  if (!fs.existsSync(INDEX)) {
    console.log('[memory] indice no encontrado — ejecutar: node memory-index.js index');
    return;
  }

  const index = leerIndice();
  if (!index) return;

  const indexFiltrado = rolFiltro
    ? { ...index, frags: Object.fromEntries(Object.entries(index.frags).filter(([, f]) => f.rol === rolFiltro)) }
    : index;

  const hits = bm25Score(query, indexFiltrado);

  if (hits.length === 0) {
    console.log(`[memory] sin resultados para: ${query}${rolFiltro ? ` (rol: ${rolFiltro})` : ''}`);
    return;
  }

  console.log(`[memory] top resultados para "${query}"${rolFiltro ? ` (rol: ${rolFiltro})` : ' (cross-rol)'}:\n`);
  for (const [id, score] of hits) {
    const frag = indexFiltrado.frags[id];
    if (!frag) continue;
    console.log(`--- [${id}] score: ${score.toFixed(3)}`);
    console.log(frag.text.slice(0, 300));
    console.log('');
  }
}

function cmdStatus() {
  const namespaces = descubrirNamespaces();
  const hasIndex   = fs.existsSync(INDEX);

  console.log(`[memory] vault: ${VAULT}`);
  console.log(`[memory] indice : ${hasIndex ? 'presente' : 'ausente — ejecutar index'}`);

  if (namespaces.length === 0) {
    console.log('[memory] .raw/  : 0 archivo(s)');
    console.log('[memory] .wiki/ : 0 archivo(s)');
  } else {
    for (const ns of namespaces) {
      const sufijo   = ns.rol === ROL_DEFECTO ? '' : ns.rol + '/';
      const wikiDir   = ns.rol === ROL_DEFECTO ? WIKI : path.join(WIKI, ns.rol);
      const wikiCount = fs.existsSync(wikiDir) ? fs.readdirSync(wikiDir).filter(f => f.endsWith('.md')).length : 0;
      console.log(`[memory] .raw/${sufijo}  : ${ns.files.length} archivo(s)`);
      console.log(`[memory] .wiki/${sufijo} : ${wikiCount} archivo(s)`);
    }
  }

  if (hasIndex) {
    const idx = leerIndice();
    if (!idx) return;
    const frags = Object.values(idx.frags || {});
    console.log(`[memory] fragmentos: ${frags.length}`);
    for (const rol of [...ROLES_VALIDOS, ROL_DEFECTO]) {
      const n = frags.filter(f => f.rol === rol).length;
      if (n > 0) console.log(`[memory]   - ${rol}: ${n}`);
    }
    console.log(`[memory] construido: ${idx.builtAt || 'desconocido'}`);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────
const [,, cmd, ...args] = process.argv;
const rolArg = parseRolArg(args);
const terminos = args.filter(a => !a.startsWith('--rol=')).join(' ');

switch (cmd) {
  case 'index':  cmdIndex(rolArg);         break;
  case 'query':  cmdQuery(terminos, rolArg); break;
  case 'status': cmdStatus();              break;
  default:
    console.log('Uso: node memory-index.js [index [--rol=<rol>]|query <terminos> [--rol=<rol>]|status]');
    process.exit(0);
}
