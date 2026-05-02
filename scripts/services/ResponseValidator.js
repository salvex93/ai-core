'use strict';

/**
 * ResponseValidator — Validacion de output del modelo antes de entregarlo al usuario.
 *
 * Problema: las reglas criticas (sin emojis, sin ingles, sin frases prohibidas,
 * sin acciones no solicitadas) vivian solo en el system prompt. Si el modelo las
 * violaba, nadie lo detectaba antes de que el output llegara al usuario.
 *
 * Solucion: este modulo aplica un conjunto de verificaciones deterministicas
 * (regex/heuristica, sin LLM) sobre la respuesta generada. Si detecta una
 * violacion, retorna un informe con severidad y la posicion exacta del problema.
 *
 * Uso en anthropic-bridge.js:
 *   const { validar } = require('./services/ResponseValidator');
 *   const informe = validar(respuesta);
 *   if (informe.violaciones.length > 0) { ... manejar o loguear ... }
 */

// ---------------------------------------------------------------------------
// Catalogo de reglas
// ---------------------------------------------------------------------------

// Patron de emojis unicode (rangos principales)
const RE_EMOJI = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FA9F}]/u;

// Frases de cortesia prohibidas (cuestan tokens sin valor)
const FRASES_PROHIBIDAS = [
  /\bclaro\b/i,
  /\bpor supuesto\b/i,
  /\bentendido\b/i,
  /\bperfecto\b/i,
  /\bexcelente\b/i,
  /\bde acuerdo\b/i,
  /\bsin problema\b/i,
  /\bcomo puedes ver\b/i,
  /\ben resumen\b/i,
  /\ben conclusion\b/i,
  /\bespero que esto ayude\b/i,
  /\bno dudes en preguntar\b/i,
];

// Indicadores de ingles (presencia fuerte de palabras comunes en ingles fuera de bloques de codigo)
const RE_INGLES_FUERTE = /\b(I will|I would|Let me|Here is|Here are|Please note|Keep in mind|Feel free|As you can see|In summary|In conclusion|Of course|Sure|Sure!|Certainly|Understood|No problem)\b/i;

