'use strict';

/**
 * ModelRouter — Enrutador de modelos por complejidad de tarea.
 *
 * Principios aplicados:
 *   SRP: unica responsabilidad — mapear tarea a modelo.
 *   OCP: agregar un tier nuevo no requiere modificar la logica de routing.
 *   DIP: los consumidores dependen de la interfaz route(), no del modelo concreto.
 */

// Catalogo de modelos disponibles (abril 2026)
const MODELOS = Object.freeze({
  HAIKU:  'claude-haiku-4-5-20251001',  // $0.80/$4 por MTok — validaciones, parseo
  SONNET: 'claude-sonnet-4-6',          // $3/$15 por MTok  — analisis, busqueda
  OPUS:   'claude-opus-4-7',            // $15/$75 por MTok — refactorizacion compleja
});

// Costos en USD por 1M tokens (input / output)
const COSTO_POR_MODELO = Object.freeze({
  [MODELOS.HAIKU]:  { input: 0.80,  output: 4.00  },
  [MODELOS.SONNET]: { input: 3.00,  output: 15.00 },
  [MODELOS.OPUS]:   { input: 15.00, output: 75.00 },
});

// Herramientas MCP → tier de modelo
// Haiku: parseo estructurado, bajo costo, sin razonamiento profundo
const TIER_HAIKU = new Set([
  'resumir_backlog',
  'analizar_contenido',
]);

// Sonnet: analisis de archivos, busqueda web — balance costo/rendimiento
const TIER_SONNET = new Set([
  'analizar_archivo',
  'analizar_repositorio',
  'buscar_web',
]);

// Opus: refactorizacion de arquitectura compleja — uso excepcional
const TIER_OPUS = new Set([
  'refactorizar_arquitectura',
  'disenar_sistema',
  'auditar_seguridad_critica',
]);

// Umbral de tokens para escalar Haiku→Sonnet por tamano de contexto
const UMBRAL_ESCALADO_SONNET = 12_000;
// Umbral para escalar Sonnet→Opus por complejidad de contexto
const UMBRAL_ESCALADO_OPUS   = 60_000;

/**
 * Retorna el modelo adecuado para una herramienta y tamano de contexto dados.
 *
 * @param {string} nombreHerramienta - nombre de la tool MCP
 * @param {number} [tokensContexto=0] - tokens estimados del contexto actual
 * @returns {{ modelo: string, tier: string, razon: string }}
 */
function route(nombreHerramienta, tokensContexto = 0) {
  // Escalado por tamano de contexto — tiene prioridad sobre el tier base
  if (tokensContexto >= UMBRAL_ESCALADO_OPUS) {
    return {
      modelo: MODELOS.OPUS,
      tier: 'opus',
      razon: `Contexto muy grande (${tokensContexto} tokens >= ${UMBRAL_ESCALADO_OPUS}) — Opus requerido`,
    };
  }

  if (TIER_OPUS.has(nombreHerramienta)) {
    return {
      modelo: MODELOS.OPUS,
      tier: 'opus',
      razon: `Tarea de arquitectura compleja: ${nombreHerramienta}`,
    };
  }

  if (TIER_SONNET.has(nombreHerramienta)) {
    return {
      modelo: MODELOS.SONNET,
      tier: 'sonnet',
      razon: `Analisis o busqueda — balance costo/rendimiento: ${nombreHerramienta}`,
    };
  }

  if (TIER_HAIKU.has(nombreHerramienta)) {
    // Escalar a Sonnet si el contexto supera el umbral intermedio
    if (tokensContexto >= UMBRAL_ESCALADO_SONNET) {
      return {
        modelo: MODELOS.SONNET,
        tier: 'sonnet',
        razon: `Contexto grande (${tokensContexto} tokens) — escalado Haiku→Sonnet`,
      };
    }
    return {
      modelo: MODELOS.HAIKU,
      tier: 'haiku',
      razon: `Parseo/resumen de bajo costo: ${nombreHerramienta}`,
    };
  }

  // Fallback conservador: Sonnet
  return {
    modelo: MODELOS.SONNET,
    tier: 'sonnet',
    razon: `Herramienta desconocida — fallback a Sonnet: ${nombreHerramienta}`,
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
