#!/usr/bin/env node
/**
 * memory-index.js — Motor BM25 para el vault de memoria semantica
 *
 * Comandos:
 *   node memory-index.js index              — indexa .raw/ → .wiki/ (ejecutar en Stop hook)
 *   node memory-index.js query "terminos"   — busca y devuelve top-5 fragmentos relevantes
 *   node memory-index.js status             — muestra estado del vault
 *
 * Arquitectura:
 *   .raw/   — fuentes originales (markdown plano, una entrada por archivo)
 *   .wiki/  — fragmentos indexados con backlinks y metadatos BM25
 *   index.json — indice invertido BM25 (regenerado en cada `index`)
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const REPO  = path.resolve(__dirname, '..', '..');
const VAULT = path.join(REPO, '.claude', 'memory-vault');
const RAW   = path.join(VAULT, '.raw');
const WIKI  = path.join(VAULT, '.wiki');
const INDEX = path.join(VAULT, 'index.json');

// ─── BM25 — parametros estandar ──────────────────────────────────────────────
const K1 = 1.5;
const B  = 0.75;

// Boost aplicado a tokens que provienen del frontmatter (name + description)
const FIELD_BOOST = 3;

// ─── Tokenizacion ─────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'el','la','los','las','un','una','de','del','en','y','a','al','con','por',
  'que','es','se','no','su','sus','lo','le','les','para','como','pero','más',
  'si','ya','este','esta','estos','estas','the','and','or','in','of','to',
  'a','is','it','was','for','on','are','as','with','his','they','at','be',
]);

// Sinonimos del dominio — expansión de query
const SYNONYMS = {
  arnes:    ['harness','aicore','ai-core','arnés'],
  harness:  ['arnes','arnés','aicore','ai-core'],
  skill:    ['habilidad','skills','perfil'],
  sesion:   ['session','sesión','conversacion'],
  sesión:   ['session','sesion','conversacion'],
  session:  ['sesion','sesión','conversacion'],
  agente:   ['agent','agents','agentes','subagente'],
  agent:    ['agente','agentes','subagente'],
  memoria:  ['memory','vault','recuerdo'],
  memory:   ['memoria','vault'],
  estado:   ['status','estado','activo','score'],
  pendiente:['todo','pending','tarea','task'],
  implementar:['implementacion','implementado','deploy','despliegue'],
  error:    ['fallo','bug','fix','problema','issue'],
};

// Stemming minimo en español — elimina sufijos comunes para normalizar terminos
function stem(word) {
  return word
    .replace(/aciones$/, '')
    .replace(/ación$|acion$/, '')
    .replace(/iendo$|ando$/, '')
    .replace(/ados$|idas$|idos$|adas$/, '')
    .replace(/ado$|ida$|ido$|ada$/, '')
    .replace(/mente$/, '')
    .replace(/amos$|emos$|imos$/, '')
    .replace(/mos$/, '')
    .replace(/es$/, '')
    .replace(/s$/, '');
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-záéíóúüñ\w\s]/gi, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t))
    .map(stem);
}

// Expande una query incluyendo sinonimos del dominio
function expandQuery(tokens) {
  const expanded = new Set(tokens);
  for (const t of tokens) {
    const syns = SYNONYMS[t];
    if (syns) syns.forEach(s => expanded.add(stem(s)));
  }
  return [...expanded];
}

// ─── Extraccion de frontmatter ────────────────────────────────────────────────
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) meta[key.trim()] = rest.join(':').trim();
  }
  return { meta, body: content.slice(match[0].length) };
}

// ─── Fragmentacion de documentos ─────────────────────────────────────────────
function fragmentar(content, filePath) {
  const name = path.basename(filePath, '.md');
  const { meta, body } = parseFrontmatter(content);
  const sections = body.split(/^#{1,3}\s+/m);
  const frags = [];

  // Tokens del frontmatter con boost: se repiten FIELD_BOOST veces en el vector
  const metaText = [meta.name || '', meta.description || ''].join(' ');
  const metaTokensBoosted = metaText.trim().length > 2
    ? Array(FIELD_BOOST).fill(tokenize(metaText)).flat()
    : [];

  sections.forEach((sec, i) => {
    const trimmed = sec.trim();
    if (trimmed.length < 50) return;
    frags.push({
      id:     `${name}#${i}`,
      source: name,
      text:   trimmed.slice(0, 800),
      tokens: [...tokenize(trimmed), ...metaTokensBoosted],
    });
  });

  // Si no hay secciones con headings, tratar el doc como un fragmento
  if (frags.length === 0 && content.trim().length > 20) {
    frags.push({
      id:     `${name}#0`,
      source: name,
      text:   content.trim().slice(0, 800),
      tokens: [...tokenize(content), ...metaTokensBoosted],
    });
  }

  return frags;
}

// ─── Construccion del indice invertido ───────────────────────────────────────
function buildIndex(frags) {
  const df  = {};   // document frequency por termino
  const inv = {};   // indice invertido: term → [{id, tf}]
  const len = {};   // longitud de cada fragmento en tokens

  for (const frag of frags) {
    len[frag.id] = frag.tokens.length;
    const tf = {};
    for (const t of frag.tokens) tf[t] = (tf[t] || 0) + 1;
    for (const t of Object.keys(tf)) {
      df[t] = (df[t] || 0) + 1;
      if (!inv[t]) inv[t] = [];
      inv[t].push({ id: frag.id, tf: tf[t] });
    }
  }

  const avgLen = frags.length
    ? Object.values(len).reduce((s, l) => s + l, 0) / frags.length
    : 1;

  return { df, inv, len, avgLen, N: frags.length };
}

// ─── Puntuacion BM25 ─────────────────────────────────────────────────────────
function bm25Score(query, index) {
  const qTokens = expandQuery(tokenize(query));
  const scores  = {};

  for (const t of qTokens) {
    if (!index.inv[t]) continue;
    const df   = index.df[t] || 1;
    const idf  = Math.log((index.N - df + 0.5) / (df + 0.5) + 1);

    for (const { id, tf } of index.inv[t]) {
      const docLen = index.len[id] || 1;
      const norm   = 1 - B + B * (docLen / index.avgLen);
      const score  = idf * ((tf * (K1 + 1)) / (tf + K1 * norm));
      scores[id]   = (scores[id] || 0) + score;
    }
  }

  return Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
}

// ─── Comandos ─────────────────────────────────────────────────────────────────

function cmdIndex() {
  if (!fs.existsSync(RAW)) { console.error('[memory] .raw/ no existe'); process.exit(1); }

  const files = fs.readdirSync(RAW).filter(f => f.endsWith('.md'));
  if (files.length === 0) {
    console.log('[memory] vault vacio — nada que indexar');
    return;
  }

  const allFrags = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(RAW, f), 'utf8');
    allFrags.push(...fragmentar(content, f));
  }

  const index = buildIndex(allFrags);
  index.frags = allFrags.reduce((acc, f) => { acc[f.id] = f; return acc; }, {});
  index.builtAt = new Date().toISOString();

  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2), 'utf8');

  // Generar .wiki/ — un archivo por fuente con backlinks
  for (const f of files) {
    const fragIds = allFrags.filter(fr => fr.source === path.basename(f, '.md')).map(fr => fr.id);
    const wikiContent = [
      `# ${path.basename(f, '.md')} — wiki`,
      `> Generado: ${new Date().toISOString().slice(0, 10)} | Fragmentos: ${fragIds.length}`,
      '',
      fs.readFileSync(path.join(RAW, f), 'utf8').trim(),
    ].join('\n');
    fs.writeFileSync(path.join(WIKI, f), wikiContent, 'utf8');
  }

  console.log(`[memory] indexados ${allFrags.length} fragmentos de ${files.length} archivos`);
}

function cmdQuery(query) {
  if (!query) { console.error('[memory] query vacia'); process.exit(1); }
  if (!fs.existsSync(INDEX)) {
    console.log('[memory] indice no encontrado — ejecutar: node memory-index.js index');
    return;
  }

  const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  const hits  = bm25Score(query, index);

  if (hits.length === 0) {
    console.log('[memory] sin resultados para: ' + query);
    return;
  }

  console.log(`[memory] top resultados para "${query}":\n`);
  for (const [id, score] of hits) {
    const frag = index.frags[id];
    if (!frag) continue;
    console.log(`--- [${id}] score: ${score.toFixed(3)}`);
    console.log(frag.text.slice(0, 300));
    console.log('');
  }
}

function cmdStatus() {
  const rawFiles  = fs.existsSync(RAW)  ? fs.readdirSync(RAW).filter(f => f.endsWith('.md'))  : [];
  const wikiFiles = fs.existsSync(WIKI) ? fs.readdirSync(WIKI).filter(f => f.endsWith('.md')) : [];
  const hasIndex  = fs.existsSync(INDEX);

  console.log(`[memory] vault: ${VAULT}`);
  console.log(`[memory] .raw/  : ${rawFiles.length} archivo(s)`);
  console.log(`[memory] .wiki/ : ${wikiFiles.length} archivo(s)`);
  console.log(`[memory] indice : ${hasIndex ? 'presente' : 'ausente — ejecutar index'}`);

  if (hasIndex) {
    const idx = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
    console.log(`[memory] fragmentos: ${Object.keys(idx.frags || {}).length}`);
    console.log(`[memory] construido: ${idx.builtAt || 'desconocido'}`);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'index':  cmdIndex();            break;
  case 'query':  cmdQuery(args.join(' ')); break;
  case 'status': cmdStatus();           break;
  default:
    console.log('Uso: node memory-index.js [index|query <terminos>|status]');
    process.exit(0);
}
