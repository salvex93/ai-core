'use strict';

/**
 * lib/contextual-retrieval-benchmark.js — mide recall@K real (no simulado)
 * de BM25+ sobre el corpus de 43 SKILL.md del propio ai-core, CON y SIN
 * Contextual Retrieval (prefijo por chunk generado por LLM real). Cierra
 * el gap identificado: rag-specialist.md documenta la tecnica y cita el
 * benchmark oficial de Anthropic (35%/49%/67% de reduccion de fallo segun
 * combinacion), pero nunca se corrio contra un corpus propio para
 * confirmar la mejora en la practica, con este motor BM25+ especifico
 * (bm25-engine.js), que no es identico al de Anthropic (stemming en
 * español, sinonimos de dominio, boost de frontmatter).
 *
 * Metodologia: 15 queries con ground truth fijado A MANO antes de correr
 * cualquier medicion (el chunk exacto que responde cada query, decidido
 * por conocimiento real del contenido de los skills, no adivinado
 * post-hoc). Metrica: recall@5 (el chunk correcto aparece en el top-5).
 *
 * Este modulo NO llama a ningun LLM -- el prefijo contextual se recibe ya
 * generado via el parametro generarPrefijo de aplicarContextualRetrieval()
 * (quien invoque este modulo decide como generarlo: Gemini, Claude, etc.).
 */

const fs = require('node:fs');
const path = require('node:path');
const { fragmentar, tokenize, expandQuery, buildIndex } = require('./bm25-engine');

/**
 * Ground truth fijado a mano ANTES de correr ninguna medicion. Cada query
 * fue elegida porque el termino clave NO aparece literal en el chunk
 * correcto (o aparece de forma ambigua en otros chunks) -- exactamente el
 * caso donde Contextual Retrieval deberia ayudar, segun el mecanismo real
 * documentado por Anthropic (el prefijo situa el chunk dentro del
 * documento, ayudando a matches que dependen de contexto, no solo de
 * co-ocurrencia literal de terminos).
 */
const GROUND_TRUTH = [
  { query: 'cuando se apago text-embedding-004', esperado: 'skill/multimodal-engineer#16' },
  { query: 'que hacer si el catalogo de herramientas MCP es muy grande', esperado: 'skill/mcp-server-builder#16' },
  { query: 'como saber si un CVE es realmente explotable antes de marcarlo critico', esperado: 'skill/security-auditor#8' },
  { query: 'reduce hasta 85% de tokens en descubrimiento de herramientas', esperado: 'skill/mcp-server-builder#16' },
  { query: 'que modelo de embeddings soporta imagen video audio y PDF en una sola llamada', esperado: 'skill/multimodal-engineer#16' },
  { query: 'formula para combinar busqueda lexica y densa con amortiguacion k=60', esperado: 'skill/rag-specialist#24' },
  { query: 'mejora de retrieval al anteponer contexto a cada fragmento antes de indexar', esperado: 'skill/rag-specialist#25' },
  { query: 'limite de paginas y tamano de archivo para procesar PDFs con Claude', esperado: 'skill/multimodal-engineer#26' },
  { query: 'que transporte reemplaza al SSE legacy en servidores remotos MCP', esperado: 'skill/mcp-server-builder#9' },
  { query: 'los 10 controles de seguridad de aplicaciones web mas criticos', esperado: 'skill/security-auditor#14' },
  { query: 'riesgo de que un modelo LLM tenga demasiado acceso a herramientas sin supervision', esperado: 'skill/security-auditor#32' },
  { query: 'cuanto cuesta procesar un documento con cache activo segun Anthropic', esperado: 'skill/rag-specialist#25' },
  { query: 'que hacer cuando el diseño no se puede resumir en una frase de por que funciona mejor que busqueda simple', esperado: 'skill/rag-specialist#42' },
  { query: 'variantes de nombre para el algoritmo de busqueda por texto en tools MCP', esperado: 'skill/mcp-server-builder#16' },
  { query: 'protocolo cuando el pipeline visual procesa datos biometricos sin politica aprobada', esperado: 'skill/multimodal-engineer#18' },
];

