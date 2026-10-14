'use strict';

// Eventos de sesion y fallos. Recibe el contexto de perfiles de permisos de hooks-permissions.js.
function buildSessionHooks({ bin, nodeConPermiso, soloRead, readYWrite, readYWriteSubagentLocks, breakGlassRW, repoReadWrite, repoConGit }) {
  return {
    UserPromptSubmit: [
      {
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} intent ${nodeConPermiso(bin('detect-role.js'), soloRead)} 2>/dev/null || true` },
          // repoReadWrite (no readYWrite): ambos usan lib/break-glass.js, que
          // escribe el log de auditoria en .claude/BREAK_GLASS_LOG.jsonl
          // (dentro del repo, no en $TMPDIR) -- con solo fsWrite a $TMPDIR el
          // log fallaba en silencio (catch dentro de registrarUso(), no
          // rompe el guard pero pierde el rastro de auditoria sin avisar).
          { type: 'command', command: nodeConPermiso(bin('secrets-guard.js'), breakGlassRW) },
          { type: 'command', command: nodeConPermiso(bin('jailbreak-guard.js'), breakGlassRW) },
          { type: 'command', command: `node ${bin('process-guard.js')} moa ${nodeConPermiso(bin('moa-context-gatherer.js'), repoReadWrite)} 2>/dev/null || true` },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          { type: 'command', command: `${nodeConPermiso(bin('session-summary.js'), repoConGit)} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('process-guard.js')} capture ${nodeConPermiso(bin('issue-reporter.js'), repoConGit)} 2>/dev/null || true` },
          { type: 'command', command: `${nodeConPermiso(bin('aiops-score.js'), repoConGit)} 2>/dev/null || true` },
          { type: 'command', command: `${nodeConPermiso(bin('memory-index-stop.js'), repoConGit)} 2>/dev/null || true` },
          { type: 'command', command: `${nodeConPermiso(bin('memory-vault-prune-check.js'), repoReadWrite)} 2>/dev/null || true` },
        ],
      },
    ],
    SubagentStop: [
      {
        hooks: [
          { type: 'command', command: `${nodeConPermiso(bin('subagent-review.js'), soloRead)} 2>/dev/null || true` },
          { type: 'command', command: `${nodeConPermiso(bin('cross-verify-gate.js'), repoConGit)} 2>/dev/null || true` },
          { type: 'command', command: `${nodeConPermiso(bin('injection-guard.js'), readYWrite)} 2>/dev/null || true` },
          { type: 'command', command: `${nodeConPermiso(bin('subagent-grader.js'), soloRead)} 2>/dev/null || true` },
          { type: 'command', command: `${nodeConPermiso(bin('subagent-guard-release.js'), readYWriteSubagentLocks)} 2>/dev/null || true` },
        ],
      },
    ],
    PostToolUseFailure: [
      {
        matcher: 'mcp__gemini-bridge__*',
        hooks: [
          { type: 'command', command: `echo "[MCP-FAIL] gemini-bridge fallo — usar tier Claude segun jerarquia de costo" >&2 && node ${bin('process-guard.js')} capture ${nodeConPermiso(bin('capture-event.js'), repoReadWrite)} --type mcp_failure --tool gemini-bridge 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'mcp__anthropic-router__*',
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} capture ${nodeConPermiso(bin('capture-event.js'), repoReadWrite)} --type mcp_failure --tool anthropic-router 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'Bash',
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} capture ${nodeConPermiso(bin('capture-event.js'), repoReadWrite)} --type hook_failure --tool bash 2>/dev/null || true` },
        ],
      },
      {
        // Espejo de PostToolUse (linea ~133): PostToolUse y PostToolUseFailure
        // son mutuamente excluyentes, asi que sin esta entrada agent-metrics.js
        // nunca recibia --status fail para el grupo generico -- totals.fail
        // quedaba muerto por diseño y agent-report nunca reflejaba fallos reales.
        matcher: 'Bash|Read|Write|Edit|Agent',
        hooks: [
          { type: 'command', command: `${nodeConPermiso(bin('agent-metrics.js'), repoReadWrite)} record --status fail 2>/dev/null || true` },
        ],
      },
    ],
  };
}

module.exports = { buildSessionHooks };
