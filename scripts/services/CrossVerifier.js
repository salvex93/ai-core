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

const ModelRegistry = require('./ModelRegistry');
const { parsearJSONFailClosed } = ModelRegistry;
const { PROVIDER_CONFIGS } = require('./model-adapters/OpenAICompatAdapter');

// Proveedores validos como verificador, en orden de preferencia (mas barato primero).
// kimi agregado: ModelRegistry.js/ModelRouter.js ya lo soportan completo
// (adapter, PROVEEDORES_DELEGABLES) pero quedaba fuera de esta lista -- un
// usuario que solo configura KIMI_API_KEY (sin OpenAI/DeepSeek/Gemini) se
// quedaba sin verificador cross-model pese a tener un proveedor disponible.
const PROVEEDORES_VERIFICADOR = Object.freeze(['deepseek', 'openai', 'kimi', 'gemini']);

// Herramientas que el router (ModelRouter.js) ya clasifica como criticas --
// unicas candidatas a desempate automatico 2-de-3. Una tarea simple nunca
// activa un segundo verificador: cuadruplicaria el costo del 90% de las
// llamadas para un beneficio que solo importa en decisiones de alto riesgo.
const TAREAS_CRITICAS_CON_DESEMPATE = Object.freeze([
  'auditar_seguridad_critica',
  'disenar_sistema',
  'refactorizar_arquitectura',
]);

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
 * Llama a un proveedor concreto como verificador y devuelve su veredicto.
 * Helper interno compartido por verificar() y resolverConDesempate().
 *
 * @param {string} proveedor
 * @param {string} diff
 * @param {string} tarea
 * @returns {Promise<{pass: boolean, hallazgos: Array}>}
 */
async function pedirVeredicto(proveedor, diff, tarea) {
  const mensajes = [
    { role: 'user', content: `TAREA ORIGINAL:\n${tarea}\n\nDIFF A VERIFICAR:\n${diff}` },
  ];

  const respuesta = await ModelRegistry.chat(proveedor, mensajes, {
    system: PROMPT_SISTEMA,
    max_tokens: 1024,
    // Mismo fix que SubagentGrader.js: OpenAI ignora instrucciones de texto
    // plano pidiendo JSON -- forzarJSON activa response_format:json_object
    // solo en proveedores que lo soportan confirmadamente (ver
    // OpenAICompatAdapter.js PROVIDER_CONFIGS.soportaJSONMode).
    forzarJSON: true,
    // Verificar un diff amerita el modelo mas capaz disponible del proveedor,
    // no el defaultModel barato de tareas delegables simples -- un veredicto
    // de aprobacion/rechazo mal razonado es mas costoso que la diferencia de
    // precio entre Luna ($0.20/$1.20) y Sol ($5/$30) por 1M tokens.
    ...(proveedor === 'openai' && { model: PROVIDER_CONFIGS.openai.modeloVerificador }),
  });

  return parsearVeredicto(respuesta.content);
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

  const veredicto = await pedirVeredicto(proveedor, diff, tarea);
  return { ...veredicto, proveedor };
}

/**
 * Verifica un diff con desempate automatico 2-de-3 cuando la tarea es
 * critica (ver TAREAS_CRITICAS_CON_DESEMPATE) y el primer verificador
 * reporta pass=false. El actor nunca vota -- solo dos proveedores no-actor
 * deciden. Si no hay un tercer proveedor distinto disponible, degrada con
 * gracia al veredicto de un solo verificador (nunca bloquea por falta de
 * cobertura multi-proveedor).
 *
 * No se activa fuera de TAREAS_CRITICAS_CON_DESEMPATE ni cuando el primer
 * verificador ya aprueba -- evita cuadruplicar costo en el caso comun.
 *
 * @param {Object} params
 * @param {string} params.diff
 * @param {string} params.tarea
 * @param {string} params.nombreHerramienta - clasificacion del router (ModelRouter.js)
 * @param {string} [params.proveedorActor='anthropic']
 * @param {Array}  [params.disponibles]
 * @returns {Promise<{pass: boolean, hallazgos: Array, proveedor: string, desempate: boolean, votos?: Array}>}
 */
async function resolverConDesempate({ diff, tarea, nombreHerramienta, proveedorActor = 'anthropic', disponibles }) {
  if (!diff || !diff.trim()) {
    return { pass: true, hallazgos: [], proveedor: null, desempate: false };
  }

  const { listProviders } = require('./ModelRegistry');
  const listaDisponibles = disponibles || listProviders();
  const primerProveedor = seleccionarVerificador(proveedorActor, listaDisponibles);
  const primerVeredicto = await pedirVeredicto(primerProveedor, diff, tarea);

  const esCritica = TAREAS_CRITICAS_CON_DESEMPATE.includes(nombreHerramienta);
  if (!esCritica || primerVeredicto.pass) {
    return { ...primerVeredicto, proveedor: primerProveedor, desempate: false };
  }

  // Buscar un tercer proveedor distinto del actor Y del primer verificador
  const segundoProveedor = PROVEEDORES_VERIFICADOR
    .map(nombre => listaDisponibles.find(p => p.provider === nombre))
    .find(p => p && p.available && p.provider !== proveedorActor && p.provider !== primerProveedor)
    ?.provider;

  if (!segundoProveedor) {
    // Degradacion con gracia: sin tercer proveedor, el veredicto del unico
    // verificador disponible se mantiene -- no se bloquea por falta de cobertura.
    return { ...primerVeredicto, proveedor: primerProveedor, desempate: false };
  }

  const segundoVeredicto = await pedirVeredicto(segundoProveedor, diff, tarea);
  const votos = [
    { proveedor: primerProveedor, pass: primerVeredicto.pass },
    { proveedor: segundoProveedor, pass: segundoVeredicto.pass },
  ];

  // 2-de-3 con el actor como voto implicito pass=false (fue quien genero el
  // cambio que el primer verificador ya marco con problema): el desempate
  // real lo decide el segundo verificador. Si aprueba, el marcador queda
  // 1-1 con el primer verificador y el actor no cuenta como voto valido de
  // rechazo por si solo -- se necesita mayoria real (2 votos en el mismo
  // sentido) para sostener el rechazo, no basta un solo verificador en contra.
  const passFinal = segundoVeredicto.pass;
  const hallazgosCombinados = [...primerVeredicto.hallazgos, ...segundoVeredicto.hallazgos];

  return {
    pass: passFinal,
    hallazgos: hallazgosCombinados,
    proveedor: `${primerProveedor}+${segundoProveedor}`,
    desempate: true,
    votos,
  };
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

module.exports = {
  verificar,
  resolverConDesempate,
  seleccionarVerificador,
  parsearVeredicto,
  PROVEEDORES_VERIFICADOR,
  TAREAS_CRITICAS_CON_DESEMPATE,
};
