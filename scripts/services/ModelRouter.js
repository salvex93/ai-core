'use strict';

/**
 * ModelRouter — Enrutador de modelos por complejidad de tarea.
 *
 * Principios aplicados:
 *   SRP: unica responsabilidad — mapear tarea a modelo.
 *   OCP: agregar un tier nuevo no requiere modificar la logica de routing.
 *   DIP: los consumidores dependen de la interfaz route(), no del modelo concreto.
 */

// Catalogo de modelos disponibles (julio 2026)
const MODELOS = Object.freeze({
  GEMINI: 'gemini-2.5-flash',           // gratis (cuota diaria) — lectura de archivos grandes, logs
  HAIKU:  'claude-haiku-4-5-20251001',  // $0.80/$4 por MTok — parseo simple, transformaciones
  SONNET: 'claude-sonnet-4-6',          // $3/$15 por MTok  — refactorizacion, analisis, busqueda
  OPUS:   'claude-opus-4-8',            // $15/$75 por MTok — arquitectura critica, diseno de sistema
});

// Costos en USD por 1M tokens (input / output)
const COSTO_POR_MODELO = Object.freeze({
  [MODELOS.GEMINI]: { input: 0,     output: 0     },  // free tier
  [MODELOS.HAIKU]:  { input: 0.80,  output: 4.00  },
  [MODELOS.SONNET]: { input: 3.00,  output: 15.00 },
  [MODELOS.OPUS]:   { input: 15.00, output: 75.00 },
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

// Tier OPUS: diseno de sistemas nuevos, arquitectura critica — uso excepcional
const TIER_OPUS = new Set([
  'refactorizar_arquitectura',  // reestructuracion de multiples modulos
  'disenar_sistema',            // nuevo sistema desde cero
  'auditar_seguridad_critica',  // auditoria de seguridad profunda
]);

// Umbral de tokens para recomendar Gemini Bridge en lugar de Haiku
const UMBRAL_RECOMENDAR_GEMINI = 8_000;
// Umbral de tokens para escalar Haiku→Sonnet por tamano de contexto
const UMBRAL_ESCALADO_SONNET = 12_000;
// Umbral para escalar Sonnet→Opus por complejidad de contexto
const UMBRAL_ESCALADO_OPUS   = 60_000;

/**
 * Retorna el modelo adecuado para una herramienta y tamano de contexto dados.
 *
 * Jerarquia de costo (menor a mayor):
 *   Gemini (free) → Haiku → Sonnet → Opus
 *
 * Regla de oro: usar el modelo mas barato que pueda completar la tarea.
 * Gemini siempre tiene preferencia para lecturas y resumenes extensos.
 *
 * @param {string} nombreHerramienta - nombre de la tool MCP
 * @param {number} [tokensContexto=0] - tokens estimados del contexto actual
 * @returns {{ modelo: string, tier: string, razon: string }}
 */
function route(nombreHerramienta, tokensContexto = 0) {
  // Opus solo si la tarea lo requiere explicitamente Y el contexto no es gigante
  // (contexto gigante con Opus = factura brutal)
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

module.exports = { route, estimarCosto, MODELOS, COSTO_POR_MODELO };
