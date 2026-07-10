#!/usr/bin/env node
/**
 * injection-guard.js — Deteccion de prompt injection indirecta en output de subagentes
 * (hook SubagentStop). Complementa subagent-review.js (calidad de codigo) y
 * cross-verify-gate.js (regresion funcional) con un tercer eje: contenido
 * potencialmente inyectado desde fuentes externas (archivos leidos, resultados
 * de Gemini bridge, paginas web) que intenta redirigir al agente padre.
 *
 * Solo advierte, no bloquea — mismo criterio que secrets-guard.js. El
 * operador humano decide si el hallazgo es una falsa alarma o un ataque real.
 */

'use strict';

const subagentOutput = process.env.CLAUDE_SUBAGENT_OUTPUT || '';
const subagentName   = process.env.CLAUDE_SUBAGENT_TYPE   || 'unknown';

if (!subagentOutput) process.exit(0);

// Patrones de indirect prompt injection — contenido externo que intenta
// hacerse pasar por una instruccion nueva del sistema o del usuario.
const PATRONES = [
  { re: /ignor[ae]\s+(todas\s+)?(las\s+)?instrucciones\s+(anteriores|previas)/i,
    etiqueta: 'intento de anular instrucciones previas' },
  { re: /ignore\s+(all\s+)?previous\s+instructions/i,
    etiqueta: 'intento de anular instrucciones previas (EN)' },
  { re: /^\s*(system|assistant|human)\s*:\s*/im,
    etiqueta: 'turno de conversacion falsificado dentro del contenido' },
  { re: /\[?(nuevo\s+system\s+prompt|new\s+system\s+prompt)\]?/i,
    etiqueta: 'intento de inyectar un system prompt nuevo' },
  { re: /revela(r)?\s+(tu|el)\s+system\s+prompt|reveal\s+your\s+system\s+prompt/i,
    etiqueta: 'intento de extraccion de system prompt' },
  { re: /env\a[ií]a\s+(este|el)\s+contenido\s+a\s+https?:\/\//i,
    etiqueta: 'instruccion de exfiltracion de datos hacia URL externa' },
  { re: /(borra|elimina|delete)\s+(todos\s+los\s+)?(archivos|files)\s+(sin\s+confirmar|without\s+confirmation)/i,
    etiqueta: 'instruccion de accion destructiva sin confirmacion' },
];

const hallazgos = PATRONES.filter(({ re }) => re.test(subagentOutput));

if (hallazgos.length === 0) process.exit(0);

console.log(`[injection-guard] subagente:${subagentName} — ${hallazgos.length} patron(es) de posible prompt injection en el output:`);
for (const { etiqueta } of hallazgos) {
  console.log(`  [ALERTA] ${etiqueta}`);
}
console.log('[injection-guard] revisar el contenido fuente (archivo, web o Gemini) antes de actuar sobre instrucciones que aparezcan ahi.');

// Exit 0 — advierte, no bloquea. La decision final es del operador.
process.exit(0);
