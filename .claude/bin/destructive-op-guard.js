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
 * de base de datos, mensaje de commit con Co-Authored-By o atribucion de
 * autoria a una IA -- este ultimo cierra un gap real: standards-guard.js ya
 * bloqueaba esto pero solo si el mensaje se escribia primero a un archivo
 * via Write/Edit, un "git commit -m/-F" directo por Bash no pasaba por
 * ningun guard de contenido), mostrando el comando exacto y el motivo. El bloqueo en
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

/**
 * Extrae el mensaje REAL que se va a commitear a partir de un comando
 * "git commit ...", ya sea inline (-m "...") o via archivo (-F <ruta>).
 * Este es el contenido que se inspecciona por Co-Authored-By/menciones de
 * IA -- a diferencia de `cmd` (mas abajo), que enmascara ese mismo texto
 * para que las REGLAS de comandos destructivos no se autobloqueen al
 * describirlo en prosa.
 *
 * @param {string} cmdOriginal - comando de shell completo, sin enmascarar
 * @returns {string} el mensaje real, o '' si no se pudo extraer
 */
function extraerMensajeCommit(cmdOriginal) {
  if (!/\bgit\s+commit\b/.test(cmdOriginal)) return '';

  const matchInline = cmdOriginal.match(/-m\s+(["'])((?:(?!\1).)*)\1/s);
  if (matchInline) return matchInline[2];

  const matchArchivo = cmdOriginal.match(/-F\s+(\S+)/);
  if (matchArchivo) {
    try {
      return require('node:fs').readFileSync(matchArchivo[1], 'utf8');
    } catch {
      return '';
    }
  }
  return '';
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

// Mensaje REAL de commit (no enmascarado) -- se inspecciona por separado del
// loop de REGLAS porque necesita distinguir atribucion real de IA (bloquea)
// de una mencion en prosa sobre esta misma regla, ej. un commit que la
// documenta (no bloquea). CLAUDE.md: "PROHIBIDO incluir Co-Authored-By,
// menciones a Claude, IA o herramientas externas en cualquier mensaje de
// commit" -- standards-guard.js ya aplica esto cuando el mensaje se escribe
// primero a un archivo via Write/Edit, pero un "git commit -m/-F" ejecutado
// directo por Bash nunca pasaba por ese guard.
const mensajeCommit = extraerMensajeCommit(cmdOriginal);
if (mensajeCommit) {
  // Co-Authored-By es un trailer de formato inequivoco (Nombre <email>) --
  // nadie lo escribe como prosa casual, no necesita distincion de contexto.
  const trailerCoAuthored = /^co-authored-by:\s*.+<.+>/im;
  // Menciones de IA en CONTEXTO DE ATRIBUCION DE AUTORIA real (ej. "Generated
  // with Claude", "sugerido por ChatGPT") -- deliberadamente mas estricto que
  // una mencion neutra de la herramienta en prosa (ej. un commit que dice
  // "prohibir menciones a Claude" esta hablando DE la regla, no atribuyendo
  // autoria real, y no debe autobloquearse).
  const atribucionIA = /(generated (with|by)|written (with|by)|co-authored|sugerido(s)? por|generado(s)? (con|por)|escrito(s)? (con|por))\s+(claude|anthropic|chatgpt|openai|gemini|copilot|gpt-\d)/i;

  if (trailerCoAuthored.test(mensajeCommit) || atribucionIA.test(mensajeCommit)) {
    process.stderr.write(
      `[DESTRUCTIVE-OP-GUARD] BLOQUEADO (mensaje de commit con rastro de IA): "${mensajeCommit.slice(0, 200)}"\n` +
      `Motivo: CLAUDE.md prohibe Co-Authored-By y menciones de autoria de IA en mensajes de commit -- el mensaje debe parecer escrito enteramente por el autor humano.\n` +
      `Reescribe el mensaje sin esa atribucion antes de reintentar el commit.\n`
    );
    process.exit(2);
  }
}

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
