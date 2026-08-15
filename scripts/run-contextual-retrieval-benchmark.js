'use strict';

/**
 * Genera prefijos contextuales reales (Contextual Retrieval, Anthropic) via
 * Claude Haiku 4.5 para el corpus completo de 43 SKILL.md, y mide recall@5
 * CON contextual retrieval contra el mismo ground truth ya usado para medir
 * la baseline (53.3% recall@5, ver contextual-retrieval-benchmark.js).
 *
 * Una llamada por SKILL.md (no por fragmento): el documento completo se pasa
 * como `system` con prompt caching, y se pide un prefijo de 1-2 frases por
 * cada seccion en una sola respuesta -- evita 1366 llamadas individuales.
 *
 * Uso: node scripts/run-contextual-retrieval-benchmark.js
 */

const path = require('node:path');
const fs = require('node:fs');
const { chat } = require('./services/ModelRegistry');
const { buildIndex } = require('../.claude/bin/lib/bm25-engine');
const {
  cargarCorpus,
  aplicarContextualRetrieval,
  medirRecall,
} = require('../.claude/bin/lib/contextual-retrieval-benchmark');

const SKILLS_DIR = path.join(__dirname, '..', '.claude', 'skills');
const MODEL = 'claude-haiku-4-5-20251001';

function construirPromptPrefijos(fullDoc, fragmentosDelSkill) {
  const lista = fragmentosDelSkill
    .map((f, i) => `[${i}] """${f.text.slice(0, 300)}"""`)
    .join('\n\n');

  return [
    'Para cada fragmento numerado de abajo, escribe UNA frase corta (max 25 palabras) '
    + 'que ubique ese fragmento dentro del documento completo (de que tema trata, en que '
    + 'seccion esta). No repitas el contenido del fragmento, solo dale contexto de ubicacion. '
    + 'Responde SOLO con un JSON array de strings, en el mismo orden, sin explicacion adicional.\n\n'
    + lista,
  ].join('');
}

function parsearRespuestaJSON(texto) {
  const match = texto.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[0]);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

async function generarPrefijosParaSkill(skillName, fullDoc, fragmentosDelSkill) {
  const prompt = construirPromptPrefijos(fullDoc, fragmentosDelSkill);
  // ~90 tokens de salida por fragmento (frase corta + overhead de JSON), con piso de 1024.
  // Si el JSON llega truncado (no-determinismo del LLM en la longitud de cada frase),
  // se reintenta una vez con el doble de margen antes de darlo por fallido.
  const intentos = [
    Math.max(1024, fragmentosDelSkill.length * 90 + 500),
    Math.max(2048, fragmentosDelSkill.length * 180 + 1000),
  ];

  let ultimoRes = null;
  for (const maxTokens of intentos) {
    const res = await chat('anthropic', [{ role: 'user', content: prompt }], {
      model: MODEL,
      max_tokens: maxTokens,
      system: fullDoc,
    });
    ultimoRes = res;
    const prefijos = parsearRespuestaJSON(res.content);
    if (prefijos && prefijos.length === fragmentosDelSkill.length) {
      return { prefijos, usage: res.usage, fallo: false };
    }
  }
  return { prefijos: fragmentosDelSkill.map(() => ''), usage: ultimoRes.usage, fallo: true };
}

async function main() {
  const frags = cargarCorpus(SKILLS_DIR);
  const porSkill = new Map();
  for (const f of frags) {
    if (!porSkill.has(f.source)) porSkill.set(f.source, []);
    porSkill.get(f.source).push(f);
  }

  const prefijoPorId = new Map();
  let totalInput = 0;
  let totalOutput = 0;
  let fallos = 0;
  let i = 0;

  for (const [skillName, fragmentosDelSkill] of porSkill) {
    i += 1;
    const archivo = path.join(SKILLS_DIR, skillName, 'SKILL.md');
    const fullDoc = fs.readFileSync(archivo, 'utf8');

    process.stdout.write(`[${i}/${porSkill.size}] ${skillName} (${fragmentosDelSkill.length} fragmentos)... `);
    try {
      const { prefijos, usage, fallo } = await generarPrefijosParaSkill(skillName, fullDoc, fragmentosDelSkill);
      fragmentosDelSkill.forEach((f, idx) => prefijoPorId.set(f.id, prefijos[idx] || ''));
      totalInput += usage.input_tokens;
      totalOutput += usage.output_tokens;
      if (fallo) fallos += 1;
      console.log(fallo ? 'FALLO (parseo), prefijos vacios' : `ok (in:${usage.input_tokens} out:${usage.output_tokens})`);
    } catch (err) {
      fallos += 1;
      fragmentosDelSkill.forEach(f => prefijoPorId.set(f.id, ''));
      console.log(`ERROR: ${err.message}`);
    }
  }

  console.log('');
  console.log(`Prefijos generados. Fallos: ${fallos}/${porSkill.size}. Tokens: in=${totalInput} out=${totalOutput}`);

  const fragsConContexto = aplicarContextualRetrieval(frags, f => prefijoPorId.get(f.id) || '');
  const indexConContexto = buildIndex(fragsConContexto);
  const resultadoConContexto = medirRecall(indexConContexto, 5);

  const indexBaseline = buildIndex(frags);
  const resultadoBaseline = medirRecall(indexBaseline, 5);

  console.log('');
  console.log(`recall@5 SIN contextual retrieval (baseline): ${(resultadoBaseline.recallAtK * 100).toFixed(1)}%`);
  console.log(`recall@5 CON contextual retrieval:            ${(resultadoConContexto.recallAtK * 100).toFixed(1)}%`);
  console.log('');
  console.log('Detalle por query:');
  resultadoConContexto.detalle.forEach((d, idx) => {
    const base = resultadoBaseline.detalle[idx];
    const cambio = base.acierto === d.acierto ? '=' : (d.acierto ? '+' : '-');
    console.log(`  [${cambio}] ${d.query} => esperado:${d.esperado} | baseline:${base.acierto ? 'OK' : 'FAIL'} contextual:${d.acierto ? 'OK' : 'FAIL'}`);
  });

  const outPath = path.join(__dirname, '..', '.claude', 'CONTEXTUAL_RETRIEVAL_BENCHMARK_RESULT.json');
  fs.writeFileSync(outPath, JSON.stringify({
    fecha: new Date().toISOString().slice(0, 10),
    modelo: MODEL,
    fragmentos_totales: frags.length,
    skills_totales: porSkill.size,
    fallos_generacion_prefijo: fallos,
    tokens: { input: totalInput, output: totalOutput },
    recall_baseline: resultadoBaseline.recallAtK,
    recall_contextual: resultadoConContexto.recallAtK,
    detalle_baseline: resultadoBaseline.detalle,
    detalle_contextual: resultadoConContexto.detalle,
  }, null, 2));
  console.log('');
  console.log(`Resultado guardado en ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
