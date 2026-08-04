#!/usr/bin/env node
'use strict';
/**
 * destructive-op-guard.js — Gate preventivo sobre comandos Bash destructivos
 * sin confirmacion humana previa (Gobierno de Agentes, CLAUDE.md: "Human-in-
 * the-loop obligatorio para operaciones destructivas").
 *
 * Antes de este guard, esa regla era pura convencion en prosa -- ningun
 * mecanismo de codigo la hacia cumplir. Este hook bloquea (exit 2) ANTES de
 * ejecutar si el comando coincide con un patron destructivo conocido
 * (borrado recursivo, force-push, reset/clean irreversible, DDL destructivo
 * de base de datos), mostrando el comando exacto y el motivo. El bloqueo en
 * si YA es la aprobacion requerida: Claude Code no reintenta un comando
 * bloqueado sin que el humano lo apruebe explicitamente en el turno
 * siguiente (los hooks PreToolUse no pueden pausar a mitad de tool call para
 * pedir confirmacion interactiva real, solo bloquear con exit 2 y mostrar
 * contexto -- mismo mecanismo que code-exec-guard.js y bash-verbosity-guard.js).
 *
 * Deliberadamente conservador: solo bloquea patrones donde la alternativa
 * segura es inequivoca (--force-with-lease en vez de --force, git branch -d
 * en vez de -D). Ante duda, deja pasar -- falso negativo es preferible a
 * bloquear un flujo legitimo de forma constante.
 *
 * El comando llega por JSON en stdin (tool_input.command) -- mismo contrato
 * real de hooks confirmado contra code.claude.com/docs/en/hooks (ver
 * bash-verbosity-guard.js para el detalle de esta regresion).
 *
 * Uso: node destructive-op-guard.js (recibe el evento PreToolUse por stdin)
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

const cmdOriginal = process.env.CLAUDE_TOOL_INPUT_command
  || (!process.stdin.isTTY ? leerComandoDeStdin() : '');

if (!cmdOriginal) process.exit(0);

// Un git commit -m "..."/-F <archivo> puede mencionar cualquier patron
// destructivo como TEXTO DESCRIPTIVO del propio mensaje (ej. un commit que
// documenta este mismo guard) -- eso no es un comando real de shell, es
// contenido citado. Se descarta el argumento del mensaje antes de evaluar
// las reglas para no bloquear el commit que las documenta.
const cmd = /\bgit\s+commit\b/.test(cmdOriginal)
  ? cmdOriginal.replace(/-m\s+(["'])(?:(?!\1).)*\1/gs, '-m "..."')
               .replace(/-F\s+\S+/g, '-F ...')
  : cmdOriginal;

// Cada regla: patron que dispara el bloqueo + patron de excepcion (alternativa
// ya segura que no debe bloquearse) + motivo mostrado al operador.
const REGLAS = [
  {
    nombre: 'rm -rf',
    disparo: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\b/,
    excepcion: null,
    motivo: 'borrado recursivo forzado -- irreversible, sin papelera de reciclaje.',
  },
  {
    nombre: 'git push --force',
    disparo: /\bgit\s+push\b.*(--force\b|(?<!--force-with-lease)\s-f\b)/,
    excepcion: /--force-with-lease/,
    motivo: 'sobreescribe el historial remoto sin verificar si alguien mas pusheo -- usar --force-with-lease en su lugar.',
  },
  {
    nombre: 'git reset --hard',
    disparo: /\bgit\s+reset\s+.*--hard\b/,
    excepcion: null,
    motivo: 'descarta cambios locales sin posibilidad de recuperacion (working tree + index).',
  },
  {
    nombre: 'git clean -f',
    disparo: /\bgit\s+clean\s+.*-[a-zA-Z]*f/,
    excepcion: null,
    motivo: 'borra archivos no trackeados de forma irreversible -- puede incluir trabajo en progreso nunca commiteado.',
  },
  {
    nombre: 'git branch -D',
    disparo: /\bgit\s+branch\s+.*-D\b/,
    excepcion: null,
    motivo: 'borra una rama sin verificar si esta mergeada -- usar -d (minuscula) si la rama ya esta integrada.',
  },
  {
    nombre: 'DROP TABLE / TRUNCATE sin filtro',
    disparo: /\b(DROP\s+TABLE|TRUNCATE(\s+TABLE)?)\b/i,
    excepcion: /IF\s+EXISTS.*--\s*intencional|--\s*confirmado/i,
    motivo: 'elimina datos o estructura de tabla de forma irreversible sin backup verificado en el propio comando.',
  },
];

for (const regla of REGLAS) {
  if (regla.disparo.test(cmd) && !(regla.excepcion && regla.excepcion.test(cmd))) {
    process.stderr.write(
      `[DESTRUCTIVE-OP-GUARD] BLOQUEADO (${regla.nombre}): "${cmd}"\n` +
      `Motivo: ${regla.motivo}\n` +
      `Si es intencional, confirma explicitamente con el usuario antes de reintentar el comando exacto.\n`
    );
    process.exit(2);
  }
}

process.exit(0);
