'use strict';

// Verificaciones posteriores a la ejecucion de herramientas. Recibe el contexto de perfiles de permisos de hooks-permissions.js.
function buildPostToolUseHooks({ bin, nodeConPermiso, soloRead, repoReadWrite, repoConGit }) {
  return {
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
          { type: 'command', command: `node ${bin('process-guard.js')} map ${nodeConPermiso(bin('diff-map-trigger.js'), repoConGit)} 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'Bash|Read|Write|Edit|Agent',
        hooks: [
          { type: 'command', command: `${nodeConPermiso(bin('agent-metrics.js'), repoReadWrite)} record --status ok 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} lint ${nodeConPermiso(bin('detox.js'), repoConGit)} 2>/dev/null || true` },
          { type: 'command', command: `${nodeConPermiso(bin('syntax-check.js'), soloRead)} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('process-guard.js')} lint ${nodeConPermiso(bin('standards-guard.js'), repoConGit)} "$CLAUDE_TOOL_INPUT_file_path"` },
          { type: 'command', command: `node ${bin('process-guard.js')} map ${nodeConPermiso(bin('diff-map-trigger.js'), repoConGit)} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('process-guard.js')} lint ${nodeConPermiso(bin('security-check.js'), soloRead)} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true` },
          // Red de seguridad git-native (patron Aider, hallazgo de auditoria
          // 2026-08-15): auto-commit a rama SEPARADA ai-core/checkpoints,
          // nunca a la rama real del usuario -- ver cabecera de
          // checkpoint-branch.js para el detalle de por que no usa `git
          // commit` normal ni toca el index real.
          { type: 'command', command: `${nodeConPermiso(bin('checkpoint-branch.js'), repoConGit)} 2>/dev/null || true` },
        ],
      },
    ],
  };
}

module.exports = { buildPostToolUseHooks };
