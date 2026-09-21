# Auditoria de gobierno, coherencia, alcance y estabilidad — AI-CORE v3.40.1

Fecha: 2026-09-21. Alcance: hooks, permisos, skills, agentes, tests y comparacion con arneses del mercado. Documento interno.

## 1. Estado medido (verificable con los comandos indicados)

| Dimension | Resultado | Comando |
|---|---|---|
| Suite de tests | 1488 tests, 1487 pass, 0 fail, 1 skip | `npm test` |
| Conformidad de skills | 45/45, 0 criticos, 0 altos | `npm run validate-globals` |
| Vigencia de mercado | sin hallazgos STALE, 45/45 skills con dominio registrado | `npm run audit-market -- --only-stale` |
| Hooks activos | 45 (PreToolUse 22, PostToolUse 9, Stop 5, SubagentStop 5, UserPromptSubmit 4, PostToolUseFailure 4) | `.claude/settings.json` |
| Codigo fuente sobre 300 lineas | 0 archivos (antes: 5) | `wc -l` sobre `.js` |
| Definicion de hooks | una sola fuente (`hooks-definition.js`), salida byte a byte identica tras la division | comparacion contra baseline |
| Permisos base | una sola fuente (`lib/base-permissions.js`), antes duplicada en dos scripts | `setup-settings.js`, `norm-harness.js` |

## 2. Hallazgos corregidos en esta pasada

1. Test de `issue-reporter` fallaba en macOS/Linux: el fake `gh` copiaba `process.execPath`, y el node de Homebrew esta enlazado dinamicamente (`@rpath/libnode`), por lo que mover el binario lo rompe. Ahora es un wrapper `sh`. Sin cambio en el script bajo prueba.
2. Emoji literal en `CHANGELOG.md` (violacion de la regla critica 1), reemplazado por texto.
3. Cinco archivos `.js` sobre el limite de 300 lineas: `mcp-anthropic.js`, `issue-reporter.js`, `destructive-op-guard.js`, `norm-harness.js`, `hooks-definition.js`. Division en modulos por responsabilidad, sin cambio de comportamiento.
4. Duplicacion de listas de permisos entre `setup-settings.js` y `norm-harness.js` (riesgo de drift silencioso): unificada.
5. Vigencia: `ciso` y `product-lifecycle-orchestrator` no tenian dominio en `MARKET_STANDARDS.json`.
6. Error propio detectado y corregido durante la verificacion: la extraccion de `norm-harness.js` dejo `ensureHostClaude` y `ensureHostGitignore` sin exportar, lo que rompia 12 tests. La suite completa lo detecto antes de cerrar.

## 3. Brechas (G1, G2, G6, G11, G13, G15 y G17 resueltas; el resto requiere ejecucion; hallazgos posteriores en la seccion 7)

