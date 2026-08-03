'use strict';

/**
 * ModelRouter — Enrutador de modelos por complejidad de tarea.
 *
 * Principios aplicados:
 *   SRP: unica responsabilidad — mapear tarea a modelo.
 *   OCP: agregar un tier nuevo no requiere modificar la logica de routing.
 *   DIP: los consumidores dependen de la interfaz route(), no del modelo concreto.
 */

// Catalogo de modelos disponibles (verificado 2026-08-03)
const MODELOS = Object.freeze({
  GEMINI: 'gemini-3.6-flash',           // gratis en API (cuota diaria) — lectura de archivos grandes, logs
  HAIKU:  'claude-haiku-4-5-20251001',  // $0.80/$4 por MTok — parseo simple, transformaciones
  SONNET: 'claude-sonnet-5',            // $3/$15 por MTok  — refactorizacion, analisis, busqueda (GA 2026-06-29)
  OPUS:   'claude-opus-4-8',            // $15/$75 por MTok — arquitectura con herramientas, computer use
  FABLE:  'claude-fable-5',             // ~Opus pricing — razonamiento profundo sin tools, diseno de sistemas
});

// Costos en USD por 1M tokens (input / output)
const COSTO_POR_MODELO = Object.freeze({
  [MODELOS.GEMINI]: { input: 0,     output: 0     },  // free tier
  [MODELOS.HAIKU]:  { input: 0.80,  output: 4.00  },
  [MODELOS.SONNET]: { input: 3.00,  output: 15.00 },
  [MODELOS.OPUS]:   { input: 15.00, output: 75.00 },
  [MODELOS.FABLE]:  { input: 15.00, output: 75.00 },
});

// Tier GEMINI: lectura de archivos grandes, logs, contenido extenso, busqueda web — costo cero
// Siempre preferir Gemini antes que Haiku para estas tareas
const TIER_GEMINI = new Set([
  'analizar_archivo',       // lectura de archivos > 200 lineas
  'analizar_repositorio',   // analisis global del repo
  'resumir_backlog',        // resumen de listas largas
  'analizar_contenido',     // procesamiento de texto extenso
  'buscar_web',             // busqueda web — Gemini la hace gratis, Sonnet no justificado
]);

// Tier HAIKU: transformaciones simples + prosa corta de bajo volumen, sin razonamiento profundo
const TIER_HAIKU = new Set([
  'reparar_error',          // fix puntual de un error conocido
  'parsear_schema',         // transformacion estructurada simple
  'responder_pregunta',     // respuesta conversacional corta (< 2k tokens output)
  'explicar_concepto',      // explicacion tecnica concisa sin diseño de sistema
  'generar_haiku',          // prosa corta de proposito general — tier intermedio antes de Sonnet
]);

// Tier SONNET: refactorizacion, analisis de calidad — uso normal
const TIER_SONNET = new Set([
  'refactorizar_archivo',   // refactor de un archivo concreto
  'diagnosticar_error',     // diagnostico de errores complejos
  'auditar_calidad',        // revision de codigo
]);

// Tier FABLE: razonamiento profundo sin herramientas integradas — diseno puro
const TIER_FABLE = new Set([
  'disenar_sistema',            // nuevo sistema desde cero (razonamiento, sin computer use)
  'refactorizar_arquitectura',  // reestructuracion de multiples modulos
]);

// Tier OPUS: arquitectura critica con herramientas integradas o computer use
const TIER_OPUS = new Set([
  'auditar_seguridad_critica',  // auditoria de seguridad profunda
]);

// Tier VERIFICADOR: revision ciega de un diff con proveedor distinto al actor
// (ver scripts/services/CrossVerifier.js). No selecciona modelo Anthropic —
// selecciona proveedor, resuelto por CrossVerifier.seleccionarVerificador().
const TIER_VERIFICADOR = new Set([
  'verificar_diff',  // revision cross-model de un cambio ya generado
]);

// Umbral de tokens para recomendar Gemini Bridge en lugar de Haiku
const UMBRAL_RECOMENDAR_GEMINI = 8_000;
// Umbral de tokens para escalar Haiku→Sonnet por tamano de contexto
const UMBRAL_ESCALADO_SONNET = 12_000;
// Umbral para escalar Sonnet→Opus por complejidad de contexto
const UMBRAL_ESCALADO_OPUS   = 60_000;

