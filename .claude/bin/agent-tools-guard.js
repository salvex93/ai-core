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
 * Uso: node agent-tools-guard.js (recibe el evento PreToolUse por stdin)
 */

const fs   = require('fs');
const path = require('path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const AGENTS_DIR = process.env.AI_CORE_AGENTS_DIR || path.join(__dirname, '..', 'agents');

function leerScopeDeclarado(agentType) {
  const agentPath = path.join(AGENTS_DIR, `${agentType}.md`);
  if (!fs.existsSync(agentPath)) return null; // agente no reconocido (ej. Explore, general-purpose) -- no es de ai-core

  let contenido;
  try {
    contenido = fs.readFileSync(agentPath, 'utf8');
  } catch {
    return null;
  }

  const match = contenido.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const toolsMatch = match[1].match(/^tools:\s*\[([^\]]*)\]/m);
  if (!toolsMatch) return null; // sin scope declarado -- no restringe (retrocompatible)

  return toolsMatch[1].split(',').map((t) => t.trim()).filter(Boolean);
}

const evento    = leerEventoDeStdin();
const agentType = evento.agent_type || '';
const toolName  = evento.tool_name || '';

if (!agentType || !toolName) process.exit(0);

const scope = leerScopeDeclarado(agentType);
if (!scope) process.exit(0); // agente sin AGENT.md propio o sin tools: declarado -- no bloquea

if (!scope.includes(toolName)) {
  process.stderr.write(
    `[AGENT-TOOLS-GUARD] BLOQUEADO: el subagente "${agentType}" intento usar "${toolName}", fuera de su scope declarado [${scope.join(', ')}] en .claude/agents/${agentType}.md.\n`
  );
  process.exit(2);
}

process.exit(0);
