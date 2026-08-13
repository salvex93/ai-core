#!/usr/bin/env node
'use strict';
/**
 * agent-tools-guard.js — Enforcement real de scope de herramientas por
 * subagente (Gobierno de Agentes, regla 2 de CLAUDE.md: "Permisos no
 * heredados... cada subagente que necesite herramientas debe tener su
 * scope declarado").
 *
 * Hasta ahora el frontmatter `tools:` de cada .claude/agents/*.md era
 * documentacion sin verificacion -- ningun hook comprobaba que la tool
 * call real de un subagente estuviera dentro de lo declarado.
 *
 * PreToolUse incluye agent_type en el JSON de stdin cuando la llamada
 * se origina dentro de un subagente (confirmado contra
 * code.claude.com/docs/en/hooks -- agent_type toma el valor del campo
 * `name` del frontmatter del subagente, no el nombre de archivo). Si
 * agent_type no esta presente, la tool call viene del hilo principal y
 * este guard no aplica.
 *
 * Bloqueo con permissionDecision:"deny" (exit 0 + JSON) en vez de exit 2 --
 * esto es friccion de configuracion estatica (que tools: declara el propio
 * AGENT.md), no un riesgo de seguridad activo. Claude ve la razon en el
 * mismo turno y puede reformular (usar otra herramienta ya declarada) sin
 * que el humano tenga que aprobar nada, siguiendo la recomendacion oficial
 * de Anthropic (code.claude.com/docs/en/hooks) para este tipo de friccion.
 *
 * Uso: node agent-tools-guard.js (recibe el evento PreToolUse por stdin)
 */

const path = require('path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');
const { leerFrontmatter, leerListaDeclarada } = require('./lib/agent-frontmatter');
const { denegarConRazon } = require('./lib/permission-decision');

const AGENTS_DIR = process.env.AI_CORE_AGENTS_DIR || path.join(__dirname, '..', 'agents');

function leerScopeDeclarado(agentType) {
  const frontmatter = leerFrontmatter(agentType, AGENTS_DIR);
  if (!frontmatter) return null; // agente no reconocido (ej. Explore, general-purpose) o traversal -- no es de ai-core
  return leerListaDeclarada(frontmatter, 'tools'); // null si sin scope declarado -- no restringe (retrocompatible)
}

const evento    = leerEventoDeStdin();
const agentType = evento.agent_type || '';
const toolName  = evento.tool_name || '';

if (!agentType || !toolName) process.exit(0);

const scope = leerScopeDeclarado(agentType);
if (!scope) process.exit(0); // agente sin AGENT.md propio o sin tools: declarado -- no bloquea

if (!scope.includes(toolName)) {
  process.stdout.write(denegarConRazon(
    'PreToolUse',
    `El subagente "${agentType}" intento usar "${toolName}", fuera de su scope declarado [${scope.join(', ')}] en .claude/agents/${agentType}.md.`
  ));
  process.exit(0);
}

process.exit(0);