/**
 * Carga y fragmenta el corpus real de los SKILL.md dentro de skillsDir.
 * @param {string} skillsDir ruta absoluta a .claude/skills
 * @returns {Array} fragmentos con id/source/rol/text/tokens
 */
function cargarCorpus(skillsDir) {
  const dirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory());
  const frags = [];
  for (const d of dirs) {
    const archivo = path.join(skillsDir, d.name, 'SKILL.md');
    if (!fs.existsSync(archivo)) continue;
    const content = fs.readFileSync(archivo, 'utf8');
    // Nombre real del skill (no "SKILL") para que los IDs sean unicos y
    // verificables entre los 43 archivos, todos literalmente "SKILL.md".
    frags.push(...fragmentar(content, `${d.name}.md`, 'skill'));
  }
  return frags;
}

/**
 * Aplica un prefijo contextual a cada fragmento (contextual embeddings +
 * contextual BM25, ver rag-specialist.md): el prefijo se antepone al texto
 * ANTES de tokenizar, afectando el indice lexico (BM25, lo que este motor
 * implementa realmente -- no hay componente denso/embeddings en
 * bm25-engine.js, asi que esto mide especificamente la mitad "Contextual
 * BM25" de la tecnica, no "Contextual Embeddings").
 *
 * @param {Array} frags fragmentos originales
 * @param {(frag: object) => string} generarPrefijo funcion que produce el prefijo contextual para un fragmento (ya generado por LLM real, no simulado)
 * @returns {Array} fragmentos con texto+tokens re-derivados del prefijo+contenido original
 */
function aplicarContextualRetrieval(frags, generarPrefijo) {
  return frags.map(f => {
    const prefijo = generarPrefijo(f) || '';
    const textoConContexto = prefijo ? `${prefijo}\n\n${f.text}` : f.text;
    return {
      ...f,
      text: textoConContexto,
      tokens: tokenize(textoConContexto),
    };
  });
}

/**
 * Corre el benchmark de recall@K contra un indice ya construido. Replica
 * el scoring de bm25Score() de bm25-engine.js (misma formula, mismos
 * K1=1.5/B=0.75) en vez de reusar esa funcion directamente porque
 * bm25Score() esta acotada a top-5 fijo -- aqui K es parametrizable para
 * poder medir recall@3, recall@5, recall@10 con el mismo indice.
 *
 * @param {object} index indice BM25 (de buildIndex)
 * @param {number} k top-K a considerar para recall
 * @returns {{recallAtK: number, detalle: Array}}
 */
function medirRecall(index, k = 5) {
  const detalle = GROUND_TRUTH.map(({ query, esperado }) => {
    const qTokens = expandQuery(tokenize(query));
    const scores = {};
    for (const t of qTokens) {
      if (!index.inv[t]) continue;
      const df = index.df[t] || 1;
      const idf = Math.log((index.N - df + 0.5) / (df + 0.5) + 1);
      for (const { id, tf } of index.inv[t]) {
        const docLen = index.len[id] || 1;
        const norm = 1 - 0.75 + 0.75 * (docLen / index.avgLen);
        const score = idf * ((tf * (1.5 + 1)) / (tf + 1.5 * norm));
        scores[id] = (scores[id] || 0) + score;
      }
    }
    const topK = Object.entries(scores).sort(([, a], [, b]) => b - a).slice(0, k).map(([id]) => id);
    const acierto = topK.includes(esperado);
    return { query, esperado, topK, acierto };
  });

  const recallAtK = detalle.filter(d => d.acierto).length / detalle.length;
  return { recallAtK, detalle };
}

module.exports = { GROUND_TRUTH, cargarCorpus, aplicarContextualRetrieval, medirRecall };