| Id | Brecha | Evidencia | Propuesta |
|---|---|---|---|
| G1 | RESUELTA. `Bash(git push*)` se mantiene en `allow` por decision del usuario; la publicacion queda condicionada al marco de calidad via hook git `.githooks/pre-push` (`scripts/quality-gate.js`). El bypass del hook esta bajo break-glass. | `npm run quality-gate`, regla 11 de Gobierno en CLAUDE.md | Ninguna |
| G2 | RESUELTA. `DENY_PERMISSIONS` (fuente unica en `lib/base-permissions.js`) aplica `Read`/`Edit` deny a `.env` y variantes, `*.pem|*.key|*.p12|*.pfx`, y `Read` a claves SSH privadas y credenciales de aws/gh/npm/netrc; lo consumen `setup-settings`, `buildSettingsForHost`, `mergeHostSettings` y `norm-harness`. Hallazgo original: `permissions.deny` y `ask` vacios, todo el control preventivo dependia de hooks. Sin `ask`: no hay operacion que convenga confirmar en vez de bloquear | 9 tests; `Read` de un `.env.local` ficticio denegado en vivo | Ninguna. Nota: un `rm` sobre un `.env.local` tambien fue denegado (la regla cubre `rm`, no solo Read/Edit) |
| G3 | EVALUADA, NO ACTIVADA. Verificada la clave `sandbox` (`enabled`, `autoAllowBashIfSandboxed`, `filesystem`, `network`, `excludedCommands`). Con el sandbox activo, `.claude/skills|agents|hooks`, `.mcp.json`, `.git/hooks` y `.git/config` quedan de solo lectura para Bash, lo que rompe `npm run setup`, `rollback-*` y el pre-push (hereda restricciones); `gh` y TLS requieren `excludedCommands` | `docs/en/sandboxing` | Decision del usuario: activar con `excludedCommands` acotados, o mantener Docker opcional (`npm run sandbox`) |
| G4 | 5 SKILL.md superan 500 lineas (backend-architect 1698, tech-lead-frontend 1088, web-scraping-specialist 1006, ux-visual-designer 626, mcp-server-builder 606). agentskills.io recomienda menos de 500 lineas y detalle en `references/` (divulgacion progresiva) | `wc -l` | Dividir en SKILL.md (nucleo + indice) y `references/*.md`. CLAUDE.md exime hoy a los `.md`; enmendar esa exencion |
| G5 | Campos `origin`, `version`, `last_updated`, `rol` fuera de `metadata` en el frontmatter. La especificacion define `metadata` como mapa string a string para campos propios | spec agentskills.io | Migrar bajo `metadata` y ajustar `validate-globals`, `audit-market` y evals |
| G6 | RESUELTA. Los 5 tests se dividieron por describe en 12 archivos (todos bajo 300 lineas; conteo de tests preservado; 1446 en total tras G11). El limite se hace cumplir ahora tambien en pre-push. | `quality-gate.js --fast` | Ninguna |
| G7 | Log de auditoria (`BREAK_GLASS_LOG.jsonl`, metricas) sin cadena de hash ni exportacion estandar | inspeccion | Cadena de hash por entrada (evidencia de manipulacion) y exportacion OpenTelemetry opcional |
| G8 | Sin escaner de contenido de skills al instalarse o modificarse | no existe hook | Escaner estatico (patrones de inyeccion, exfiltracion, comandos destructivos) como PostToolUse sobre `.claude/skills/**` |
| G9 | Escrituras a memoria y skills sin compuerta de aprobacion | `agent-snapshot` respalda pero no pide confirmacion | Compuerta tipo break-glass para escrituras del hilo principal en `.claude/skills/**` y vault |
| G10 | 6 dominios cerca del umbral de vigencia (mcp-protocol a 55 dias; cinco dominios de 2026-08-04 a 48 dias) | `audit-market` | CERRADO 2026-09-21: los 6 dominios reverificados contra fuente primaria (`curl` directo, el bridge de Gemini sin cuota). Cambios de contenido: OpenAPI 3.2.1 (2026-09-10) en `qa-engineer`, limite de Worker de Cloudflare (64 MiB sin comprimir, sin limite comprimido) en `cloud-deployment-specialist`; la comision de Lemon Squeezy queda marcada como no reconfirmada en `saas-product-architect` |
| G11 | RESUELTA. `web-search-guard.js` y `guard-read.js` denegaban la tool nativa aunque el bridge respondiera 429. `scripts/mcp-gemini.js` escribe ahora un marcador con TTL de 10 min (`lib/gemini-cuota.js`) ante 429/RESOURCE_EXHAUSTED y ambos guards degradan a la tool nativa mientras este vigente. Verificado bajo el Node Permission Model real (perfil `repoReadWriteCuota`) | 10 tests en `gemini-cuota-guards-degradacion.test.js` | Ninguna. Abierto: evaluar proveedor alterno para `buscar_web` |
| G12 | `mcpServers` dentro de `settings.json` no carga los servidores; la ubicacion efectiva es `.mcp.json` o `~/.claude.json` (inferido, sin verificar en documentacion). `setup-settings.js` y `norm-harness.js` generan una clave sin efecto y `health-check.js` la lee | vault, sesion 2026-09-20 | Verificar en fuente primaria y generar `.mcp.json` desde un modulo compartido (patron `hooks-definition.js`); ajustar `health-check.js` y tests |
| G13 | RESUELTA. `.githooks/commit-msg` y `pre-commit` (via `check-commit.js`) y `setup-settings` fija la identidad local si falta. Hallazgo original: identidad git sin configurar en el repo: los commits de `ai-core/checkpoints` salieron con email de maquina, contra la regla de commits. La identidad depende de un paso manual y nada la verifica | `git log ai-core/checkpoints` | `setup-settings`/`norm-harness` fijan identidad local solo si esta vacia; `.githooks/commit-msg` (rechaza `Co-Authored-By` y menciones a IA) y `pre-commit` (identidad valida): control determinista tambien para commits humanos |
| G14 | `destructive-op-guard` bloquea texto literal dentro de argumentos (un script con la cadena del bypass del hook pre-push fue denegado aunque no ejecutaba nada) | sesion 2026-09-20 | Evaluar ignorar cuerpos de heredoc y argumentos de `node -e`; riesgo de abrir evasiones, exige tests adversariales. Alternativa: dejar como esta y escribir scripts con Write |
| G15 | RESUELTA. `claude-md-cifras-vs-codigo.test.js` cubre reglas break-glass, skills y agentes (el conteo de tests no se compara: la suite no puede contarse a si misma). Hallazgo original: cifras fijas en CLAUDE.md quedan obsoletas sin aviso: decia 11 reglas break-glass cuando el codigo tenia 12 y hoy son 13; conteo de tests y de skills igual | `grep -c "breakGlass: true"` | Test que compare las cifras de CLAUDE.md contra el codigo (reglas break-glass, skills, agentes), o eliminar las cifras |
| G16 | El gate no cubre: archivos residuales (`*.new`, `*.orig`), secretos en el working tree, ni el limite de 500 lineas de SKILL.md (pendiente de G4) | `.new` residuales detectados al inicio de la sesion | Agregar los tres checks a `quality-gate.js` (el de SKILL.md solo tras completar G4) |
| G17 | RESUELTA. Los hooks de `UserPromptSubmit` leian el texto del usuario de `prompt_text` o `CLAUDE_USER_PROMPT`; Claude Code envia el campo `prompt` y nunca establece esa variable. `jailbreak-guard`, `secrets-guard`, `detect-role` y `moa-context-gatherer` recibian cadena vacia: no bloqueaban nada y `CONFIRMAR-<id>` jamas llegaba al break-glass, por lo que ninguna operacion de alto nivel se podia autorizar. Los tests pasaban porque inyectaban `CLAUDE_USER_PROMPT` o `prompt_text`, rutas inexistentes en produccion | captura real del payload con `claude -p --settings` | `lib/hook-stdin.js` expone `extraerPrompt`/`leerPromptDeUsuario` (lee `prompt`); 4 consumidores migrados; 9 tests con el payload real incluido el flujo bloqueo, confirmacion, reintento unico y log. Tests aislados del tmpdir real de break-glass. Pendiente: verificar con captura real los campos de SubagentStop, Stop y PostToolUseFailure |