// Proveedores no-Anthropic que pueden absorber una tarea delegable de tier
// Haiku para ahorrar cuota de Claude. Claude es la unica constante del
// arnes (siempre disponible) -- estos son variables segun que API keys
// tenga configuradas cada usuario en su .env. Orden de preferencia: Gemini
// (gratis) primero, luego los proveedores pagados. Ninguno excluye a otro
// -- listProviders() ya marca available:false si falta la key, degradando
// con gracia al proveedor siguiente o a Haiku si no hay ninguno configurado.
const PROVEEDORES_DELEGABLES = Object.freeze(['gemini', 'openai', 'deepseek', 'kimi']);

/**
 * Determina si hay un proveedor no-Anthropic disponible para absorber una
 * tarea delegable, en el orden de preferencia definido (gratis antes que
 * pagado). Retorna null si ninguno esta disponible (fallback a Haiku).
 *
 * @param {Array<{provider: string, available: boolean}>} disponibles
 * @returns {string|null}
 */
function seleccionarProveedorDelegable(disponibles) {
  if (!Array.isArray(disponibles)) return null;
  const candidato = PROVEEDORES_DELEGABLES
    .map(nombre => disponibles.find(p => p.provider === nombre))
    .find(p => p && p.available);
  return candidato ? candidato.provider : null;
}

/**
 * Retorna el modelo adecuado para una herramienta y tamano de contexto dados.
 *
 * Jerarquia de costo (menor a mayor):
 *   Gemini (free) → OpenAI (pagado, si Gemini no aplica) → Haiku → Sonnet → Opus
 *
 * Regla de oro: usar el modelo mas barato que pueda completar la tarea.
 * Gemini siempre tiene preferencia para lecturas y resumenes extensos.
 * Claude es la unica constante del arnes -- Gemini/OpenAI son variables
 * segun configuracion de cada usuario, degradando con gracia a Haiku si
 * ninguno esta disponible (opciones.disponibles === undefined o vacio).
 *
 * @param {string} nombreHerramienta - nombre de la tool MCP
 * @param {number} [tokensContexto=0] - tokens estimados del contexto actual
 * @param {Object} [opciones={}]
 * @param {Array}  [opciones.disponibles] - override de listProviders(), habilita
 *   el ahorro de cuota Claude para tareas delegables. Sin este parametro,
 *   route() se comporta identico a antes de esta extension.
 * @returns {{ modelo: string, tier: string, razon: string, proveedor?: string }}
 */
