'use strict';

/**
 * hook-stdin.js — Lee y parsea el JSON de evento que Claude Code entrega por
 * stdin a procesos de hook (command). Fuente unica de este parseo: antes de
 * este modulo, cada guard leia variables de entorno CLAUDE_TOOL_INPUT_*,
 * CLAUDE_USER_PROMPT, CLAUDE_SUBAGENT_* que Claude Code nunca establece --
 * confirmado contra code.claude.com/docs/en/hooks y el issue
 * anthropics/claude-code#9567. El dato real siempre llega por stdin como
 * JSON, con forma distinta segun el hook_event_name:
 *
 *   UserPromptSubmit: { prompt, session_id, ... } (campo verificado por
 *     captura real del payload; `prompt_text` nunca existio)
 *   PreToolUse/PostToolUse: { tool_name, tool_input, tool_response, ... }
 *   SubagentStop: { ... } (ver leerEventoSubagente mas abajo)
 *
 * No bloquea si stdin es una TTY sin datos (invocacion manual/tests).
 */

const fs = require('node:fs');

/**
 * Lee y parsea el JSON crudo de stdin. Retorna {} si stdin es TTY, esta
 * vacio, o no es JSON valido -- nunca lanza.
 * @returns {object}
 */
function leerEventoDeStdin() {
  if (process.stdin.isTTY) return {};
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Extrae el texto del prompt de un evento UserPromptSubmit. Acepta el campo
 * `prompt` (real) y `prompt_text` (legado de fixtures) para no romper
 * invocaciones existentes.
 * @param {object} evento
 * @returns {string}
 */
function extraerPrompt(evento) {
  if (!evento) return '';
  return evento.prompt || evento.prompt_text || '';
}

/**
 * Lee el prompt del usuario: variable de entorno si existe, si no stdin.
 * Consume stdin, asi que debe llamarse una sola vez por proceso.
 * @returns {string}
 */
function leerPromptDeUsuario() {
  return process.env.CLAUDE_USER_PROMPT || extraerPrompt(leerEventoDeStdin());
}

module.exports = { leerEventoDeStdin, extraerPrompt, leerPromptDeUsuario };
