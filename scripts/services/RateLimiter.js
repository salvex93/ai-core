'use strict';

/**
 * RateLimiter — Guardián de cuota para la API de Anthropic.
 *
 * Limites configurados segun el tier actual (Abril 2026):
 *   - Requests/min por modelo: 1.000
 *   - Input tokens/min (sin cache reads): 450.000
 *   - Output tokens/min: 90.000
 *
 * Estrategia: ventana deslizante de 60s. Si una llamada excederia el limite,
 * lanza RateLimitError con el tiempo estimado de espera para que el caller
 * decida si esperar o abortar.
 *
 * Nota: los limites se aplican POR PROCESO. Si hay multiples instancias del
 * servidor MCP corriendo en paralelo, cada una tiene su propio contador.
 */

class RateLimitError extends Error {
  constructor(recurso, actual, limite, esperarMs) {
    super(`Rate limit alcanzado: ${recurso} (${actual}/${limite} por minuto). Esperar ${Math.ceil(esperarMs / 1000)}s.`);
    this.name = 'RateLimitError';
    this.recurso   = recurso;
    this.actual    = actual;
    this.limite    = limite;
    this.esperarMs = esperarMs;
  }
}

// Limites reales del tier activo (Abril 2026)
const LIMITES = Object.freeze({
  requests_por_minuto:      50,
  input_tokens_por_minuto:  50_000,
  output_tokens_por_minuto: 50_000,
  // Presupuesto conservador: 80% del limite para dejar margen de seguridad
  factor_seguridad: 0.80,
});

const VENTANA_MS = 60_000; // 1 minuto

// Estado en memoria — se reinicia al reiniciar el proceso
const _estado = {
  requests:     [],  // timestamps de cada request
  tokensInput:  [],  // { ts, tokens } de cada llamada
  tokensOutput: [],  // { ts, tokens } de cada llamada
};

function _limpiarVentana(ahora) {
  const limite = ahora - VENTANA_MS;
  _estado.requests     = _estado.requests.filter(ts => ts > limite);
  _estado.tokensInput  = _estado.tokensInput.filter(e => e.ts > limite);
  _estado.tokensOutput = _estado.tokensOutput.filter(e => e.ts > limite);
}

function _sumar(lista) {
  return lista.reduce((acc, e) => acc + (typeof e === 'number' ? e : e.tokens), 0);
}

function _tiempoHastaLiberar(lista, ahora) {
  if (lista.length === 0) return 0;
  const masAntiguo = typeof lista[0] === 'number' ? lista[0] : lista[0].ts;
  return Math.max(0, masAntiguo + VENTANA_MS - ahora);
}

/**
 * Verifica si una llamada puede ejecutarse dentro de los limites.
 * Lanza RateLimitError si alguno de los recursos esta saturado.
 *
 * @param {{ tokensInput?: number, tokensOutput?: number }} estimacion
 */
function verificar(estimacion = {}) {
  const ahora         = Date.now();
  const tokensInput   = estimacion.tokensInput  || 0;
  const tokensOutput  = estimacion.tokensOutput || 0;
  const limiteSeguro  = (v) => Math.floor(v * LIMITES.factor_seguridad);

  _limpiarVentana(ahora);

  // Verificar requests
  const reqActuales = _estado.requests.length;
  if (reqActuales >= limiteSeguro(LIMITES.requests_por_minuto)) {
    throw new RateLimitError(
      'requests/min',
      reqActuales,
      limiteSeguro(LIMITES.requests_por_minuto),
      _tiempoHastaLiberar(_estado.requests, ahora),
    );
  }

  // Verificar input tokens
  if (tokensInput > 0) {
    const inputActual = _sumar(_estado.tokensInput);
    if (inputActual + tokensInput > limiteSeguro(LIMITES.input_tokens_por_minuto)) {
      throw new RateLimitError(
        'input_tokens/min',
        inputActual,
        limiteSeguro(LIMITES.input_tokens_por_minuto),
        _tiempoHastaLiberar(_estado.tokensInput, ahora),
      );
    }
  }

  // Verificar output tokens (estimado)
  if (tokensOutput > 0) {
    const outputActual = _sumar(_estado.tokensOutput);
    if (outputActual + tokensOutput > limiteSeguro(LIMITES.output_tokens_por_minuto)) {
      throw new RateLimitError(
        'output_tokens/min',
        outputActual,
        limiteSeguro(LIMITES.output_tokens_por_minuto),
        _tiempoHastaLiberar(_estado.tokensOutput, ahora),
      );
    }
  }
}

/**
 * Registra una llamada completada con su uso real de tokens.
 *
 * @param {{ input_tokens: number, output_tokens: number }} uso - de response.usage
 */
function registrar(uso = {}) {
  const ahora = Date.now();
  _estado.requests.push(ahora);

  if (uso.input_tokens > 0) {
    _estado.tokensInput.push({ ts: ahora, tokens: uso.input_tokens });
  }
  if (uso.output_tokens > 0) {
    _estado.tokensOutput.push({ ts: ahora, tokens: uso.output_tokens });
  }
}

/**
 * Devuelve el estado actual de uso en la ventana de 1 minuto.
 */
function estado() {
  const ahora = Date.now();
  _limpiarVentana(ahora);

  return {
    ventana_ms:        VENTANA_MS,
    factor_seguridad:  LIMITES.factor_seguridad,
    requests:          { actual: _estado.requests.length,               limite: LIMITES.requests_por_minuto,      limite_seguro: Math.floor(LIMITES.requests_por_minuto * LIMITES.factor_seguridad) },
    tokens_input:      { actual: _sumar(_estado.tokensInput),           limite: LIMITES.input_tokens_por_minuto,  limite_seguro: Math.floor(LIMITES.input_tokens_por_minuto * LIMITES.factor_seguridad) },
    tokens_output:     { actual: _sumar(_estado.tokensOutput),          limite: LIMITES.output_tokens_por_minuto, limite_seguro: Math.floor(LIMITES.output_tokens_por_minuto * LIMITES.factor_seguridad) },
  };
}

// Para testing
function _reset() {
  _estado.requests     = [];
  _estado.tokensInput  = [];
  _estado.tokensOutput = [];
}

module.exports = { verificar, registrar, estado, RateLimitError, LIMITES, _reset };