function route(nombreHerramienta, tokensContexto = 0, opciones = {}) {
  const { disponibles } = opciones;
  // Verificador cross-model: no aplica jerarquia de costo Anthropic — se resuelve
  // por proveedor distinto al actor en CrossVerifier.js, no por este router.
  if (TIER_VERIFICADOR.has(nombreHerramienta)) {
    return {
      modelo: null,
      tier: 'verificador',
      razon: `Verificacion cross-model: ${nombreHerramienta} — resuelto por CrossVerifier.seleccionarVerificador()`,
    };
  }

  // Fable 5 para razonamiento profundo sin tools (diseno puro, arquitectura)
  if (TIER_FABLE.has(nombreHerramienta) && tokensContexto < UMBRAL_ESCALADO_OPUS) {
    return {
      modelo: MODELOS.FABLE,
      tier: 'fable',
      razon: `Razonamiento arquitectonico: ${nombreHerramienta}`,
    };
  }

  // Opus para tareas criticas con herramientas integradas o computer use
  if (TIER_OPUS.has(nombreHerramienta) && tokensContexto < UMBRAL_ESCALADO_OPUS) {
    return {
      modelo: MODELOS.OPUS,
      tier: 'opus',
      razon: `Arquitectura critica: ${nombreHerramienta}`,
    };
  }

  // Escalado forzado a Sonnet si el contexto supera el umbral de Opus
  // (evita llamadas Opus con contextos gigantes)
  if (tokensContexto >= UMBRAL_ESCALADO_OPUS) {
    return {
      modelo: MODELOS.SONNET,
      tier: 'sonnet',
      razon: `Contexto muy grande (${tokensContexto} tokens) — Sonnet para controlar costo`,
    };
  }

  if (TIER_SONNET.has(nombreHerramienta)) {
    if (tokensContexto >= UMBRAL_ESCALADO_SONNET) {
      return {
        modelo: MODELOS.SONNET,
        tier: 'sonnet',
        razon: `Contexto grande (${tokensContexto} tokens) — Sonnet confirmado`,
      };
    }
    return {
      modelo: MODELOS.SONNET,
      tier: 'sonnet',
      razon: `Analisis o busqueda: ${nombreHerramienta}`,
    };
  }

  // Gemini primero para tareas de lectura/resumen — costo cero
  if (TIER_GEMINI.has(nombreHerramienta)) {
    return {
      modelo: MODELOS.GEMINI,
      tier: 'gemini',
      razon: `Lectura/resumen extenso — Gemini free tier: ${nombreHerramienta}`,
    };
  }

  if (TIER_HAIKU.has(nombreHerramienta)) {
    if (tokensContexto >= UMBRAL_ESCALADO_SONNET) {
      return {
        modelo: MODELOS.SONNET,
        tier: 'sonnet',
        razon: `Contexto grande (${tokensContexto} tokens) — escalado Haiku→Sonnet`,
      };
    }
    // Si el contexto supera el umbral de recomendacion, sugerir Gemini
    if (tokensContexto >= UMBRAL_RECOMENDAR_GEMINI) {
      return {
        modelo: MODELOS.GEMINI,
        tier: 'gemini',
        razon: `Contexto medio-alto (${tokensContexto} tokens) — Gemini free antes que Haiku`,
      };
    }
    // Ahorro de cuota Claude: si el usuario tiene algun proveedor delegable
    // configurado (opciones.disponibles), una tarea delegable simple no
    // necesita gastar cuota de Anthropic en Haiku. Orden: Gemini (gratis)
    // primero, luego OpenAI/DeepSeek/Kimi (pagados) en el orden de
    // PROVEEDORES_DELEGABLES. Sin este parametro, cae directo a Haiku
    // (comportamiento identico al de antes de esta extension).
    const proveedorDelegable = seleccionarProveedorDelegable(disponibles);
    if (proveedorDelegable === 'gemini') {
      return {
        modelo: MODELOS.GEMINI,
        tier: 'gemini',
        proveedor: 'gemini',
        razon: `Transformacion simple, Gemini disponible (gratis) — ahorra cuota de Claude: ${nombreHerramienta}`,
      };
    }
    if (proveedorDelegable) {
      return {
        modelo: null,
        tier: proveedorDelegable,
        proveedor: proveedorDelegable,
        razon: `Transformacion simple, sin Gemini pero con ${proveedorDelegable} disponible — ahorra cuota de Claude: ${nombreHerramienta}`,
      };
    }
    return {
      modelo: MODELOS.HAIKU,
      tier: 'haiku',
      razon: `Transformacion simple de bajo volumen: ${nombreHerramienta}`,
    };
  }

  // Fallback: Haiku (nunca Sonnet/Opus por defecto — si la tarea no esta clasificada, es simple)
  if (tokensContexto >= UMBRAL_ESCALADO_SONNET) {
    return {
      modelo: MODELOS.SONNET,
      tier: 'sonnet',
      razon: `Herramienta no clasificada con contexto grande (${tokensContexto} tokens) — escalado a Sonnet`,
    };
  }
  return {
    modelo: MODELOS.HAIKU,
    tier: 'haiku',
    razon: `Herramienta no clasificada — fallback conservador a Haiku: ${nombreHerramienta}`,
  };
}

/**
 * Estima el costo en USD de una llamada dado el modelo y el conteo de tokens.
 *
 * @param {string} modelo - identificador del modelo
 * @param {number} tokensInput
 * @param {number} tokensOutput
 * @param {number} [tokensCacheHit=0] - tokens servidos desde cache (90% descuento en input)
 * @returns {{ costoUSD: number, desglose: object }}
 */
function estimarCosto(modelo, tokensInput, tokensOutput, tokensCacheHit = 0) {
  const tarifas = COSTO_POR_MODELO[modelo];
  if (!tarifas) return { costoUSD: 0, desglose: { error: 'modelo desconocido' } };

  const inputFacturado   = Math.max(0, tokensInput - tokensCacheHit);
  const costoCacheHit    = (tokensCacheHit / 1_000_000) * tarifas.input * 0.10; // 10% del precio normal
  const costoInput       = (inputFacturado  / 1_000_000) * tarifas.input;
  const costoOutput      = (tokensOutput   / 1_000_000) * tarifas.output;
  const costoUSD         = costoInput + costoOutput + costoCacheHit;

  return {
    costoUSD: parseFloat(costoUSD.toFixed(6)),
    desglose: {
      tokens_input_facturado: inputFacturado,
      tokens_cache_hit:       tokensCacheHit,
      tokens_output:          tokensOutput,
      costo_input_usd:        parseFloat(costoInput.toFixed(6)),
      costo_cache_hit_usd:    parseFloat(costoCacheHit.toFixed(6)),
      costo_output_usd:       parseFloat(costoOutput.toFixed(6)),
    },
  };
}

module.exports = { route, estimarCosto, seleccionarProveedorDelegable, MODELOS, COSTO_POR_MODELO, TIER_VERIFICADOR, PROVEEDORES_DELEGABLES };