## 4. Comparacion con arneses del mercado

La comparacion proviene de investigacion web asistida. Lo no confirmado contra fuente primaria esta rotulado.

| Capacidad | AI-CORE | Mercado | Estado |
|---|---|---|---|
| Control preventivo local (hooks bloqueantes, break-glass de un solo uso con TTL y registro) | 45 hooks, 13 reglas con break-glass, hard-stops sin excepcion | Codex CLI, Gemini CLI y Claude Code lideran en control local | Al nivel |
| Modos de aprobacion configurables por usuario | Fijos por hook; no hay modo `smart/manual/off` | Hermes: `smart`, `manual`, `off`, politica `cron_mode: deny` (segun investigacion, no verificado en fuente primaria) | Brecha menor |
| Evals de skills | promptfoo 45/45 | No confirmado en otros arneses | Diferenciador |
| Observabilidad estructurada | Metricas propias en JSON | OpenHands lidera con OpenTelemetry | Brecha (G7) |
| Escaner de skills | No existe | Hermes: Skills Guard (segun investigacion) | Brecha (G8) |
| Telemetria y curacion de skills | `validate-globals`, `audit-market`, `eval-skills` | Hermes: Curator con telemetria de uso (segun investigacion) | Parcial |
| Aprobacion de escritura a memoria/skills | Snapshot y checkpoint, sin compuerta | Hermes: aprobacion de escritura | Brecha (G9) |
| Sandbox | Docker opcional; sin sandbox nativo activo | Varios arneses con sandbox por defecto | Brecha (G3) |
| Cumplimiento del estandar de skills | Conforme en campos obligatorios; 5 skills sobre 500 lineas; campos propios fuera de `metadata` | agentskills.io | Parcial (G4, G5) |

## 5. Escalabilidad y estabilidad

- Modularidad restaurada: ningun `.js` de codigo sobre 300 lineas. Cada evento de hook tiene su modulo (`lib/hooks-events-*.js`) y los perfiles de permiso Node estan aislados en `lib/hooks-permissions.js`. Agregar un hook sigue siendo editar un solo modulo de evento.
- Riesgo de estabilidad principal detectado: divisiones de modulos con dependencias implicitas (ocurrio con `norm-harness`). Mitigacion vigente: la suite completa lo capturo. Recomendacion: mantener `npm test` como paso obligatorio tras cualquier extraccion.
- Riesgo de escala: 45 hooks en cada evento de herramienta agregan latencia por invocacion (un proceso Node por hook). No medido en esta pasada; se recomienda medir antes de agregar hooks nuevos.

