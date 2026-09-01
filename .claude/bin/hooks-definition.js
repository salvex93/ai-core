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
 * proceso). Universal en las 3 plataformas: un spike anterior encontro que
 * el glob de --allow-fs-read se comportaba distinto entre Git Bash y
 * PowerShell en Windows, y quedo excluido de esa plataforma hasta
 * verificar el shell real que Claude Code invoca por defecto -- confirmado
 * en una sesion posterior contra cmd.exe real (el shell por defecto de
 * Windows sin configuracion adicional, mismo comportamiento de
 * spawnSync/exec de Node sin shell explicito): la misma sintaxis de glob
 * (una estrella y recursivo con **) funciona igual que en POSIX, incluyendo
 * --allow-child-process para los hooks que invocan git. settings.json se
 * genera y se ejecuta en la misma maquina (nunca se distribuye entre
 * equipos), asi que el flag de --permission siempre aplica sin logica
 * condicional por plataforma.
 *
 * @param {string} script - ruta ya resuelta y citada del hook (salida de bin())
 * @param {{fsRead?: string[], fsWrite?: string[]}} permisos - patrones de
 *   ruta ya resueltos y citados (mismo formato que bin(), sin comillas extra)
 * @param {string} [platform] - process.platform, no usado hoy pero se
 *   mantiene inyectable para tests y por si un shell nuevo (ej. si Claude
 *   Code cambia su invocacion por defecto en Windows) requiere excepcion futura.
 * @returns {string} invocacion "node ..." lista para usar como command
 */
