'use strict';

/**
 * StyleProfiler — Acumulador y analizador de estilo de escritura del usuario.
 *
 * Problema: el sistema debia amoldarse al estilo del usuario pero no habia ningun
 * componente que observara sus mensajes y generara instrucciones de tono adaptadas.
 *
 * Solucion: este modulo acumula fragmentos del usuario en una sesion, extrae
 * patrones (longitud de oraciones, vocabulario tecnico, signos de puntuacion,
 * uso de mayusculas) y produce un bloque de instruccion de estilo que se inyecta
 * como bloque adicional en buildSystemBlocks() de anthropic-bridge.js.
 *
 * El bloque generado NO va al cache — varia por sesion a medida que el perfil
 * se ajusta con cada mensaje nuevo del usuario.
 *
 * Uso tipico:
 *   StyleProfiler.registrar(mensajeDelUsuario);
 *   const bloque = StyleProfiler.generarBloqueEstilo();
 *   // inyectar bloque en systemBlocks antes de la llamada al bridge
 */

// ---------------------------------------------------------------------------
// Estado de sesion (en memoria — no persiste entre reinicios intencionales)
// ---------------------------------------------------------------------------

const _muestras = [];
const MAX_MUESTRAS = 20; // ventana de los ultimos 20 mensajes del usuario

// ---------------------------------------------------------------------------
// Extraccion de rasgos
// ---------------------------------------------------------------------------

/**
 * Extrae rasgos de escritura de un mensaje.
 * @param {string} texto
 * @returns {object}
 */
function extraerRasgos(texto) {
  const oraciones     = texto.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const palabras      = texto.trim().split(/\s+/).filter(Boolean);
  const longitudMedia = palabras.length / Math.max(oraciones.length, 1);

  const usaMayusculas   = /^[A-Z]/.test(texto.trim());
  const usaPuntoFinal   = /\.$/.test(texto.trim());
  const usaSignosDobles = /[¿¡]/.test(texto);
  const usaAbreviacion  = /\bq\b|\bx\b|\btb\b|\bxq\b|\bxfa\b|\bmsj\b/i.test(texto);
  const densidadTecnica = (texto.match(/\b(API|LLM|MCP|SQL|token|prompt|schema|endpoint|refactor|debug|commit|branch|deploy|stack|repo|PR)\b/gi) || []).length / Math.max(palabras.length, 1);

  return {
    longitudMedia:    parseFloat(longitudMedia.toFixed(1)),
    usaMayusculas,
    usaPuntoFinal,
    usaSignosDobles,
    usaAbreviacion,
    densidadTecnica:  parseFloat(densidadTecnica.toFixed(3)),
    longitudTotal:    palabras.length,
  };
}

/**
 * Agrega un mensaje del usuario al buffer de muestras.
 * @param {string} mensaje
 */
function registrar(mensaje) {
  if (!mensaje || typeof mensaje !== 'string' || mensaje.trim().length < 5) return;
  _muestras.push(extraerRasgos(mensaje));
  if (_muestras.length > MAX_MUESTRAS) _muestras.shift();
}

// ---------------------------------------------------------------------------
// Generacion del perfil agregado
// ---------------------------------------------------------------------------

/**
 * Calcula el promedio de un campo numerico sobre todas las muestras.
 * @param {string} campo
 * @returns {number}
 */
function _promediar(campo) {
  if (_muestras.length === 0) return 0;
  return _muestras.reduce((acc, m) => acc + (m[campo] ?? 0), 0) / _muestras.length;
}

/**
 * Calcula la frecuencia de un campo booleano (porcentaje de true).
 * @param {string} campo
 * @returns {number} valor entre 0 y 1
 */
function _frecuencia(campo) {
  if (_muestras.length === 0) return 0;
  return _muestras.filter(m => m[campo]).length / _muestras.length;
}

/**
 * Genera el perfil agregado de estilo de la sesion actual.
 * @returns {object}
 */
function obtenerPerfil() {
  return {
    muestras:          _muestras.length,
    longitudMediaOracion: _promediar('longitudMedia'),
    frecMayusculas:    _frecuencia('usaMayusculas'),
    frecPuntoFinal:    _frecuencia('usaPuntoFinal'),
    frecSignosDobles:  _frecuencia('usaSignosDobles'),
    frecAbreviacion:   _frecuencia('usaAbreviacion'),
    densidadTecnicaMedia: _promediar('densidadTecnica'),
  };
}

// ---------------------------------------------------------------------------
// Generacion del bloque de instruccion para el system prompt
// ---------------------------------------------------------------------------

/**
 * Genera el bloque de texto de instruccion de estilo para inyectar en el system.
 * Se llama antes de cada completar() una vez que hay al menos 3 muestras.
 *
 * @returns {string | null} bloque listo para el system prompt, o null si no hay suficientes datos
 */
function generarBloqueEstilo() {
  if (_muestras.length < 3) return null;

  const perfil = obtenerPerfil();
  const instrucciones = ['# PERFIL DE ESTILO DEL USUARIO (sesion actual)\n'];

  instrucciones.push('Adapta tu tono y formato para coincidir con el estilo del usuario detectado:');

  // Longitud de respuesta
  if (perfil.longitudMediaOracion < 6) {
    instrucciones.push('- El usuario escribe de forma muy concisa. Prioriza respuestas cortas y directas.');
  } else if (perfil.longitudMediaOracion > 15) {
    instrucciones.push('- El usuario escribe oraciones largas y detalladas. Puedes extenderte si el contexto lo requiere.');
  } else {
    instrucciones.push('- El usuario usa oraciones de longitud moderada. Mantén un balance entre concision y detalle.');
  }

  // Tono tecnico
  if (perfil.densidadTecnicaMedia > 0.05) {
    instrucciones.push('- El usuario maneja vocabulario tecnico con soltura. No expliques terminos basicos.');
  }

  // Mayusculas y puntuacion
  if (perfil.frecMayusculas < 0.3) {
    instrucciones.push('- El usuario escribe con pocas mayusculas. Adapta el tono a uno mas informal sin perder precision tecnica.');
  }

  if (perfil.frecPuntoFinal < 0.4) {
    instrucciones.push('- El usuario raramente cierra oraciones con punto. No es necesario forzar formalismos de puntuacion en el tono.');
  }

  // Abreviaciones
  if (perfil.frecAbreviacion > 0.3) {
    instrucciones.push('- El usuario usa abreviaciones coloquiales (q, x, tb, etc.). El tono coloquial-tecnico es apropiado.');
  }

  // Reglas inamovibles que no se adaptan al estilo
  instrucciones.push('\nREGLAS QUE NO CAMBIAN POR ESTILO:');
  instrucciones.push('- Nunca emojis ni iconos en ninguna respuesta.');
  instrucciones.push('- Nunca responder en ingles.');
  instrucciones.push('- Nunca hacer nada que no se haya pedido explicitamente.');

  return instrucciones.join('\n');
}

/**
 * Limpia el buffer de muestras de la sesion.
 * Llamar al inicio de una sesion nueva o tras /clear.
 */
function limpiar() {
  _muestras.length = 0;
}

module.exports = { registrar, generarBloqueEstilo, obtenerPerfil, limpiar };
