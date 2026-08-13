'use strict';

/**
 * permission-decision.js — Emite la respuesta JSON de hookSpecificOutput
 * para PreToolUse, siguiendo el formato documentado en
 * code.claude.com/docs/en/hooks para permissionDecision.
 *
 * Diferencia con exit 2: exit 2 es el unico bloqueo que ningun JSON puede
 * anular -- apropiado para riesgo de seguridad real (destructivo, ejecucion
 * arbitraria, credenciales). permissionDecision:"deny" con exit 0 es la via
 * recomendada para friccion OPERATIVA (limite de tokens, scope de
 * configuracion estatica): Claude ve la razon en el mismo turno y puede
 * reformular la accion sin que el humano tenga que aprobar nada -- no hay
 * mecanismo de excepcion auditable aqui porque no hay riesgo que auditar,
 * solo un limite de politica que puede sortearse cambiando el enfoque.
 *
 * Uso: process.stdout.write(denegarConRazon('PreToolUse', 'motivo')); exit 0.
 */

/**
 * @param {string} hookEventName - nombre del evento de hook, ej. "PreToolUse"
 * @param {string} razon - motivo legible que Claude vera para reformular
 * @returns {string} JSON serializado listo para escribir a stdout
 */
function denegarConRazon(hookEventName, razon) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: 'deny',
      permissionDecisionReason: razon,
    },
  });
}

module.exports = { denegarConRazon };