function nodeConPermiso(script, permisos = {}, platform = process.platform) {
  const { fsRead = [], fsWrite = [], childProcess = false } = permisos;
  const flags = [
    '--permission',
    ...fsRead.map((p) => `--allow-fs-read=${p}`),
    ...fsWrite.map((p) => `--allow-fs-write=${p}`),
    ...(childProcess ? ['--allow-child-process'] : []),
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

/**
 * @param {(script: string) => string} bin - ver cabecera del modulo.
 * @param {string} [tmpDirReal] - valor real de os.tmpdir(), resuelto por el
 *   caller (setup-settings.js/norm-harness.js) en el mismo proceso Node que
 *   luego ejecutara los guards -- evita depender de que un shell externo
 *   expanda "${TMPDIR:-/tmp}" con el mismo valor que ve Node internamente.
 *   Sin este argumento, cae al literal POSIX anterior (retrocompatible).
 */
function buildHooksSection(bin, tmpDirReal) {
  // Rutas de --allow-fs-read/--allow-fs-write auditadas hook por hook (leyendo
  // que cada uno realmente hace, no por analogia): todos los hooks propios
  // viven en .claude/bin/ y su unico require relativo real es ./lib/* dentro
  // del mismo directorio -- el glob de una sola profundidad (dirBin) ya cubre
  // eso. dirTmp usa el tmpDir REAL resuelto por el caller cuando esta
  // disponible -- bug real de CI (2026-08-14): el literal
  // '"${TMPDIR:-/tmp}/*"' depende de que el shell que invoca el comando
  // expanda esa sintaxis POSIX antes de pasarsela a Node. En macOS runners de
  // GitHub Actions, $TMPDIR real no es /tmp (tipicamente
  // /var/folders/xx/xxxxx/T/, con o sin el prefijo /private/ segun
  // resolucion de symlink), y el patron declarado podia no coincidir con la
  // ruta real donde Node escribe/lee via os.tmpdir(), causando
  // ERR_ACCESS_DENIED especifico de esa plataforma -- Ubuntu no lo sufria
  // porque ahi $TMPDIR tipicamente cae al mismo /tmp literal del fallback.
  // dirRepo cubre lecturas/escrituras a archivos propios del repo fuera de
  // .claude/bin/ (ej. .claude/AGENT_METRICS.json, .claude/EVENTS_QUEUE.json,
  // .claude/moa_context.md, CONTEXT_MAP.json) que varios hooks leen/escriben.
  const dirBin  = globDir(bin(''));
  const dirTmp  = tmpDirReal ? `"${tmpDirReal.replace(/\/$/, '')}/*"` : '"${TMPDIR:-/tmp}/*"';
  const dirRepo = '"${PWD}/**"';
  // Locks de subagent-guard.js/-release.js viven dos niveles bajo el tmpdir
  // real (tmp/ai-core-locks/subagents/*.lock) -- bug real confirmado en
  // sesion 2026-08-15 verificando el Node Permission Model en vivo (no solo
  // con tests): dirTmp (glob de UN solo nivel) nunca cubrio esa profundidad,
  // ni para lectura ni para escritura, con directorio preexistente o no.
  // subagent-guard.js jamas pudo escribir su lock, y -release.js jamas pudo
  // borrarlo -- el TTL de 2 minutos (subagent-guard.js) era la UNICA
  // garantia real de liberacion en produccion, el release documentado en el
  // codigo nunca funciono.
  const dirTmpSubagentLocks = tmpDirReal
    ? `"${tmpDirReal.replace(/\/$/, '')}/ai-core-locks/subagents/*"`
    : '"${TMPDIR:-/tmp}/ai-core-locks/subagents/*"';
  // Mismo bug de glob de un solo nivel que dirTmpSubagentLocks arriba --
  // tool-repeat-guard.js escribe su estado dos niveles bajo el tmpdir real
  // (tmp/ai-core-locks/tool-repeat/*.json), dirTmp generico nunca lo cubriria.
  const dirTmpToolRepeat = tmpDirReal
    ? `"${tmpDirReal.replace(/\/$/, '')}/ai-core-locks/tool-repeat/*"`
    : '"${TMPDIR:-/tmp}/ai-core-locks/tool-repeat/*"';

  const soloRead      = { fsRead: [dirBin] };
  const soloLeerRepo  = { fsRead: [dirBin, dirRepo] };
  const readYWrite    = { fsRead: [dirBin], fsWrite: [dirTmp] };
  const readYWriteSubagentLocks = { fsRead: [dirBin, dirTmpSubagentLocks], fsWrite: [dirTmpSubagentLocks] };
  const readYWriteToolRepeat = { fsRead: [dirBin, dirTmpToolRepeat], fsWrite: [dirTmpToolRepeat] };
  // dirTmp tambien en fsRead (no solo fsWrite): los guards de break-glass
  // (lib/break-glass.js) escriben su lock en os.tmpdir() y despues necesitan
  // RELEERLO (fs.readFileSync/fs.existsSync) para confirmarlo -- bug real en
  // produccion (2026-08-14): con dirTmp solo en fsWrite, el Node Permission
  // Model dejaba escribir el lock pero bloqueaba su lectura posterior con
  // ERR_ACCESS_DENIED, y el catch silencioso de lib/break-glass.js absorbia
  // el error devolviendo false -- el mecanismo generaba un id real pero
  // NINGUN CONFIRMAR-<id> llegaba a autorizar nada, sin ningun aviso visible.
  const breakGlassRW = { fsRead: [dirBin, dirRepo, dirTmp], fsWrite: [dirRepo, dirTmp] };
  const repoReadWrite = { fsRead: [dirBin, dirRepo], fsWrite: [dirRepo, dirTmp] };
  // git status/diff/log/rev-parse/ls-files -- ningun hook de esta lista
  // ejecuta escritura via git (commit/push/reset quedan bloqueados aparte por
  // destructive-op-guard.js, que corre ANTES en la misma cadena de PreToolUse).
  const repoConGit = { fsRead: [dirBin, dirRepo], fsWrite: [dirRepo, dirTmp], childProcess: true };

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
          { type: 'command', command: `${nodeConPermiso(bin('guard-read.js'), repoReadWrite)} "$CLAUDE_TOOL_INPUT_file_path"` },
        ],
      },
      {
        // Fuerza mcp__gemini-bridge__buscar_web (tier 0 gratuito) en vez de
        // WebSearch/WebFetch nativos -- mismo patron y permisos que
        // guard-read.js (regla GEMINI PRIMERO, enforcement real en vez de
        // solo prosa en CLAUDE.md, gap cerrado 2026-09-01).
        matcher: 'WebSearch|WebFetch',
        hooks: [
          { type: 'command', command: nodeConPermiso(bin('web-search-guard.js'), repoReadWrite) },
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

module.exports = { buildHooksSection, nodeConPermiso };
