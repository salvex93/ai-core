#!/usr/bin/env node
'use strict';
/**
 * bash-verbosity-guard.js — Gate preventivo sobre comandos Bash de alto riesgo
 * de output masivo sin acotar.
 *
 * Los hooks de Claude Code no exponen el OUTPUT de una tool call via variable
 * de entorno -- no es posible truncar o indexar el resultado de Bash despues
 * de que corre. Este guard ataca la causa en vez del sintoma: bloquea
 * (exit 2) el comando ANTES de ejecutarlo si coincide con un patron conocido
 * de output no acotado, y sugiere la version equivalente con limite.
 *
 * El comando a ejecutar llega por JSON en stdin (tool_input.command), NO por
 * variable de entorno -- CLAUDE_TOOL_INPUT_command nunca existio en runtime
 * real (confirmado contra code.claude.com/docs/en/hooks y el issue
 * anthropics/claude-code#9567, que documenta ese patron de variable como
 * siempre vacio). Bug real: el guard nunca vio un comando real en produccion,
 * solo pasaba sus propios tests porque estos inyectan la variable a mano.
 *
 * Deliberadamente conservador: solo bloquea patrones donde el equivalente
 * acotado es inequivoco. Ante duda, deja pasar (falso negativo > falso
 * positivo — bloquear de mas rompe flujos legitimos).
 *
 * Uso: node bash-verbosity-guard.js (recibe el evento PreToolUse por stdin)
 */

function leerComandoDeStdin() {
  try {
    const fs  = require('node:fs');
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return '';
    const evento = JSON.parse(raw);
    return evento.tool_input?.command || '';
  } catch {
    return '';
  }
}

// CLAUDE_TOOL_INPUT_command como fallback: nunca la establece Claude Code en
// produccion, pero permite invocacion manual/tests sin tener que armar JSON.
const cmd = process.env.CLAUDE_TOOL_INPUT_command
  || (!process.stdin.isTTY ? leerComandoDeStdin() : '');

if (!cmd) process.exit(0);

// Cada regla: patron que dispara el bloqueo + patron de excepcion (si el
// comando YA incluye una forma de acotar, no se bloquea) + sugerencia.
const REGLAS = [
  {
    nombre: 'git log sin acotar',
    disparo: /\bgit\s+log\b/,
    excepcion: /-n\s*\d+|--oneline|--max-count|\|\s*head|\|\s*tail/,
    sugerencia: 'git log --oneline -n 10 (o agrega | head -N)',
  },
  {
    // Solo bloquea "git diff" a secas o con flags puras (ej. --cached) sin
    // ningun argumento de ruta — ese es el caso que vuelca el repo completo.
    // "git diff archivo.js" o "git diff -- archivo.js" ya acotan y no disparan.
    nombre: 'git diff sin acotar a ningun archivo',
    disparo: /^\s*git\s+diff(\s+--?[a-zA-Z-]+)*\s*$/,
    excepcion: /--stat/,
    sugerencia: 'git diff --stat (resumen) o git diff <archivo especifico>',
  },
  {
    nombre: 'cat de archivo sin acotar',
    disparo: /\bcat\s+(?!.*\/dev\/null)\S/,
    excepcion: /\|\s*head|\|\s*tail|\|\s*grep|\|\s*wc/,
    sugerencia: 'usa la herramienta Read (con limit/offset) en vez de cat, o acota con | head -N',
  },
  {
    nombre: 'find recursivo sin acotar',
    disparo: /\bfind\s+\S+.*-name\b/,
    excepcion: /\|\s*head|\|\s*wc|-maxdepth/,
    sugerencia: 'usa la herramienta Glob en vez de find (mas rapida y sin salida cruda)',
  },
];

for (const regla of REGLAS) {
  if (regla.disparo.test(cmd) && !regla.excepcion.test(cmd)) {
    process.stderr.write(
      `[BASH-VERBOSITY-GUARD] BLOQUEADO (${regla.nombre}): "${cmd}"\n` +
      `Riesgo de output masivo sin acotar, se queda en el contexto para siempre.\n` +
      `Sugerencia: ${regla.sugerencia}\n`
    );
    process.exit(2);
  }
}

process.exit(0);