## 6. Orden de ejecucion recomendado

Resueltas: G1, G2, G6, G11, G13, G15, G17 a G22. El detalle de lo abierto, con prioridad, esta en la seccion 7. Orden original de ejecucion:

1. G11 (desbloquea la investigacion web y con ella G2, G3 y G10; bajo esfuerzo).
2. G13 y G15 (controles deterministas baratos; cierran deriva de identidad y de cifras).
3. G2 y G3 (requieren verificar sintaxis contra code.claude.com/docs antes de escribir; depende de G11 o de cuota Gemini).
4. G10 con fecha limite: `mcp-protocol` vence alrededor de 2026-09-25 y `ai-core-internal-governance` alrededor de 2026-10-02.
5. G4 y G5 (calidad de skills; mayor esfuerzo, por skill con `npm run eval-skills` y `validate-globals` como red; luego G16 para el limite de 500 lineas).
6. G12, G8, G9, G7 (paridad con el mercado y generacion correcta de MCP).
7. G14 solo si la friccion se repite.

Nota: las fechas escritas por las herramientas usan UTC; la fecha local puede ir un dia atras.

## 7. Registro consolidado de oportunidades (2026-09-21)

Vista unica de todo lo detectado, resuelto, abierto y descartado por alcance. Los ids G1 a G17 estan en la seccion 3; aqui se agregan los hallazgos posteriores (G18 a G22) y el resto de oportunidades que no tenian id.

### 7.1 Hallazgos nuevos, resueltos en esta pasada

| Id | Hallazgo | Causa raiz | Resolucion |
|---|---|---|---|
| G18 | `guard-read.js` inerte en produccion: nunca bloqueo un Read real (al activarse, deniegaba tambien lecturas con `limit`; ahora se permiten si `limit` <= 200) | El hook le pasa `"$CLAUDE_TOOL_INPUT_file_path"` (variable que Claude Code no establece) y el script solo leia argv; sus tests inyectaban argv. Mismo patron que G17. Verificado: los otros 5 scripts con esa variable (`syntax-check`, `standards-guard`, `security-check`, `dependency-tracer`, `pre-commit-tdd`) ya leian stdin | Fallback a `tool_input.file_path` de stdin via `lib/hook-stdin.js`; 2 tests con el payload real. Efecto visible: los Read de archivos de codigo/texto sobre 200 lineas ahora se deniegan (con Gemini disponible) y se redirigen a `analizar_archivo` |
| G19 | `bash-verbosity-guard` bloqueaba `git log -1`, `git log -5` y `cat archivo` seguido de `sed -n 1,60p` | Regex de excepcion sin la forma corta `-N` ni `sed -n` | Ambas formas cuentan como acotadas; 4 tests. Un `-NN` dentro de una fecha no cuenta |
| G20 | CI sin el marco de calidad: un push con el hook omitido no tenia contraparte en GitHub | `ci.yml` ejecutaba suite y `validate-globals`, no `quality-gate` | Paso `npm run quality-gate -- --fast` en ubuntu (limite de 300 lineas, agentes, vigencia); la suite ya la corre la matriz |
| G21 | `EVENTS_QUEUE.json` contaminada con eventos falsos (`standards-guard`, `emoji-prohibido`) generados por un test | Un test invocaba el guard con `spawnSync` directo, sin `AI_CORE_TEST_MODE`; una entrada por corrida de suite. El agente `issue-tracker` habria abierto issues reales a partir de ellos | Test corregido (cola estable en 11 a 11 tras correrlo); 9 eventos de test purgados de la cola local |
| G22 | 6 tests fallaban en Windows en CI | `GIT_CONFIG_GLOBAL=os.devNull` no lo lee git para Windows; NTFS no expone el bit de ejecucion en `fs.stat` | Config global vacia real (`entornoGitAislado` en `_shared.js`) y verificacion del modo 100755 desde el indice de git |
| G30 | Con la cuota de Gemini agotada, `web-search-guard` seguia bloqueando WebFetch y `guard-read` seguia denegando Read: Claude sin via de busqueda ni de lectura | Los 5 handlers de `McpServerHandlers.js` capturan el error y devuelven `{ error }`, asi que el `catch` de `mcp-gemini.js` que llamaba a `marcarCuotaAgotada` nunca se ejecutaba con un 429 real; el marcador no se escribia. Descubierto en vivo al recibir un 429 y no degradar | `errorDeGemini` en `McpServerHandlers.js` marca la cuota en los 5 `catch`; `tests/harness/mcpserverhandlers-js-cuota.test.js` (3 tests). El bridge en ejecucion necesita `/mcp` para cargar el codigo nuevo |
| G23 | El runner `ubuntu-latest` migra a Ubuntu 26 alrededor de 2026-10-19 (aviso del propio CI) | Los 7 usos de `ubuntu-latest` en `.github/workflows/ci.yml` fijados a `ubuntu-24.04`; la migracion a Ubuntu 26 pasa a ser una decision explicita y no un cambio silencioso. Pendiente: probar la matriz en la version nueva antes de subir el pin | Corregido 2026-09-21 |

