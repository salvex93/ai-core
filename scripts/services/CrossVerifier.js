'use strict';

/**
 * CrossVerifier — Verificacion ciega de un diff con proveedor de IA distinto al actor.
 *
 * Patron "Writer/Reviewer" (Anthropic): el verificador NUNCA recibe el razonamiento
 * de quien genero el cambio, solo el diff y la tarea original. Usar el mismo modelo
 * que genero el cambio para verificarlo detecta pocos errores (self-consistentes) —
 * se fuerza un proveedor distinto en cada llamada.
 *
 * No crea cliente HTTP propio: reutiliza ModelRegistry.chat().
 */

const { chat, parsearJSONFailClosed } = require('./ModelRegistry');

// Proveedores validos como verificador, en orden de preferencia (mas barato primero)
const PROVEEDORES_VERIFICADOR = Object.freeze(['deepseek', 'openai', 'gemini']);

const PROMPT_SISTEMA = [
  'Eres un revisor de codigo independiente. Solo recibes el diff y la tarea original.',
  'No conoces el razonamiento de quien hizo el cambio.',
  'Responde EXCLUSIVAMENTE con un objeto JSON valido, sin texto adicional, con esta forma:',
  '{"pass": boolean, "hallazgos": [{"severidad": "critica|alta|media|baja", "descripcion": "..."}]}',
  'Marca pass=false si el diff no cumple la tarea O si rompe funcionalidad fuera de su alcance.',
].join('\n');

/**
 * Selecciona el primer proveedor disponible distinto al proveedor del actor.
 *
 * @param {string} proveedorActor - proveedor que genero el cambio (ej. 'anthropic')
 * @param {Array<{provider: string, available: boolean}>} disponibles - de listProviders()
 * @returns {string} nombre del proveedor a usar como verificador
 */
function seleccionarVerificador(proveedorActor, disponibles) {
  const candidato = PROVEEDORES_VERIFICADOR
    .map(nombre => disponibles.find(p => p.provider === nombre))
    .find(p => p && p.available && p.provider !== proveedorActor);

  if (!candidato) {
    throw new Error(
      `Sin proveedor verificador disponible distinto de "${proveedorActor}". ` +
      'Configura OPENAI_API_KEY o DEEPSEEK_API_KEY en .env.'
    );
  }
  return candidato.provider;
}

/**
 * Verifica un diff contra la tarea original usando un proveedor distinto al actor.
 *
 * @param {Object} params
 * @param {string} params.diff - diff del cambio (git diff)
 * @param {string} params.tarea - descripcion de la tarea/requisitos originales
 * @param {string} [params.proveedorActor='anthropic'] - proveedor que genero el cambio
 * @param {Array}  [params.disponibles] - override de listProviders(), para tests
 * @returns {Promise<{pass: boolean, hallazgos: Array, proveedor: string}>}
 */
async function verificar({ diff, tarea, proveedorActor = 'anthropic', disponibles }) {
  if (!diff || !diff.trim()) {
    return { pass: true, hallazgos: [], proveedor: null };
  }

  const { listProviders } = require('./ModelRegistry');
  const listaDisponibles = disponibles || listProviders();
  const proveedor = seleccionarVerificador(proveedorActor, listaDisponibles);

  const mensajes = [
    { role: 'user', content: `TAREA ORIGINAL:\n${tarea}\n\nDIFF A VERIFICAR:\n${diff}` },
  ];

  const respuesta = await chat(proveedor, mensajes, {
    system: PROMPT_SISTEMA,
    max_tokens: 1024,
    // Mismo fix que SubagentGrader.js: OpenAI ignora instrucciones de texto
    // plano pidiendo JSON -- forzarJSON activa response_format:json_object
    // solo en proveedores que lo soportan confirmadamente (ver
    // OpenAICompatAdapter.js PROVIDER_CONFIGS.soportaJSONMode).
    forzarJSON: true,
  });

  const veredicto = parsearVeredicto(respuesta.content);
  return { ...veredicto, proveedor };
}

/**
 * Parsea el veredicto JSON del verificador. Si el output no es JSON valido,
 * falla cerrado (pass=false) en vez de asumir que todo esta bien.
 *
 * @param {string} texto - contenido crudo de la respuesta del modelo
 * @returns {{pass: boolean, hallazgos: Array}}
 */
function parsearVeredicto(texto) {
  const json = parsearJSONFailClosed(texto);
  if (!json) {
    return {
      pass: false,
      hallazgos: [{ severidad: 'alta', descripcion: 'Veredicto del verificador no parseable — falla cerrado' }],
    };
  }
  return {
    pass: json.pass === true,
    hallazgos: Array.isArray(json.hallazgos) ? json.hallazgos : [],
  };
}

module.exports = { verificar, seleccionarVerificador, parsearVeredicto, PROVEEDORES_VERIFICADOR };
