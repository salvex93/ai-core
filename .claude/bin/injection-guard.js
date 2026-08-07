#!/usr/bin/env node
/**
 * injection-guard.js — Deteccion de prompt injection indirecta en output de subagentes
 * (hook SubagentStop). Complementa subagent-review.js (calidad de codigo) y
 * cross-verify-gate.js (regresion funcional) con un tercer eje: contenido
 * potencialmente inyectado desde fuentes externas (archivos leidos, resultados
 * de Gemini bridge, paginas web) que intenta redirigir al agente padre.
 *
 * Este hook en si mismo solo advierte, nunca bloquea — limitacion real del
 * tipo de hook, no eleccion de diseno: en SubagentStop, exit 2 fuerza al
 * subagente a seguir corriendo ("Prevents the subagent from stopping"), no
 * impide que su output ya generado se integre al contexto del padre
 * (confirmado contra code.claude.com/docs/en/hooks).
 *
 * El bloqueo real ocurre un paso despues: los patrones de ALTA confianza
 * (formato inequivoco, sin lectura plausible como contenido legitimo)
 * escriben una marca de cuarentena por sesion (lib/injection-quarantine.js).
 * injection-quarantine-guard.js, registrado en PreToolUse (Bash|Write|Edit),
 * lee esa marca ANTES de que el padre actue sobre cualquier archivo o
 * comando y bloquea (exit 2) hasta que el humano confirme explicitamente —
 * ese es el mecanismo que efectivamente veta la explotacion del contenido
 * inyectado, no este hook. Los patrones de confianza MEDIA (mas ambiguos,
 * riesgo real de falso positivo con texto legitimo que cita esas frases)
 * solo advierten via emitirReporte(verdict: 'warn'), igual que antes.
 */

'use strict';

const { leerEventoDeStdin } = require('./lib/hook-stdin');
const { emitirReporte }     = require('./lib/guard-report');
const { marcarCuarentena }  = require('./lib/injection-quarantine');

// CLAUDE_SUBAGENT_OUTPUT/CLAUDE_SUBAGENT_TYPE nunca existieron como variables
// de entorno reales -- SubagentStop entrega el output por stdin como JSON,
// campos agent_type y last_assistant_message (confirmado contra
// code.claude.com/docs/en/hooks).
const evento = leerEventoDeStdin();
const subagentOutput = process.env.CLAUDE_SUBAGENT_OUTPUT || evento.last_assistant_message || '';
const subagentName   = process.env.CLAUDE_SUBAGENT_TYPE   || evento.agent_type || 'unknown';

if (!subagentOutput) process.exit(0);

// Patrones de indirect prompt injection — contenido externo que intenta
// hacerse pasar por una instruccion nueva del sistema o del usuario.
// confianza 'alta': formato inequivoco, dispara cuarentena real (bloqueo en
// PreToolUse via injection-quarantine-guard.js). confianza 'media': mas
// ambiguo (frases que texto legitimo tambien podria citar), solo advierte.
const PATRONES = [
  { re: /ignor[ae]\s+(todas\s+)?(las\s+)?instrucciones\s+(anteriores|previas)/i,
    etiqueta: 'intento de anular instrucciones previas', confianza: 'alta' },
  { re: /ignore\s+(all\s+)?previous\s+instructions/i,
    etiqueta: 'intento de anular instrucciones previas (EN)', confianza: 'alta' },
  { re: /^\s*(system|assistant|human)\s*:\s*/im,
    etiqueta: 'turno de conversacion falsificado dentro del contenido', confianza: 'media' },
  { re: /\[?(nuevo\s+system\s+prompt|new\s+system\s+prompt)\]?/i,
    etiqueta: 'intento de inyectar un system prompt nuevo', confianza: 'alta' },
  { re: /revela(r)?\s+(tu|el)\s+system\s+prompt|reveal\s+your\s+system\s+prompt/i,
    etiqueta: 'intento de extraccion de system prompt', confianza: 'alta' },
  { re: /env\a[ií]a\s+(este|el)\s+contenido\s+a\s+https?:\/\//i,
    etiqueta: 'instruccion de exfiltracion de datos hacia URL externa', confianza: 'alta' },
  { re: /(borra|elimina|delete)\s+(todos\s+los\s+)?(archivos|files)\s+(sin\s+confirmar|without\s+confirmation)/i,
    etiqueta: 'instruccion de accion destructiva sin confirmacion', confianza: 'alta' },
];

const hallazgos = PATRONES.filter(({ re }) => re.test(subagentOutput));

if (hallazgos.length === 0) {
  emitirReporte({ guard: 'injection-guard', verdict: 'ok', severity: 'baja' });
  process.exit(0);
}

console.log(`[injection-guard] subagente:${subagentName} — ${hallazgos.length} patron(es) de posible prompt injection en el output:`);
for (const { etiqueta } of hallazgos) {
  console.log(`  [ALERTA] ${etiqueta}`);
}
console.log('[injection-guard] revisar el contenido fuente (archivo, web o Gemini) antes de actuar sobre instrucciones que aparezcan ahi.');

const altaConfianza = hallazgos.filter(h => h.confianza === 'alta');

if (altaConfianza.length > 0) {
  // Cuarentena real: la siguiente accion del padre (Bash/Write/Edit) queda
  // bloqueada por injection-quarantine-guard.js hasta confirmacion humana
  // explicita -- este es el mecanismo que efectivamente veta la explotacion
  // del contenido, no este hook (ver nota de cabecera).
  const id = marcarCuarentena({ subagentName, hallazgos: altaConfianza.map(h => h.etiqueta) });
  console.log(`[injection-guard] CUARENTENA activada (id ${id}): la siguiente accion del agente padre queda bloqueada hasta confirmacion humana explicita.`);
  emitirReporte({ guard: 'injection-guard', verdict: 'blocked', severity: 'critica', hallazgos: altaConfianza.map(h => h.etiqueta) });
} else {
  emitirReporte({ guard: 'injection-guard', verdict: 'warn', severity: 'alta', hallazgos: hallazgos.map(h => h.etiqueta) });
}

// Exit 0 siempre -- SubagentStop no puede vetar el output ya generado (ver
// nota de cabecera). El veto real, si aplica, ya quedo marcado arriba.
process.exit(0);