### 7.2 Abierto, en orden de prioridad

| Prioridad | Id | Oportunidad | Esfuerzo | Nota |
|---|---|---|---|---|
| 3 | G4/G5/G16 | 5 SKILL.md sobre 500 lineas, campos propios fuera de `metadata`, checks faltantes del gate (residuales `*.new`/`*.orig`, secretos en working tree, limite de SKILL.md) | Alto | Activar el limite de SKILL.md en el gate solo despues de partir los skills; enmendar la exencion de `.md` en CLAUDE.md |
| 4 | G12 | Ubicacion efectiva de `mcpServers` (`.mcp.json`) y su generacion | Medio | Verificar en documentacion oficial primero |
| 5 | G24 | Verificar con captura real los payloads de `SubagentStop`, `Stop` y `PostToolUseFailure` | Bajo | Misma clase de defecto que G17 y G18: guards que pasan sus tests pero podrian no recibir datos reales |
| 6 | G8, G9, G7 | Escaner de contenido de skills, compuerta de aprobacion de escrituras a skills/vault, cadena de hash del log de break-glass | Medio cada uno | Paridad con el mercado; sin incidente asociado |
| 7 | G25 | Medir la latencia de los 45 hooks (un proceso Node por hook y evento) | Bajo | Hacerlo antes de agregar hooks nuevos |
| 8 | G26 | Suite de ~4.4 min: cada push nuevo la ejecuta completa en el gate | Medio | Opciones: paralelizar archivos, aislar tests lentos, cache por archivos tocados |
| 9 | G11b | Proveedor alterno para `buscar_web` cuando Gemini agota cuota | Medio | Hoy degrada a la tool nativa, sin alternativa gratuita |
| 10 | G27 | Modos de aprobacion configurables por usuario (`smart/manual/off`) | Medio | Brecha menor frente a Hermes (dato de investigacion, sin fuente primaria) |
| 11 | G14 | Falso positivo de `destructive-op-guard` en texto literal de argumentos | Medio | Volvio a ocurrir el 2026-09-21 al escribir este documento con un heredoc que citaba el borrado forzado de rama; se resolvio usando Edit. Reconsiderar ahora que hay reincidencia |

### 7.3 Descartado por alcance (con motivo)

| Id | Tema | Por que no se hizo | Cuando reconsiderar |
|---|---|---|---|
| G3 | Activar el sandbox nativo en ai-core | Rompe `npm run setup`, `rollback-*` y el pre-push; habria que excluir git, gh, npm y node | Ver G3b |
| G3b | Perfil de sandbox nativo opcional para anfitriones con codigo no confiable | Sin anfitrion que lo pida; Docker (`npm run sandbox`) cubre el caso | Al primer anfitrion con codigo no confiable |
| G28 | Rama local `ai-core/checkpoints` contaminada (autor "Test User") | Su borrado forzado exige break-glass; no afecta al flujo | Borrarla con confirmacion del usuario |
| G29 | `ask` en `permissions` | No hay operacion que convenga confirmar en vez de bloquear | Si aparece una operacion de riesgo intermedio |

### 7.4 Acciones que solo puede hacer el usuario

- `rm -r .claude/tmp-deny-probe`: residuo de la prueba de G2; la regla deny cubre `rm` sobre `.env.local` y por eso no se pudo borrar desde el agente.
- `/mcp` para reconectar el bridge de Gemini y cargar el marcador de cuota.
- Borrar la rama `ai-core/checkpoints` (G28) si se confirma.
- Tener presente que `jailbreak-guard` y `secrets-guard` ya actuan sobre prompts reales (G17): un falso positivo se libera respondiendo `CONFIRMAR-<id>`; y que desde G18 el Read de archivos sobre 200 lineas se redirige a Gemini.
