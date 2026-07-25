'use strict';
/**
 * hooks-definition.js — Fuente unica de verdad para la seccion "hooks" de
 * settings.json, usada tanto por setup-settings.js (ai-core standalone)
 * como por norm-harness.js (ai-core como submodulo en un proyecto anfitrion).
 *
 * Antes de este modulo, ambos scripts mantenian una copia paralela de la
 * misma definicion de hooks -- se desincronizaron: norm-harness.js quedo
 * sin subagent-guard.js, bash-verbosity-guard.js, memory-vault-prune-check.js
 * y sin cross-verify-gate.js/injection-guard.js en SubagentStop, porque cada
 * hook nuevo se agregaba solo en setup-settings.js.
 *
 * Uso: cada caller pasa su propia funcion bin(script) -> string citado con
 * la ruta absoluta correcta para su contexto (ai-core standalone o el
 * submodulo dentro del proyecto anfitrion).
 *
 * @param {(script: string) => string} bin - resuelve un nombre de script en
 *   .claude/bin/ a su ruta absoluta citada (ej. `"${path}"`).
 * @returns {object} seccion "hooks" completa para settings.json
 */
function buildHooksSection(bin) {
  return {
    UserPromptSubmit: [
      {
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} intent node ${bin('detect-role.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('secrets-guard.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('process-guard.js')} moa node ${bin('moa-context-gatherer.js')} 2>/dev/null || true` },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          { type: 'command', command: `node ${bin('session-summary.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('process-guard.js')} capture node ${bin('issue-reporter.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('aiops-score.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('memory-index-stop.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('memory-vault-prune-check.js')} 2>/dev/null || true` },
        ],
      },
    ],
    SubagentStop: [
      {
        hooks: [
          { type: 'command', command: `node ${bin('subagent-review.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('cross-verify-gate.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('injection-guard.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('subagent-grader.js')} 2>/dev/null || true` },
        ],
      },
    ],
    PostToolUseFailure: [
      {
        matcher: 'mcp__gemini-bridge__*',
        hooks: [
          { type: 'command', command: `echo "[MCP-FAIL] gemini-bridge fallo — usar tier Claude segun jerarquia de costo" >&2 && node ${bin('process-guard.js')} capture node ${bin('capture-event.js')} --type mcp_failure --tool gemini-bridge 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'mcp__anthropic-router__*',
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} capture node ${bin('capture-event.js')} --type mcp_failure --tool anthropic-router 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'Bash',
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} capture node ${bin('capture-event.js')} --type hook_failure --tool bash 2>/dev/null || true` },
        ],
      },
      {
        // Espejo de PostToolUse (linea ~133): PostToolUse y PostToolUseFailure
        // son mutuamente excluyentes, asi que sin esta entrada agent-metrics.js
        // nunca recibia --status fail para el grupo generico -- totals.fail
        // quedaba muerto por diseño y agent-report nunca reflejaba fallos reales.
        matcher: 'Bash|Read|Write|Edit|Agent',
        hooks: [
          { type: 'command', command: `node ${bin('agent-metrics.js')} record --status fail 2>/dev/null || true` },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: 'Bash(git push*)',
        hooks: [
          { type: 'command', command: `node ${bin('git-queue-advisor.js')} push 2>&1 || true` },
        ],
      },
      {
        matcher: 'Bash',
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} health node ${bin('health-check.js')} 2>&1 || true` },
          { type: 'command', command: `node ${bin('process-guard.js')} map node ${bin('validate-map.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('bash-verbosity-guard.js')}` },
        ],
      },
      {
        matcher: 'Read',
        hooks: [
          { type: 'command', command: `node ${bin('guard-read.js')} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: `node ${bin('ponytail-check.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('dependency-tracer.js')} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('pre-commit-tdd.js')} "$CLAUDE_TOOL_INPUT_file_path"` },
          { type: 'command', command: `node ${bin('code-exec-guard.js')}` },
        ],
      },
      {
        matcher: 'Agent',
        hooks: [
          { type: 'command', command: `node ${bin('subagent-guard.js')}` },
        ],
      },
      {
        matcher: 'mcp__.*',
        hooks: [
          { type: 'command', command: `node ${bin('circuit-breaker.js')} 2>&1 || true` },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Bash(git pull*)',
        hooks: [
          { type: 'command', command: `node ${bin('git-queue-advisor.js')} pull 2>&1 || true` },
        ],
      },
      {
        // git commit/push pueden dejar drift entre CONTEXT_MAP.json y el
        // arbol real (archivos nuevos en el commit que el mapa aun no
        // conoce) — ningun otro hook cubre este momento especifico.
        matcher: 'Bash(git commit*)|Bash(git push*)',
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} map node ${bin('diff-map-trigger.js')} 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'Bash|Read|Write|Edit|Agent',
        hooks: [
          { type: 'command', command: `node ${bin('agent-metrics.js')} record --status ok 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} lint node ${bin('detox.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('syntax-check.js')} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('process-guard.js')} lint node ${bin('standards-guard.js')} "$CLAUDE_TOOL_INPUT_file_path"` },
          { type: 'command', command: `node ${bin('process-guard.js')} map node ${bin('diff-map-trigger.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('process-guard.js')} lint node ${bin('security-check.js')} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true` },
        ],
      },
    ],
  };
}

module.exports = { buildHooksSection };
