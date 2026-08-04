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
/**
 * Envuelve la invocacion de un hook propio con el Node.js Permission Model
 * (--permission, estable desde v22.13.0, aisla fs/child_process/red por
 * proceso) cuando corre en POSIX. En Windows se ejecuta igual que antes, sin
 * aislar: el spike de esta sesion encontro diferencias reales de
 * comportamiento de glob de --allow-fs-read entre shells de Windows (Git Bash
 * vs PowerShell con ** recursivo), sin verificacion equivalente aun para
 * cmd.exe -- hasta investigar ese matiz, el sandboxing queda acotado a
 * Linux/macOS, donde el comportamiento de glob del propio shell es uniforme.
 * settings.json se genera y se ejecuta en la misma maquina (nunca se
 * distribuye entre equipos), asi que leer la plataforma en build-time es
 * seguro.
 *
 * @param {string} script - ruta ya resuelta y citada del hook (salida de bin())
 * @param {{fsRead?: string[], fsWrite?: string[]}} permisos - patrones de
 *   ruta ya resueltos y citados (mismo formato que bin(), sin comillas extra)
 * @param {string} [platform] - process.platform o equivalente inyectable para tests
 * @returns {string} invocacion "node ..." lista para usar como command
 */
function nodeConPermiso(script, permisos = {}, platform = process.platform) {
  if (platform === 'win32') return `node ${script}`;

  const { fsRead = [], fsWrite = [] } = permisos;
  const flags = [
    '--permission',
    ...fsRead.map((p) => `--allow-fs-read=${p}`),
    ...fsWrite.map((p) => `--allow-fs-write=${p}`),
  ];
  return `node ${flags.join(' ')} ${script}`;
}

/**
 * Convierte la ruta citada de un directorio (salida de bin('')) en un glob
 * de una sola profundidad ("dir/*") para --allow-fs-read, preservando las
 * comillas envolventes que bin() ya agrega.
 *
 * @param {string} dirCitado - ej. `"/repo/.claude/bin"`
 * @returns {string} ej. `"/repo/.claude/bin/*"`
 */
function globDir(dirCitado) {
  return dirCitado.replace(/\/?"$/, '/*"');
}

function buildHooksSection(bin) {
  // Rutas de --allow-fs-read/--allow-fs-write confirmadas en el spike de esta
  // sesion para los 4 hooks prioritarios (destructive-op-guard.js no necesita
  // ninguna: solo lee stdin, un file descriptor ya abierto que el Permission
  // Model no restringe). "$TMPDIR" con fallback a /tmp es donde guard-report.js
  // escribe el JSONL de telemetria (os.tmpdir()) salvo que
  // AI_CORE_GUARD_REPORT_PATH lo redirija -- no acotarlo mas sin verificar esa
  // variable en runtime.
  const dirBin   = globDir(bin(''));
  const dirTmp   = '"${TMPDIR:-/tmp}/*"';
  const soloRead = { fsRead: [dirBin] };
  const readYWrite = { fsRead: [dirBin], fsWrite: [dirTmp] };

  return {
    UserPromptSubmit: [
      {
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} intent node ${bin('detect-role.js')} 2>/dev/null || true` },
          { type: 'command', command: `${nodeConPermiso(bin('secrets-guard.js'), readYWrite)} 2>/dev/null || true` },
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
          { type: 'command', command: `${nodeConPermiso(bin('injection-guard.js'), readYWrite)} 2>/dev/null || true` },
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
          { type: 'command', command: nodeConPermiso(bin('destructive-op-guard.js')) },
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
          { type: 'command', command: nodeConPermiso(bin('code-exec-guard.js'), soloRead) },
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

module.exports = { buildHooksSection, nodeConPermiso };
