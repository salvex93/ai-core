'use strict';

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
function buildPermissionProfiles(bin, tmpDirReal) {
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
  // Mismo bug de glob de un solo nivel -- subagent-budget-guard.js y
  // loop-alternante-guard.js escriben su estado dos niveles bajo el tmpdir
  // real, cada uno en su propio subdirectorio.
  const dirTmpBudget = tmpDirReal
    ? `"${tmpDirReal.replace(/\/$/, '')}/ai-core-locks/subagent-budget/*"`
    : '"${TMPDIR:-/tmp}/ai-core-locks/subagent-budget/*"';
  // El marcador de cuota de Gemini vive dos niveles bajo el tmpdir real
  // (mismo limite del glob de un nivel de dirTmp que los locks de arriba).
  const dirTmpCuota = tmpDirReal
    ? `"${tmpDirReal.replace(/\/$/, '')}/ai-core-locks/gemini-cuota/*"`
    : '"${TMPDIR:-/tmp}/ai-core-locks/gemini-cuota/*"';
  const dirTmpAlternante = tmpDirReal
    ? `"${tmpDirReal.replace(/\/$/, '')}/ai-core-locks/loop-alternante/*"`
    : '"${TMPDIR:-/tmp}/ai-core-locks/loop-alternante/*"';

  const soloRead      = { fsRead: [dirBin] };
  const soloLeerRepo  = { fsRead: [dirBin, dirRepo] };
  // Lee contenido arbitrario del repo (ej. .claude/skills/**) y escribe solo
  // el reporte tipado de guard-report.js al tmpdir -- sin fsWrite a dirRepo,
  // a diferencia de repoReadWrite, porque un guard de solo escaneo (advierte,
  // nunca modifica el archivo que audita) no necesita ni debe poder escribir
  // en el repo.
  const repoLeerYReportar = { fsRead: [dirBin, dirRepo], fsWrite: [dirTmp] };
  const readYWrite    = { fsRead: [dirBin], fsWrite: [dirTmp] };
  const readYWriteSubagentLocks = { fsRead: [dirBin, dirTmpSubagentLocks], fsWrite: [dirTmpSubagentLocks] };
  const readYWriteToolRepeat = { fsRead: [dirBin, dirTmpToolRepeat], fsWrite: [dirTmpToolRepeat] };
  const readYWriteBudget = { fsRead: [dirBin, dirTmpBudget], fsWrite: [dirTmpBudget] };
  const readYWriteAlternante = { fsRead: [dirBin, dirTmpAlternante], fsWrite: [dirTmpAlternante] };
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
  const repoReadWriteCuota = { fsRead: [dirBin, dirRepo, dirTmpCuota], fsWrite: [dirRepo, dirTmp] };
  // git status/diff/log/rev-parse/ls-files -- ningun hook de esta lista
  // ejecuta escritura via git (commit/push/reset quedan bloqueados aparte por
  // destructive-op-guard.js, que corre ANTES en la misma cadena de PreToolUse).
  const repoConGit = { fsRead: [dirBin, dirRepo], fsWrite: [dirRepo, dirTmp], childProcess: true };

  return { dirBin, dirTmp, dirRepo, dirTmpSubagentLocks, dirTmpToolRepeat, dirTmpBudget, dirTmpAlternante, soloRead, soloLeerRepo, readYWrite, readYWriteSubagentLocks, readYWriteToolRepeat, readYWriteBudget, readYWriteAlternante, breakGlassRW, repoReadWrite, repoReadWriteCuota, repoConGit, repoLeerYReportar };
}

module.exports = { nodeConPermiso, globDir, buildPermissionProfiles };
