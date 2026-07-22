'use strict';

/**
 * SubagentGrader — Grader generico de calidad post-subagente ("Performance
 * Outcomes" del Claude Agent SDK: un juez separado evalua el trabajo del
 * subagente contra una rubrica antes de aceptarlo, en vez de solo limitar
 * cuantos corren en paralelo).
 *
 * Diferenciado de CrossVerifier.js (verificacion de diffs de codigo, solo
 * para code-reviewer) y subagent-review.js (analisis de patrones via regex).
 * Este grader evalua CUALQUIER subagente por calidad general del output
 * (completitud, coherencia, riesgos no mencionados) via LLM-as-judge, sin
 * requerir la tarea original con la que se lanzo (no confirmado si
 * SubagentStop la expone) -- limitacion de alcance deliberada, documentada.
 *
 * No crea cliente HTTP propio: reutiliza ModelRegistry.chat().
 */

const { chat, listProviders, parsearJSONFailClosed } = require('./ModelRegistry');

// Mismo orden de preferencia que CrossVerifier: mas barato primero.
const PROVEEDORES_JUEZ = Object.freeze(['deepseek', 'openai', 'gemini']);

const RUBRICA_DEFECTO = [
  'Completitud: el output aborda la tarea de punta a punta, sin dejar pasos a medias ni placeholders.',
  'Coherencia: las afirmaciones no se contradicen entre si dentro del propio output.',
  'Riesgos no mencionados: el output no omite advertencias obvias sobre limitaciones, supuestos no verificados o efectos secundarios.',
  'Verificabilidad: las afirmaciones concretas (rutas, comandos, resultados) son consistentes con lo que un output honesto reportaria, no genericas o evasivas.',
].join('\n');

const PROMPT_SISTEMA = [
  'Eres un juez de calidad independiente de un subagente de IA. Solo recibes el',
  'output final del subagente y su tipo declarado -- no conoces el razonamiento',
  'interno ni el prompt exacto con que se le invoco.',
  '',
  'Evalua el output contra esta rubrica:',
  RUBRICA_DEFECTO,
  '',
  'Responde EXCLUSIVAMENTE con un objeto JSON valido, sin texto adicional:',
  '{"score": 0-100, "motivo": "explicacion breve del score", "riesgos": ["riesgo1", "riesgo2"]}',
].join('\n');

// Umbral de lineas: output muy corto no amerita gastar tokens en un juez
// (mismo criterio de proporcionalidad que subagent-review.js).
const OUTPUT_THRESHOLD_LINES = 15;

/**
 * Parsea el grado JSON del juez. Si el output no es JSON valido, falla
 * cerrado (score 0) en vez de asumir que el trabajo esta bien.
 *
 * @param {string} texto - contenido crudo de la respuesta del modelo
 * @returns {{score: number, motivo: string, riesgos: string[]}}
 */
function parsearGrado(texto) {
  const json = parsearJSONFailClosed(texto);
  if (!json || typeof json.score !== 'number') {
    return {
      score: 0,
      motivo: 'Veredicto del juez no parseable — falla cerrado',
      riesgos: ['no se pudo evaluar el output automaticamente'],
    };
  }
  return {
    score: Math.max(0, Math.min(100, Math.round(json.score))),
    motivo: typeof json.motivo === 'string' ? json.motivo : '',
    riesgos: Array.isArray(json.riesgos) ? json.riesgos : [],
  };
}

/**
 * Selecciona el primer proveedor disponible de la lista de jueces validos.
 * A diferencia de CrossVerifier, no excluye por proveedor actor -- el
 * subagente puede haber usado cualquier modelo interno, lo relevante aqui
 * es abaratar el costo del juez, no diversificar respecto al actor.
 *
 * @param {Array<{provider: string, available: boolean}>} disponibles
 * @returns {string|null}
 */
function seleccionarJuez(disponibles) {
  const candidato = PROVEEDORES_JUEZ
    .map(nombre => disponibles.find(p => p.provider === nombre))
    .find(p => p && p.available);
  return candidato ? candidato.provider : null;
}

/**
 * Califica el output de un subagente contra la rubrica de calidad general.
 *
 * @param {Object} params
 * @param {string} params.output - texto final del subagente (last_assistant_message)
 * @param {string} params.agentType - tipo de subagente declarado
 * @param {Array}  [params.disponibles] - override de listProviders(), para tests
 * @returns {Promise<{score: number, motivo: string, riesgos: string[], proveedor: string|null}>}
 */
async function calificar({ output, agentType, disponibles }) {
  const lineas = (output || '').split('\n').length;
  if (!output || !output.trim() || lineas < OUTPUT_THRESHOLD_LINES) {
    return { score: 0, motivo: 'output trivial — sin evaluar', riesgos: [], proveedor: null };
  }

  const listaDisponibles = disponibles || listProviders();
  const proveedor = seleccionarJuez(listaDisponibles);

  if (!proveedor) {
    return { score: 0, motivo: 'sin proveedor juez disponible', riesgos: [], proveedor: null };
  }

  const mensajes = [
    { role: 'user', content: `TIPO DE SUBAGENTE: ${agentType || 'unknown'}\n\nOUTPUT A EVALUAR:\n${output}` },
  ];

  const respuesta = await chat(proveedor, mensajes, {
    system: PROMPT_SISTEMA,
    max_tokens: 512,
    forzarJSON: true,
  });

  const grado = parsearGrado(respuesta.content);
  return { ...grado, proveedor };
}

module.exports = { calificar, parsearGrado, seleccionarJuez, RUBRICA_DEFECTO, PROVEEDORES_JUEZ };
