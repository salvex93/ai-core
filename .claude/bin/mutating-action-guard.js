#!/usr/bin/env node
'use strict';
/**
 * mutating-action-guard.js — Human-in-the-loop obligatorio para acciones que
 * MUTAN estado en un servicio externo (crear/actualizar/borrar en un tenant,
 * API o base de datos ajena al repo) cuando la tool call se origina dentro
 * de un subagente. Corre en PreToolUse.
 *
 * Gap real que cierra: un agente puede tener Bash o una tool mcp__* de
 * escritura legitimamente declarada en tools:, y agent-paths-guard.js solo
 * cubre mutaciones sobre el filesystem local -- una llamada de red hacia una
 * API externa (crear tarea, actualizar registro en un tenant) no toca
 * ninguna ruta de archivo, asi que ese guard no aplica. Sin este guard, un
 * agente exploratorio puede decidir por su cuenta ejecutar una accion
 * mutante contra un tenant real (Microsoft, base de datos, API propia)
 * DURANTE la sesion, sin que el usuario la haya pedido en ese turno --
 * exactamente el patron reportado: "hizo lo que quiso, no porque yo se lo
 * pedí en ese momento".
 *
 * No intenta verificar si el turno actual "pidio" la accion (un hook
 * PreToolUse no tiene acceso al historial de intencion del usuario, solo al
 * tool_input) -- en cambio, igual que destructive-op-guard.js, bloquea la
 * accion cuando se origina en un SUBAGENTE (agent_type presente) y exige que
 * el humano la apruebe explicitamente en el turno siguiente. El hilo
 * principal (sin agent_type, el usuario interactuando directo con Claude)
 * nunca se bloquea aqui -- ahi el usuario ya esta presente turno a turno.
 *
 * Deteccion (heuristica por verbo, mismo espiritu que destructive-op-guard.js
 * -- conservador, prefiere falso negativo a bloquear un flujo legitimo):
 * - mcp__servidor__accion: bloquea si <accion> contiene un verbo de
 *   escritura (crear, nuevo, add, update, actualizar, set, write, post,
 *   delete, borrar, eliminar, remove). Nombres de lectura (get_, list_,
 *   consultar_, read_, buscar_) nunca bloquean.
 * - Bash: bloquea si el comando invoca curl/wget/Invoke-WebRequest/
 *   Invoke-RestMethod con un verbo HTTP mutante explicito (-X POST/PUT/
 *   PATCH/DELETE, -Method Post/Put/Patch/Delete) hacia una URL -- un GET
 *   implicito (sin -X, o -X GET) nunca bloquea.
 *
 * Uso: node mutating-action-guard.js (recibe el evento PreToolUse por stdin)
 */

const { leerEventoDeStdin } = require('./lib/hook-stdin');

const VERBOS_ESCRITURA = /\b(crear?|nuevo|add|update|actualizar|set|write|post|delete|borrar|eliminar|remove|create)\w*/i;
const VERBOS_LECTURA_MCP = /^(get|list|consultar|read|buscar|fetch|query|check|status)/i;

function esToolMcpMutante(toolName) {
  const match = toolName.match(/^mcp__([^_]+(?:-[^_]+)*)__(.+)$/);
  if (!match) return null;

  const [, servidor, accion] = match;
  if (VERBOS_LECTURA_MCP.test(accion)) return null;
  if (!VERBOS_ESCRITURA.test(accion)) return null;

  return { servidor, accion };
}

const VERBO_HTTP_MUTANTE = /(-X\s*(POST|PUT|PATCH|DELETE)\b|--request\s+(POST|PUT|PATCH|DELETE)\b|-Method\s+(Post|Put|Patch|Delete)\b)/i;
const HERRAMIENTA_HTTP   = /\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b/i;

function esComandoHttpMutante(cmd) {
  return HERRAMIENTA_HTTP.test(cmd) && VERBO_HTTP_MUTANTE.test(cmd);
}

const evento    = leerEventoDeStdin();
const agentType = evento.agent_type || '';
const toolName  = evento.tool_name || '';

// Solo aplica a tool calls originadas dentro de un subagente -- el hilo
// principal (usuario interactuando directo) no necesita este gate, ya esta
// presente turno a turno para decidir.
if (!agentType) process.exit(0);

if (toolName.startsWith('mcp__')) {
  const mutante = esToolMcpMutante(toolName);
  if (mutante) {
    process.stderr.write(
      `[MUTATING-ACTION-GUARD] BLOQUEADO: el subagente "${agentType}" intento "${toolName}" -- accion mutante hacia un servicio externo (servidor MCP "${mutante.servidor}") sin que el turno actual la solicitara explicitamente.\n` +
      'Motivo: crear/actualizar/borrar datos en un tenant o servicio externo requiere confirmacion humana explicita (Gobierno de Agentes, regla 6 de CLAUDE.md) -- el subagente no debe decidir por iniciativa propia cuando ejecutar esta accion.\n' +
      'Si es intencional, confirma explicitamente pidiendo esta accion en tu proximo mensaje antes de reintentar.\n'
    );
    process.exit(2);
  }
  process.exit(0);
}

if (toolName === 'Bash') {
  const cmd = evento.tool_input?.command || '';
  if (cmd && esComandoHttpMutante(cmd)) {
    process.stderr.write(
      `[MUTATING-ACTION-GUARD] BLOQUEADO: el subagente "${agentType}" intento un comando HTTP mutante hacia un servicio externo sin que el turno actual lo solicitara explicitamente: "${cmd}"\n` +
      'Motivo: crear/actualizar/borrar datos en un tenant o servicio externo requiere confirmacion humana explicita (Gobierno de Agentes, regla 6 de CLAUDE.md) -- el subagente no debe decidir por iniciativa propia cuando ejecutar esta accion.\n' +
      'Si es intencional, confirma explicitamente pidiendo esta accion en tu proximo mensaje antes de reintentar.\n'
    );
    process.exit(2);
  }
}

process.exit(0);
