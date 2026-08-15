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
 * Bloqueo con excepcion auditable (break-glass): antes, "confirma
 * explicitamente" era solo prosa sin ningun enforcement -- reintentar el
 * mismo comando literal volvia a bloquear identico. Ahora se genera un id
 * de un solo uso via lib/break-glass.js; el humano lo confirma respondiendo
 * "CONFIRMAR-<id>" en su proximo mensaje (jailbreak-guard.js lo intercepta
 * en UserPromptSubmit), y solo entonces el REINTENTO EXACTO del mismo
 * tool_input pasa -- no otorga una excepcion general para acciones futuras.
 *
 * Uso: node mutating-action-guard.js (recibe el evento PreToolUse por stdin)
 */

const crypto = require('node:crypto');
const { leerEventoDeStdin } = require('./lib/hook-stdin');
const { solicitarBreakGlass, accionAprobada } = require('./lib/break-glass');
const { normalizarTexto } = require('./lib/normalizar-texto');

const GUARD_ID = 'mutating-action-guard';

/**
 * El "reintento exacto" se identifica por hash del tool_input completo, no
 * solo por el id de break-glass -- evita que confirmar un id autorice CUALQUIER
 * accion mutante subsecuente en vez de unicamente la que se bloqueo.
 */
function hashAccion(toolName, detalle) {
  return crypto.createHash('sha256').update(`${toolName}:${detalle}`).digest('hex').slice(0, 16);
}

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

// Hallazgo red-team 2026-08-15: "V=POST; curl -X\"$V\" ..." evadia el
// patron anterior porque el verbo real (POST) nunca aparece pegado al flag
// -X -- viaja en una variable interpolada. No se puede saber sin ejecutar
// el shell si "$V" resuelve a un verbo mutante o a GET -- ante esa
// incertidumbre, se trata como potencialmente mutante por defecto (negar
// es la opcion segura: un GET real fallara el guard y se puede reintentar
// literal, un POST real queda correctamente bloqueado).
const VERBO_HTTP_EN_VARIABLE = /(-X\s*["']?\$\{?\w+\}?["']?|--request\s+["']?\$\{?\w+\}?["']?|-Method\s+["']?\$\{?\w+\}?["']?)/i;

function esComandoHttpMutante(cmd) {
  if (!HERRAMIENTA_HTTP.test(cmd)) return false;
  return VERBO_HTTP_MUTANTE.test(cmd) || VERBO_HTTP_EN_VARIABLE.test(cmd);
}

const evento    = leerEventoDeStdin();
const agentType = evento.agent_type || '';
const toolName  = evento.tool_name || '';

// Solo aplica a tool calls originadas dentro de un subagente -- el hilo
// principal (usuario interactuando directo) no necesita este gate, ya esta
// presente turno a turno para decidir.
if (!agentType) process.exit(0);

/**
 * Bloquea con break-glass: si el reintento exacto (mismo hash) ya fue
 * aprobado via CONFIRMAR-<id>, deja pasar. Si no, genera un id nuevo y
 * bloquea con exit 2.
 */
function bloquearOAprobar(detalle, mensajeContexto) {
  const hash = hashAccion(toolName, detalle);
  if (accionAprobada(GUARD_ID, hash)) process.exit(0);

  const id = solicitarBreakGlass(GUARD_ID, hash);
  process.stderr.write(
    `[MUTATING-ACTION-GUARD] BLOQUEADO: el subagente "${agentType}" intento ${mensajeContexto} sin que el turno actual la solicitara explicitamente.\n` +
    'Motivo: crear/actualizar/borrar datos en un tenant o servicio externo requiere confirmacion humana explicita (Gobierno de Agentes, regla 6 de CLAUDE.md) -- el subagente no debe decidir por iniciativa propia cuando ejecutar esta accion.\n' +
    `Si es intencional, confirma explicitamente respondiendo unicamente: CONFIRMAR-${id}\n` +
    '(valido solo por 5 minutos y solo para reintentar esta accion exacta -- no autoriza otras acciones mutantes futuras).\n'
  );
  process.exit(2);
}

if (toolName.startsWith('mcp__')) {
  const mutante = esToolMcpMutante(toolName);
  if (mutante) {
    bloquearOAprobar(toolName, `"${toolName}" -- accion mutante hacia un servicio externo (servidor MCP "${mutante.servidor}")`);
  }
  process.exit(0);
}

if (toolName === 'Bash') {
  const cmdOriginal = evento.tool_input?.command || '';
  // Normalizacion Unicode antes de matchear (hallazgo red-team 2026-08-15) --
  // mismo motivo que destructive-op-guard.js.
  const cmd = normalizarTexto(cmdOriginal);
  if (cmd && esComandoHttpMutante(cmd)) {
    bloquearOAprobar(cmdOriginal, `un comando HTTP mutante hacia un servicio externo: "${cmdOriginal}"`);
  }
}

process.exit(0);
