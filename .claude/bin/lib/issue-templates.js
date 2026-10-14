'use strict';

// Plantillas de reproduccion y propuesta por tipo de evento (datos puros, sin I/O).

function buildReproduction(type, event) {
  const pasos = {
    mcp_failure:   `1. Iniciar sesion en Claude Code con ai-core\n2. Ejecutar herramienta \`${event.tool}\`\n3. Observar fallo: ${event.error}`,
    hook_failure:  `1. Trigger del hook (PreToolUse / PostToolUse)\n2. Script \`${event.tool}\` falla con: ${event.error}`,
    skill_gap:     `1. Usuario solicita: "${event.context}"\n2. Ningun skill existente cubre el caso adecuadamente`,
    pattern:       `Patron repetido detectado en sesion ${event.session}:\n${event.context}`,
    harness_error: `Error inesperado durante ejecucion:\n${event.error}`,
  };
  return `## Reproduccion\n${pasos[type] || event.error}\n`;
}

function buildProposal(type, events) {
  const propuestas = {
    mcp_failure:   '## Propuesta\n- Verificar disponibilidad del servidor MCP\n- Revisar variables de entorno requeridas\n- Considerar fallback automatico al tier siguiente',
    hook_failure:  '## Propuesta\n- Agregar manejo de error en el script del hook\n- Verificar que la ruta del archivo existe antes de procesarlo\n- Revisar permisos del archivo',
    skill_gap:     '## Propuesta\n- Evaluar si se necesita un skill nuevo\n- O extender el skill existente mas cercano al caso\n- Ver criterio en CLAUDE.md: "Cuando crear un agente nuevo"',
    pattern:       `## Propuesta\n- Automatizar el patron repetido como comando o skill dedicado\n- Evaluar si requiere un agente autonomo (ver criterio en CLAUDE.md)`,
    harness_error: '## Propuesta\n- Revisar logs del hook correspondiente\n- Verificar version de Node.js (requiere >= 18)\n- Ejecutar: `npm test` para detectar regresion',
  };
  return propuestas[type] || '## Propuesta\n- Revisar el contexto del error y proponer corrección.';
}

module.exports = { buildReproduction, buildProposal };
