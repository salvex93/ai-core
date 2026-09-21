'use strict';

// Guards previos a la ejecucion de herramientas. Recibe el contexto de perfiles de permisos de hooks-permissions.js.
function buildPreToolUseHooks({ bin, nodeConPermiso, soloRead, soloLeerRepo, readYWriteSubagentLocks, readYWriteToolRepeat, readYWriteBudget, readYWriteAlternante, breakGlassRW, repoReadWrite, repoReadWriteCuota, repoConGit }) {
  return {
    PreToolUse: [
      {
        // Cuarentena real de prompt injection detectado por injection-guard.js
        // en SubagentStop -- corre primero, antes de cualquier otro guard de
        // esta lista, porque bloquea la accion sin importar cual sea.
        matcher: 'Bash|Write|Edit',
        hooks: [
          { type: 'command', command: nodeConPermiso(bin('injection-quarantine-guard.js'), soloRead) },
        ],
      },
      {
        matcher: 'Bash(git push*)',
        hooks: [
          { type: 'command', command: `node ${bin('git-queue-advisor.js')} push 2>&1 || true` },
        ],
      },
      {
        matcher: 'Bash',
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} health ${nodeConPermiso(bin('health-check.js'), repoConGit)} 2>&1 || true` },
          { type: 'command', command: `node ${bin('process-guard.js')} map ${nodeConPermiso(bin('validate-map.js'), repoConGit)} 2>/dev/null || true` },
          { type: 'command', command: nodeConPermiso(bin('bash-verbosity-guard.js'), soloRead) },
          // repoReadWrite (no soloRead): desde que usa lib/break-glass.js,
          // el guard necesita leer .claude/bin/lib/* (el require del modulo)
          // y escribir tanto en $TMPDIR (locks de break-glass) como en el
          // repo (.claude/BREAK_GLASS_LOG.jsonl). Bug real encontrado en
          // produccion: sin este permiso, --permission del Node Permission
          // Model bloqueaba el require con ERR_ACCESS_DENIED, el guard salia
          // con exit 1 (no 2), y Claude Code trataba cualquier exit distinto
          // de 2 como "no bloqueante" -- el rm -rf pasaba sin bloquear pese
          // a que el guard "existia".
          { type: 'command', command: nodeConPermiso(bin('destructive-op-guard.js'), breakGlassRW) },
        ],
      },
      {
        matcher: 'Read',
        hooks: [
          { type: 'command', command: `${nodeConPermiso(bin('guard-read.js'), repoReadWriteCuota)} "$CLAUDE_TOOL_INPUT_file_path"` },
        ],
      },
      {
        // Fuerza mcp__gemini-bridge__buscar_web (tier 0 gratuito) en vez de
        // WebSearch/WebFetch nativos -- mismo patron y permisos que
        // guard-read.js (regla GEMINI PRIMERO, enforcement real en vez de
        // solo prosa en CLAUDE.md, gap cerrado 2026-09-01).
        matcher: 'WebSearch|WebFetch',
        hooks: [
          { type: 'command', command: nodeConPermiso(bin('web-search-guard.js'), repoReadWriteCuota) },
        ],
      },
      {
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: `${nodeConPermiso(bin('agent-snapshot.js'), repoReadWrite)} 2>/dev/null || true` },
          { type: 'command', command: `${nodeConPermiso(bin('ponytail-check.js'), soloRead)} 2>/dev/null || true` },
          { type: 'command', command: `${nodeConPermiso(bin('dependency-tracer.js'), repoReadWrite)} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true` },
          { type: 'command', command: `${nodeConPermiso(bin('pre-commit-tdd.js'), repoConGit)} "$CLAUDE_TOOL_INPUT_file_path"` },
          // repoReadWrite (no soloRead): usa lib/break-glass.js -- ver nota
          // de destructive-op-guard.js mas arriba en este mismo archivo.
          { type: 'command', command: nodeConPermiso(bin('code-exec-guard.js'), breakGlassRW) },
        ],
      },
      {
        matcher: 'Agent',
        hooks: [
          { type: 'command', command: nodeConPermiso(bin('subagent-guard.js'), readYWriteSubagentLocks) },
        ],
      },
      {
        // Deteccion de loop: misma tool + mismos argumentos repetidos sin
        // avanzar, dentro de un mismo agente (hilo principal o subagente).
        // Complementa a subagent-guard.js (fan-out y recursion de spawn) --
        // este guard cubre el caso de un UNICO agente atascado reintentando
        // ciegamente. Excluye Read/Grep/Glob internamente (bajo riesgo).
        matcher: 'Bash|Write|Edit|Agent',
        hooks: [
          { type: 'command', command: nodeConPermiso(bin('tool-repeat-guard.js'), readYWriteToolRepeat) },
        ],
      },
      {
        // Capas 1 y 2 de defensa contra runaway de subagentes (investigacion
        // 2026-09-02, post-mortem real vectara/awesome-agent-failures:
        // pipeline en loop 264h, $47k, solo detectado por billing). Solo
        // aplican cuando agent_type esta presente (dentro de un subagente),
        // ambos guards salen de inmediato en el hilo principal. Matcher
        // amplio: necesitan ver TODAS las tool calls del subagente, no solo
        // las mutantes, para contar presupuesto real y detectar el patron
        // alternante que puede incluir Read/Grep.
        matcher: 'Bash|Write|Edit|Read|Grep|Glob|WebFetch|Agent',
        hooks: [
          { type: 'command', command: nodeConPermiso(bin('subagent-budget-guard.js'), readYWriteBudget) },
          { type: 'command', command: nodeConPermiso(bin('loop-alternante-guard.js'), readYWriteAlternante) },
        ],
      },
      {
        // Enforcement de scope de herramientas por subagente (Gobierno de
        // Agentes, regla 2 de CLAUDE.md). agent_type solo esta presente en
        // el evento cuando la tool call se origina dentro de un subagente
        // -- sin efecto sobre el hilo principal. Cubre TODAS las
        // herramientas que un AGENT.md puede declarar en tools: (Grep/Glob/
        // WebFetch incluidos: mcp-registry-navigator, aiops-auditor,
        // code-reviewer y security-scanner las declaran) -- antes solo
        // cubria Bash/Read/Write/Edit, dejando sin enforcement real a 6 de
        // los 7 agentes para el resto de su scope declarado.
        matcher: 'Bash|Read|Write|Edit|Grep|Glob|WebFetch|Agent',
        hooks: [
          { type: 'command', command: nodeConPermiso(bin('agent-tools-guard.js'), soloLeerRepo) },
          { type: 'command', command: nodeConPermiso(bin('agent-paths-guard.js'), soloLeerRepo) },
          // repoReadWrite (no soloRead): usa lib/break-glass.js -- ver nota
          // de destructive-op-guard.js mas arriba en este mismo archivo.
          { type: 'command', command: nodeConPermiso(bin('mutating-action-guard.js'), breakGlassRW) },
        ],
      },
      {
        matcher: 'mcp__.*',
        hooks: [
          { type: 'command', command: `${nodeConPermiso(bin('circuit-breaker.js'), repoReadWrite)} 2>&1 || true` },
          // repoReadWrite (no soloRead): usa lib/break-glass.js -- ver nota
          // de destructive-op-guard.js mas arriba en este mismo archivo.
          { type: 'command', command: nodeConPermiso(bin('mutating-action-guard.js'), breakGlassRW) },
        ],
      },
    ],
  };
}

module.exports = { buildPreToolUseHooks };