// Patron para detectar bloques de codigo (el validador no aplica reglas de idioma dentro de ellos)
const RE_BLOQUE_CODIGO = /```[\s\S]*?```|`[^`]+`/g;

// Indicadores de accion no solicitada (el modelo hace algo que no se pidio)
// Estas frases sugieren que el modelo modifico, creo o ejecuto algo de forma autonoma
const RE_ACCION_NO_SOLICITADA = [
  /he (creado|modificado|actualizado|eliminado|agregado|removido|instalado)\b/i,
  /ya (cree|modifique|actualice|elimine|agregue|removi|instale)\b/i,
  /acabo de (crear|modificar|actualizar|eliminar|agregar|remover)\b/i,
  /tambien (agregue|añadi|inclui|modifique)\b/i,
];

// ---------------------------------------------------------------------------
// Severidades
// ---------------------------------------------------------------------------

const SEVERIDAD = Object.freeze({
  CRITICO: 'CRITICO', // viola regla de identidad del sistema (ingles, emoji en codigo)
  ALTO:    'ALTO',    // frase prohibida o accion no solicitada detectada
  MEDIO:   'MEDIO',  // patron sospechoso que requiere revision
});

// ---------------------------------------------------------------------------
// Funciones de verificacion individuales
// ---------------------------------------------------------------------------

/**
 * Elimina bloques de codigo del texto antes de validar (evita falsos positivos).
 * @param {string} texto
 * @returns {string}
 */
function _sinBloquesCodigo(texto) {
  return texto.replace(RE_BLOQUE_CODIGO, '[BLOQUE_CODIGO]');
}

/**
 * Verifica presencia de emojis en el output fuera de bloques de codigo.
 * @param {string} texto
 * @returns {{ ok: boolean, detalle: string | null }}
 */
function verificarEmojis(texto) {
  const textoLimpio = _sinBloquesCodigo(texto);
  const match = textoLimpio.match(RE_EMOJI);
  if (match) {
    return { ok: false, detalle: `Emoji detectado: "${match[0]}" en posicion ${texto.indexOf(match[0])}` };
  }
  return { ok: true, detalle: null };
}

/**
 * Verifica frases de cortesia prohibidas (fuera de bloques de codigo).
 * @param {string} texto
 * @returns {{ ok: boolean, frases: string[] }}
 */
function verificarFrasesProhibidas(texto) {
  const textoLimpio = _sinBloquesCodigo(texto);
  const encontradas = FRASES_PROHIBIDAS
    .filter(re => re.test(textoLimpio))
    .map(re => re.source);
  return { ok: encontradas.length === 0, frases: encontradas };
}

/**
 * Verifica respuesta en ingles fuera de bloques de codigo.
 * @param {string} texto
 * @returns {{ ok: boolean, detalle: string | null }}
 */
function verificarIdioma(texto) {
  const textoLimpio = _sinBloquesCodigo(texto);
  const match       = textoLimpio.match(RE_INGLES_FUERTE);
  if (match) {
    return { ok: false, detalle: `Posible respuesta en ingles: "${match[0]}"` };
  }
  return { ok: true, detalle: null };
}

/**
 * Verifica indicadores de acciones no solicitadas.
 * @param {string} texto
 * @returns {{ ok: boolean, acciones: string[] }}
 */
function verificarAccionesNoSolicitadas(texto) {
  const textoLimpio = _sinBloquesCodigo(texto);
  const encontradas = RE_ACCION_NO_SOLICITADA
    .filter(re => re.test(textoLimpio))
    .map(re => {
      const m = textoLimpio.match(re);
      return m ? m[0] : re.source;
    });
  return { ok: encontradas.length === 0, acciones: encontradas };
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/**
 * Ejecuta todas las verificaciones sobre el output del modelo.
 *
 * @param {string} respuesta - texto generado por el modelo
 * @returns {{
 *   valido: boolean,
 *   violaciones: Array<{ regla: string, severidad: string, detalle: string }>,
 *   resumen: string
 * }}
 */
function validar(respuesta) {
  if (!respuesta || typeof respuesta !== 'string') {
    return { valido: false, violaciones: [{ regla: 'formato', severidad: SEVERIDAD.CRITICO, detalle: 'Respuesta vacia o no es string' }], resumen: 'Respuesta invalida' };
  }

  const violaciones = [];

  // Verificacion de emojis
  const chkEmoji = verificarEmojis(respuesta);
  if (!chkEmoji.ok) {
    violaciones.push({ regla: 'no_emojis', severidad: SEVERIDAD.CRITICO, detalle: chkEmoji.detalle });
  }

  // Verificacion de idioma
  const chkIdioma = verificarIdioma(respuesta);
  if (!chkIdioma.ok) {
    violaciones.push({ regla: 'idioma_espanol', severidad: SEVERIDAD.CRITICO, detalle: chkIdioma.detalle });
  }

  // Verificacion de frases prohibidas
  const chkFrases = verificarFrasesProhibidas(respuesta);
  if (!chkFrases.ok) {
    violaciones.push({
      regla:     'frases_prohibidas',
      severidad: SEVERIDAD.ALTO,
      detalle:   `Frases detectadas: ${chkFrases.frases.join(', ')}`,
    });
  }

  // Verificacion de acciones no solicitadas
  const chkAcciones = verificarAccionesNoSolicitadas(respuesta);
  if (!chkAcciones.ok) {
    violaciones.push({
      regla:     'accion_no_solicitada',
      severidad: SEVERIDAD.ALTO,
      detalle:   `Posibles acciones autonomas: ${chkAcciones.acciones.join(' | ')}`,
    });
  }

  const valido  = violaciones.length === 0;
  const criticos = violaciones.filter(v => v.severidad === SEVERIDAD.CRITICO).length;
  const resumen  = valido
    ? 'Output valido — sin violaciones detectadas'
    : `${violaciones.length} violacion(es) — ${criticos} critica(s)`;

  return { valido, violaciones, resumen };
}

/**
 * Version que lanza excepcion si hay violaciones criticas.
 * Usar cuando el output no debe llegar al usuario bajo ninguna circunstancia.
 *
 * @param {string} respuesta
 * @throws {Error} si hay violaciones de severidad CRITICO
 * @returns {{ valido: boolean, violaciones: Array, resumen: string }}
 */
function validarEstricto(respuesta) {
  const informe = validar(respuesta);
  const criticos = informe.violaciones.filter(v => v.severidad === SEVERIDAD.CRITICO);
  if (criticos.length > 0) {
    throw new Error(`[ResponseValidator] Violacion critica: ${criticos.map(v => v.detalle).join(' | ')}`);
  }
  return informe;
}

module.exports = { validar, validarEstricto, verificarEmojis, verificarFrasesProhibidas, verificarIdioma, verificarAccionesNoSolicitadas, SEVERIDAD };
