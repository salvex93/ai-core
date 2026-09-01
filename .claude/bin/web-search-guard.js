#!/usr/bin/env node
'use strict';
/**
 * web-search-guard.js — Intercepta WebSearch/WebFetch para forzar
 * mcp__gemini-bridge__buscar_web (tier 0 gratuito) en vez de la busqueda
 * web nativa de Claude, mismo patron ya usado por guard-read.js para Read.
 *
 * Gap real identificado en auditoria comparativa de mercado (2026-09-01):
 * la regla "GEMINI PRIMERO" de CLAUDE.md para busqueda web era solo prosa
 * en el ANCLA de reglas criticas, sin ningun hook que la hiciera cumplir --
 * a diferencia de Read (archivos > 200 lineas), que si tenia enforcement
 * real desde antes. Como Claude Code no ofrece un mecanismo de hook que
 * REDIRIJA una tool call a otro proveedor (confirmado contra
 * code.claude.com/docs/en/hooks: PreToolUse solo permite
 * allow/deny/ask/updatedInput de la MISMA tool), el patron viable es negar
 * la tool nativa con permissionDecision:"deny" para que Claude reformule
 * usando la alternativa MCP en el mismo turno.
 *
 * Fallback con gracia: sin GEMINI_API_KEY disponible, deja pasar
 * WebSearch/WebFetch nativo -- bloquear sin alternativa real seria
 * degradacion total, peor que gastar los tokens de la tool nativa.
 *
 * Uso: node web-search-guard.js (recibe el evento PreToolUse por stdin)
 */

const { leerEventoDeStdin } = require('./lib/hook-stdin');
const { denegarConRazon } = require('./lib/permission-decision');
const { loadEnv } = require('../../scripts/services/GeminiApiClient');

const TOOLS_A_FORZAR = new Set(['WebSearch', 'WebFetch']);

loadEnv();
const GEMINI_DISPONIBLE = Boolean(process.env.GEMINI_API_KEY);

const evento = leerEventoDeStdin();
const toolName = evento.tool_name || '';

if (TOOLS_A_FORZAR.has(toolName) && GEMINI_DISPONIBLE) {
  process.stdout.write(denegarConRazon(
    'PreToolUse',
    `${toolName} nativo bloqueado -- usa mcp__gemini-bridge__buscar_web en su lugar (tier 0 gratuito, regla GEMINI PRIMERO de CLAUDE.md) para no quemar tokens de Claude en busqueda web.`
  ));
}

process.exit(0);
