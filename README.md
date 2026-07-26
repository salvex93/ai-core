# AI-CORE v3.15.1: Nucleo Multi-Agente Universal

`ai-core` es un nucleo de configuracion y comportamiento para agentes IA. Se usa como submodulo Git en un proyecto existente o como repositorio independiente. Define reglas globales, 39 skills especializados, 7 agentes autonomos, un orquestador Mixture-of-Agents (Gemini + DeepSeek + Claude) y un ciclo de mejora continua por uso, sin acoplarse al stack del proyecto anfitrion.

`CLAUDE.md` es la unica fuente de verdad de reglas y enrutamiento de skills. Los skills lo referencian, no lo copian: si una regla cambia ahi, se propaga sin tocar ningun SKILL.md.

Funciona con Claude, Gemini, OpenAI, DeepSeek y Kimi via `ModelRegistry`. Agregar un proveedor nuevo es agregar su API key en `.env` — no hace falta tocar skills ni agentes.

---

## Instalacion

### Requisitos previos

| Requisito | Version minima | Verificar |
|---|---|---|
| Node.js | >= 18.0.0 | `node --version` |
| Claude Code CLI | cualquiera | `claude --version` |
| Git | cualquiera | `git --version` |
| gh CLI | cualquiera | `gh --version` |

`gh` es necesario para el issue-tracker. Instalar desde https://cli.github.com si falta.

### Como repositorio independiente

```bash
# 1. Clonar
git clone git@github.com:salvex93/ai-core.git
cd ai-core

# 2. Dependencias y configuracion local
npm install
npm run setup    # adapta settings.json a tu ruta exacta (cross-platform)

# 3. Verificar que todo funciona
npm test         # debe terminar: 628 pass, 0 fail

# 4. Autenticar gh CLI para el issue-tracker (una sola vez por maquina)
gh auth login    # GitHub.com -> HTTPS -> Login with a web browser
gh auth status   # confirmar: "Logged in to github.com"

# 5. Variables de entorno
cp .env.example .env
# Minimo obligatorio: GEMINI_API_KEY (gratis en aistudio.google.com/app/apikey)

# 6. Iniciar
claude
```

### Como submodulo Git en un proyecto existente

```bash
# 1. Agregar ai-core como submodulo
cd /ruta/a/tu-proyecto
git submodule add https://github.com/salvex93/ai-core .claude/ai-core
git submodule update --init --recursive

# 2. Instalar dependencias del nucleo
cd .claude/ai-core && npm install && cd ../..

# 3. Normalizar el entorno (genera settings.json y CLAUDE.md con rutas locales)
node .claude/ai-core/.claude/bin/norm-harness.js

# 4. Autenticar gh CLI si no lo hiciste ya
gh auth login
gh auth status

# 5. Variables de entorno, en la raiz del proyecto anfitrion
cp .claude/ai-core/.env.example .env
# Editar .env con tus claves

# 6. Iniciar
claude
```

### Actualizar el arnes

Repositorio independiente:

```bash
npm run update
```

Esto corre `git pull`, regenera `settings.json` (purga automaticamente cualquier hook de una version anterior que referencie un script eliminado o renombrado — el objeto de hooks se construye desde cero y sobreescribe el archivo completo, nunca mergea, con la definicion compartida en `hooks-definition.js`), corre los 741 tests, aplica migraciones de version, valida los 39 skills y los 7 agentes, y reporta que cambio. Si un test falla, el comando se detiene ahi.

Instalado como submodulo:

```bash
cd .claude/ai-core
npm run update
cd ../..
node .claude/ai-core/.claude/bin/norm-harness.js
```

`norm-harness.js` corrige rutas hardcodeadas de una version anterior si el proyecto anfitrion tiene un `settings.json` propio.

### Activar proveedores adicionales de IA

Gemini (gratuito) y Anthropic funcionan desde el primer momento. El resto se activa agregando la clave en `.env`:

```bash
GEMINI_API_KEY=    # obligatorio, gratuito en aistudio.google.com
ANTHROPIC_API_KEY= # ya configurado por Claude Code
OPENAI_API_KEY=    # opcional, GPT-5.6 (Sol/Terra/Luna)
DEEPSEEK_API_KEY=  # opcional, DeepSeek V4 (Flash/Pro)
KIMI_API_KEY=      # opcional, Kimi K3, 1M de contexto
```

Sin la clave, el proveedor simplemente no se usa, no hay errores. `OPENAI_API_KEY` y `DEEPSEEK_API_KEY` cumplen doble funcion: proveedor de costo bajo y verificador cross-model independiente de Claude (ver seccion Cross-Model Verifier mas abajo). `DEEPSEEK_API_KEY` tiene ademas un tercer uso: worker `SyntaxDrafting` del orquestador MoA (ver seccion Arquitectura Multi-Agente). Sin `GEMINI_API_KEY` y `DEEPSEEK_API_KEY` simultaneamente, el fan-out MoA no se activa — el guard de disponibilidad lo salta sin error.

### Verificar que el issue-tracker esta activo

```bash
gh auth status
# Esperado: "Logged in to github.com as <tu-usuario>"
```

Si no esta autenticado, los eventos se acumulan en `.claude/EVENTS_QUEUE.json` y se envian en la proxima sesion donde `gh` este disponible. No se pierden.

---

## Comandos de referencia

```bash
npm install                               # instalar dependencias (corre postinstall -> npm run setup)
npm test                                  # 741 tests, Node nativo, sin deps externas
npm run setup                             # regenerar settings.json con rutas locales (ya corre solo via postinstall)
npm run update                            # actualizacion one-command desde GitHub
npm run validate-globals                  # auditar conformidad de los 39 skills (incluye schema agentskills.io)
npm run validate-globals -- --fix-drift   # corregir last_updated desincronizado
npm run token-metrics                     # medir reduccion de consumo de tokens
npm run dry-run                           # simular 5 turnos con calculo de costo
npm run map                               # regenerar CONTEXT_MAP.json
npm run audit-market                      # auditar vigencia de skills vs. dominios en MARKET_STANDARDS.json
npm run score                             # scoring 0-10 por 6 dimensiones del arnes
npm run score-report                      # historial completo de scores con delta
npm run migrate                           # aplicar migraciones de version manualmente
npm run migrate-dry                       # simular migraciones sin aplicar cambios
npm run memory-index                      # indexar vault de memoria semantica
npm run memory-query "<terminos>"         # buscar en vault (BM25)
npm run memory-status                     # estado del vault
npm run agent-report                      # resumen de metricas de la sesion actual
npm run agent-report-full                 # historial de metricas de todas las sesiones
```

---

## Que trae cada version

### v3.15.1 — Fallos silenciosos corregidos: agent-metrics.js y RootGuard.js

Auditoria de trazabilidad de errores detecto dos fallos silenciosos reales en el arnes.

**`agent-metrics.js` registraba `--status ok` siempre, sin importar si la herramienta fallo.** El hook `PostToolUse` para el matcher generico (`Bash|Read|Write|Edit|Agent`) grababa exito incondicional; no existia el hook espejo en `PostToolUseFailure` para ese mismo grupo (solo cubria matchers especificos de MCP). Resultado: `totals.fail` quedaba muerto por diseño y `npm run agent-report` siempre mostraba 100% de fiabilidad, ocultando degradacion real del harness. Confirmado con fuente primaria (`code.claude.com/docs/en/hooks`): `PostToolUse` y `PostToolUseFailure` son mutuamente excluyentes, por lo que agregar la entrada espejo en `PostToolUseFailure` (`hooks-definition.js`) cierra el hueco sin duplicar registros.

**`RootGuard.js` no distinguia JSON corrupto de archivo ausente.** `_cargarRaizMapa()` descartaba silenciosamente cualquier candidato de `CONTEXT_MAP.json` con `catch (_) {}`, sin loguear cual candidato fallo ni por que. Si ambos candidatos existian pero estaban corruptos, el operador solo veia "no se encontro el mapa" — indistinguible de ausencia real de archivo. Ahora el catch loguea `console.warn` con la ruta del candidato y `e.message`.

**741 tests, 39 skills, 7 agentes.**

### v3.15.0 — Grader con tarea original y router multi-proveedor para ahorro de cuota Claude

**`SubagentGrader.js` ahora evalua cumplimiento de tarea, no solo calidad general.** Cierra una limitacion documentada en v3.14.0: confirmado empiricamente (lanzando un subagente real e inspeccionando ambos eventos) que `tool_use_id` (`PreToolUse`) y `agent_id` (`SubagentStop`) son valores DISTINTOS y no correlacionan entre si — pero `session_id`+`prompt_id` si son identicos en ambos eventos del mismo subagente. Nuevo `.claude/bin/lib/subagent-task-store.js` persiste la tarea original (`tool_input.prompt`) indexada por esa clave, con TTL de 10 min; `subagent-guard.js` la guarda en `PreToolUse`, `subagent-grader.js` la recupera y consume en `SubagentStop`, y `SubagentGrader.calificar()` usa una rubrica ampliada ("Cumplimiento de tarea") cuando la tarea esta disponible — sin ella, cae al comportamiento anterior, compatible hacia atras.

**Ahorro real de cuota Claude via `ModelRouter.js` multi-proveedor.** Hasta ahora el router solo enrutaba entre Gemini y modelos Anthropic — OpenAI, DeepSeek y Kimi solo existian como jueces de verificacion, nunca como opcion real para tareas de trabajo. Un usuario con Claude + Gemini + ChatGPT reales no tenia forma de que el arnes usara ChatGPT para bajar la cuota de Claude en tareas simples. `route()` acepta ahora un tercer parametro opcional `{ disponibles }`: para tareas del tier Haiku, si Gemini no aplica pero hay un proveedor delegable disponible (`PROVEEDORES_DELEGABLES`: `gemini` → `openai` → `deepseek` → `kimi`, gratis antes que pagados), se enruta ahi en vez de gastar cuota de Anthropic. Sin el parametro, `route()` es identico a antes — degradacion con gracia total para quien solo tiene Claude, que sigue siendo la unica constante del arnes (nunca se enruta el chat principal, solo tareas delegadas). `IntentClassifier.clasificarConModelo()` ya conecta `listProviders()` real, activo en produccion. Verificado en vivo con Claude+Gemini+OpenAI reales.

**719 tests, 39 skills.**

### v3.14.0 — Bug sistemico de hooks corregido, 4 guards OWASP Agentic nuevos, grader de calidad

**Bug sistemico: 14 hooks/scripts leian variables de entorno que Claude Code nunca establece.** Detectado al escribir un guard nuevo: `bash-verbosity-guard.js` seguia leyendo `CLAUDE_TOOL_INPUT_command`, que la documentacion oficial de hooks confirma que nunca existio (corroborado por el issue publico `anthropics/claude-code#9567`). El dato real llega exclusivamente por JSON en stdin, con forma distinta segun el evento:
- `UserPromptSubmit`: `{ prompt_text, ... }`
- `PreToolUse`/`PostToolUse`: `{ tool_name, tool_input, tool_response, ... }`
- `SubagentStop`: `{ agent_type, last_assistant_message, ... }`

Afectaba a guards de seguridad activos que llevaban desde su implementacion operando sobre datos vacios sin que ningun test lo detectara — los tests inyectaban la variable a mano, algo que Claude Code nunca hace en produccion. Corregidos: `secrets-guard.js`, `detect-role.js`, `moa-context-gatherer.js`, `injection-guard.js`, `subagent-review.js`, `cross-verify-gate.js`, `subagent-guard.js`, `bash-verbosity-guard.js`, `git-queue-advisor.js`, `ponytail-check.js`, `pre-commit-tdd.js`, `standards-guard.js`, `syntax-check.js`, `security-check.js`, `dependency-tracer.js`, `capture-event.js`, `agent-metrics.js` y `tests/token-metrics.js` (que ademas nunca encontraba el directorio real de sesiones). Nuevo `.claude/bin/lib/hook-stdin.js` centraliza la lectura de stdin para todos.

**4 guards nuevos cierran los gaps de una auditoria contra OWASP Top 10 for Agentic Applications 2026:**
- **`code-exec-guard.js`** (ASI05, Unexpected Code Execution) — bloquea (`PreToolUse`, `Write|Edit`) contenido con `eval()`, `new Function()`, `exec`/`subprocess` con shell habilitado o `pickle.load` ANTES de escribirlo, en vez de solo reportarlo despues como ya hacia `security-check.js`.
- **`mcp-integrity-check.js`** (ASI04, Agentic Supply Chain) — hash SHA-256 de los servidores MCP propios (`gemini-bridge`, `anthropic-router`) contra un baseline persistido; invocado desde `health-check.js`. Alcance acotado: MCPs de terceros ya los cubre el skill `mcp-registry-navigator` antes de instalar.
- **`circuit-breaker.js`** (ASI08, Cascading Agent Failures) — cuenta fallos MCP consecutivos en una ventana de 5 min (`PreToolUse`, matcher `mcp__.*`) y avisa antes de reintentar una herramienta condenada a fallar de nuevo.
- **`subagent-grader.js`** + **`SubagentGrader.js`** (Performance Outcomes del Claude Agent SDK) — grader de calidad post-subagente via LLM-as-judge, complementario a `subagent-review.js` (patrones via regex) y `cross-verify-gate.js` (solo `code-reviewer`): califica CUALQUIER subagente contra una rubrica de completitud/coherencia/riesgos.

**3 bugs reales encontrados verificando el grader en vivo (no simulado):** `OpenAICompatAdapter.js` enviaba `max_tokens`, que la API actual de OpenAI rechaza por completo (exige `max_completion_tokens`); nunca usaba `options.system`, perdiendo el system prompt en toda llamada a OpenAI/DeepSeek/Kimi; y OpenAI ignoraba instrucciones de texto plano pidiendo JSON hasta forzar `response_format:{type:"json_object"}`.

**Skill nuevo `performance-engineer`** — cache de aplicacion (in-memory vs Redis segun escala), CDN de assets estaticos y pruebas de carga (`autocannon`), brecha que ni `database-ops` ni `devops-infra` ni `qa-engineer` cubrian.

**Refactor SOLID** de 3 archivos que excedian 300 lineas: `ModelRegistry.js` (adapters extraidos a `scripts/services/model-adapters/`), `aiops-score.js` (scorers extraidos a `lib/aiops-scorers.js`), `memory-index.js` (motor BM25 extraido a `lib/bm25-engine.js`).

**Auditoria de secretos**: estado seguro, 0 hallazgos criticos. `.gitignore` reforzado con `.env*` generico y patrones de credenciales comunes (`*.pem`, `*.key`, `*.p12`, `credentials.json`).

**699 tests, 39 skills.**

### v3.13.0 — 10 bugs reales corregidos, enforcement de subagentes y cobertura completa

**10 bugs reales de regresion silenciosa** encontrados escribiendo el primer test de cada modulo sin cobertura previa — ninguno lanzaba excepcion, todos retornaban un valor "vacio" plausible en el camino de error, asi que nada los habia detectado antes:

- `ContextIndex.js` leia un esquema de `CONTEXT_MAP.json` (`map.map.*`) que ya no existe (el real es `map.host.*`) — el modulo entero estaba inerte, `resolver()` nunca encontraba nada.
- `git-queue-advisor.js` clasificaba severidad por `e.sev`, campo inexistente en el esquema real de eventos — todo caia a "INFO" sin distincion.
- `health-worker.js` filtraba el string hardcodeado `'gemini-2.5-flash'`, obsoleto desde el rename a `gemini-3.5-flash` en v3.11.0.
- `health-sync.js` (`checkSkills`) dependia de la tabla de skills en CLAUDE.md que esta misma version elimino — reportaba 36/38 skills como huerfanos falsamente.
- Bug de regex compartido en `health-sync.js` y `validate-globals.js`: `\s*` cruzaba el salto de linea del frontmatter YAML cuando un campo estaba vacio.
- `issue-reporter.js` usaba labels de GitHub inexistentes, causando que `gh issue create` fallara completo y silencioso.
- `norm-harness.js` mantenia una copia de hooks desincronizada de `setup-settings.js`, sin los 4 hooks de seguridad mas recientes.
- 3 modelos deprecados en `ModelRegistry.js` (`gpt-4o-mini`, `deepseek-chat`, `moonshot-v1-8k`), uno con deadline de deprecacion real a 7 dias de la correccion.
- Test de concurrencia flaky por umbral de tiempo real en vez de orden de eventos.
- Los propios tests contaminaban `EVENTS_QUEUE.json` con eventos de archivos temporales de prueba.

**Enforcement real de gobierno de agentes** — `subagent-guard.js` (bloquea recursion y exceso de subagentes paralelos) y `bash-verbosity-guard.js` (bloquea comandos de alto riesgo de output masivo antes de ejecutarlos, unica intervencion posible ya que los hooks no exponen el output real de una tool call). Antes eran solo reglas en prosa sin verificacion.

**Tabla de seleccion de skills eliminada de CLAUDE.md** — los 38 `SKILL.md` cumplen el estandar abierto [agentskills.io](https://agentskills.io/specification), cargado nativamente por el skill-discovery de Claude Code. La tabla de 32 filas era duplicacion pura (~600-700 tokens/turno ahorrados).

**`hooks-definition.js`** (nuevo) — fuente unica de verdad para la seccion `hooks` de `settings.json`, compartida por `setup-settings.js` y `norm-harness.js`.

**141 tests nuevos** (487 → 628) cubriendo los 19 archivos de `.claude/bin/` y `scripts/services/` que no tenian ninguno.

**636 tests, 39 skills.**

### v3.12.0 — Arquitectura Multi-Agente (MoA), rol declarativo y TDD obligatorio

**Orquestador MoA (fan-out/fan-in)** — `ModelDispatcher.executeMoATask(userPrompt)` reparte una tarea entre `ContextGathering` (Gemini) y `SyntaxDrafting` (DeepSeek) en paralelo con `Promise.allSettled`. Claude actua como "cirujano" (`SurgicalEdit`): recibe el contexto ya mapeado y el borrador ya escrito, en vez de partir de cero. Un worker caido no aborta al otro — el resultado combinado incluye un marcador de contexto vacio en la seccion que fallo. Conectado al hook `UserPromptSubmit` via `.claude/bin/moa-context-gatherer.js`, con guard de disponibilidad: si falta `GEMINI_API_KEY` o `DEEPSEEK_API_KEY`, no se invoca red — evita que cada turno de cada sesion pague latencia por un worker condenado a fallar por falta de configuracion.

**Rol declarativo en skills** — los 37 `SKILL.md` declaran `rol: architect|coder|auditor` en el frontmatter. `AgentRoles.js` lee ese campo directamente en vez de inferirlo por regex sobre la `description` — el metodo anterior producia un sesgo real (28 de 36 skills caian en `architect` por palabras genericas como "sistema" o "arquitectura" presentes incidentalmente en casi cualquier descripcion tecnica).

**Namespacing de memoria por rol** — `.claude/memory-vault/.raw/<rol>/` aisla lo que escribe cada rol; `memory-index.js query --rol=<rol>` filtra la busqueda o se omite para busqueda cross-rol explicita. Resuelve la saturacion de contexto por memoria compartida entre roles sin sacrificar la capacidad de consultar hallazgos de otro rol cuando es util.

**Ciclo TDD obligatorio (Zero-Regression Gate)** — `.claude/bin/pre-commit-tdd.js` bloquea (exit 2) la escritura de codigo fuente fuera de `tests/` si ningun `*.test.js` tiene cambios sin commitear en la sesion actual. Heuristica de presencia, no verificacion Red-Green real (evita el costo de ejecutar la suite completa en cada Write/Edit). Aplica sin excepcion, incluido el propio harness.

**Guardrails deterministas** — `standards-guard.js` bloquea (exit 2) ante emoji pictografico o prosa de mas de 150 palabras en artefactos conversacionales (`COMMIT_EDITMSG`, `TO_GEMINI.md` — no en documentacion tecnica extensa como `SKILL.md`). Requirio que `process-guard.js` empezara a propagar el exit code real del comando envuelto, que antes se absorbia siempre a 0.

**ACI diff edits** — el system prompt del rol Coder exige formato SEARCH/REPLACE (estilo Aider) para editar codigo existente, prohibiendo reescribir archivos completos salvo que sean nuevos.

**Grafo de dependencias inverso** — `.claude/bin/dependency-tracer.js` lista que otros scripts de `scripts/` y `.claude/bin/` dependen (directa o transitivamente) del archivo que se esta por editar, via `PreToolUse`. Informativo, no bloqueante.

**Zero-debt estructural** — `mcp-gemini.js` fragmentado (527 → 183 lineas) en `GeminiApiClient.js` (cliente SDK) y `McpServerHandlers.js` (las 5 herramientas), eliminando ademas una implementacion duplicada de truncado de tokens. `anthropic-bridge.js` (336 → 280 lineas) con la logica de tokens extraida a `TokenManager.js`. Nuevo skill `aaa-evaluator` (estandares SWE-bench: limite de 300/20 lineas, Factory/Strategy/Observer solo cuando el problema los justifica).

**487 tests, 37 skills.**

### v3.11.0 — Proteccion contra prompt injection y vigencia de skills

**injection-guard** — hook `SubagentStop` que detecta indirect prompt injection en el output de subagentes: contenido externo (archivos, resultados de Gemini, paginas web) que intenta hacerse pasar por una instruccion nueva del sistema. Advierte, no bloquea — la decision final es del operador. Ver `.claude/bin/injection-guard.js`.

**Correccion de vigencia (2026-06)** — la referencia de modelo `claude-sonnet-4-6` en 16 archivos (CLAUDE.md, ModelRegistry.js, mcp-anthropic.js y 12 skills) actualizada a `claude-sonnet-5`, vigente desde el 30 de junio de 2026. `security-auditor` actualizado de OWASP Top 10:2021 a OWASP Top 10:2025 (SSRF fusionado en Control de Acceso Roto, Security Misconfiguration sube a #2, categorias nuevas Software Supply Chain Failures y Mishandling of Exceptional Conditions).

**Migracion a la familia Gemini 3.x (2026-07-10)** — la familia Gemini 2.5 fue reemplazada por 3.1/3.5 en el ecosistema de Google (verificado contra `deepmind.google` y `ai.google.dev`). 8 skills actualizados con detalle verificado contra fuente oficial: `rag-specialist`, `cost-optimizer`, `mobile-engineer`, `workflow-orchestrator`, `multimodal-engineer`, `audio-voice-engineer`, `prompt-engineer` y el renombrado `gemini-2-5-specialist` -> `gemini-3-specialist`. Hallazgos relevantes: el tier "Lite" no sigue el mismo numero de version que "Flash" (heredero real es `gemini-3.1-flash-lite`, no `gemini-3.5-flash-lite`, que no existe); `thinking_budget` fue reemplazado por `thinking_level` (low/medium/high) y ambos son mutuamente excluyentes (error 400 si se combinan); el modelo vigente de Live API (`gemini-3.1-flash-live-preview`) tiene una regresion confirmada de feature — no soporta Affective Dialog, que si estaba disponible en `gemini-2.5-flash-live-preview` (apagado 2025-12-09). Se agrego el "Protocolo de Vigencia Tecnologica" en `CLAUDE.md` para sistematizar este tipo de verificacion en el futuro. Tambien se documento el release candidate del Model Context Protocol (`2026-07-28`, protocolo stateless, headers `Mcp-Method`/`Mcp-Name` obligatorios) en `mcp-server-builder`.

**379 tests, 36 skills.**

### v3.10.0 — Verificacion Cross-Model y AAA

**Cross-Model Verifier** — antes de aceptar el veredicto `APROBADO` de `code-reviewer`, `cross-verify-gate.js` dispara una segunda opinion con un proveedor de IA distinto al que genero el cambio (nunca el mismo modelo que hizo el fix). Motivado por evidencia de que verificar con el mismo modelo detecta pocas regresiones self-consistentes. Ver `docs/OPUSPLAN-cross-model-verifier.md` para el diseño completo.

**Ponytail enforcement** — hook `PreToolUse` en `Write`/`Edit` con una escalera de 5 capas que corre antes de cada escritura: detecta reimplementaciones de stdlib, funciones con mas de 3 parametros y bloques de mas de 200 lineas.

**Dev-loop** — ciclo de desarrollo con 5 gates obligatorios: Spec, Design, Plan, Build, Review. Sin el artefacto de la fase anterior, la siguiente no arranca.

**Memoria semantica BM25** — vault en `.claude/memory-vault/` con motor BM25 propio, sin dependencias externas. Se indexa automaticamente al cerrar sesion y se consulta al abrir la siguiente. Resuelve la perdida de contexto entre sesiones sin base de datos externa.

**Observabilidad de agentes** — `agent-metrics.js` registra cada tool call con herramienta, status, tokens estimados y duracion. `npm run agent-report` muestra el resumen de la sesion.

**Validacion adversarial de subagentes** — el hook `SubagentStop` corre `subagent-review.js`, que evalua el output de cada subagente desde tres perspectivas (auditor, adversario, pragmatico) antes de integrarlo al padre. Sale con exit 1 si encuentra hallazgos criticos.

**mcp-registry-navigator** — evalua servidores MCP de terceros antes de instalarlos: transporte, seguridad de inputs, mantenimiento del repo, calidad del schema, riesgo operativo.

**372 tests, 36 skills, 5 agentes.**

### v3.9.0

Skills reescritos con seccion "Cuando NO Activar Este Perfil" en todos, sistema de migracion automatica (`DEPRECATIONS.json` + `migrator.js`), y `aiops-score.js` con scoring 0-10 en el hook Stop.

---

## Arquitectura Skills vs Agents

| Capa | Directorio | Que hace | Cuando se activa |
|---|---|---|---|
| Skills | `.claude/skills/` (38) | Perfil de comportamiento — como piensa Claude en un dominio | Claude lo adopta como rol dentro de la conversacion |
| Agents | `.claude/agents/` (5+) | Loop autonomo que ejecuta una tarea completa sin intervencion | Claude Code lo lanza como subagente con contexto cero |

Un skill se convierte en agente solo si cumple los tres criterios a la vez: autonomia real (sin interaccion por turno), salida estructurada verificable, y uso recurrente. Si falta uno, se queda como skill.

| Agente | Funcion |
|---|---|
| `code-reviewer` | Revisa el diff completo contra main, clasifica hallazgos, produce veredicto APROBADO/REQUIERE_CAMBIOS/BLOQUEADO |
| `security-scanner` | Escanea credenciales expuestas, CVEs, secrets en git, permisos excesivos |
| `aiops-auditor` | Audita conformidad de skills, detecta agentes faltantes, drift de SDK |
| `map-updater` | Regenera CONTEXT_MAP ante drift estructural del repo |
| `issue-tracker` | Captura errores y gaps, los envia como issues a GitHub al cerrar sesion |
| `mcp-registry-navigator` | Evalua servidores MCP de terceros antes de instalar (INSTALAR/EVALUAR/RECHAZAR) |

La lista completa de skills, sus triggers de activacion y la logica de enrutamiento por contexto viven unicamente en `CLAUDE.md`, seccion "Seleccion de Skills". No se duplica aqui a proposito — mantenerla en dos archivos es lo que produce drift.

---

## Sistema de gobierno y mejora continua

**`process-guard.js`** — limita a 4 scripts del harness en paralelo, con timeout de 8s por proceso. Evita saturacion de memoria en sesiones largas.

**`standards-guard.js`** — revisa en tiempo real cada archivo que Claude escribe: emojis en codigo, `Co-Authored-By`, archivos de mas de 300 lineas, funciones de mas de 20 lineas, secrets hardcodeados, commits que mencionan IA.

**`git-queue-advisor.js`** — antes de cada `git push` muestra los eventos pendientes en cola; despues de cada `git pull` avisa si hay trabajo de harness pendiente. Nunca bloquea, solo informa.

**`capture-event.js` + `issue-reporter.js`** — el ciclo completo:

```
Error durante uso -> capture-event.js -> EVENTS_QUEUE.json
git push (aviso)  -> decides si actuar antes
Cierre de sesion  -> issue-reporter.js -> github.com/salvex93/ai-core
Vos revisas el issue -> decidis si implementar la correccion
```

### ModelRegistry — abstraccion multi-proveedor

`scripts/services/ModelRegistry.js` expone `chat(provider, messages, options)` con patron adapter:

```js
const { chat, listProviders } = require('./scripts/services/ModelRegistry');

listProviders().forEach(p => console.log(p.provider, p.available ? 'OK' : 'sin key'));

await chat('gemini',    messages);  // gratis, tier 0 para lecturas y resumenes
await chat('anthropic', messages);  // Claude Haiku / Sonnet / Opus / Fable
await chat('openai',    messages);  // GPT-5.6 (Sol / Terra / Luna)
await chat('deepseek',  messages);  // DeepSeek V4 (Flash / Pro)
await chat('kimi',      messages);  // Kimi K3, 1M de contexto
```

Agregar un proveedor nuevo es agregar su config en `PROVIDER_CONFIGS` y su key en `.env`. No toca CLAUDE.md ni skills.

### Cross-Model Verifier

`scripts/services/CrossVerifier.js` fuerza que la verificacion de un diff corra con un proveedor distinto al que genero el cambio — nunca el mismo modelo se audita a si mismo. Recibe solo el diff y la tarea original, nunca el razonamiento del que hizo el fix.

```js
const { verificar } = require('./scripts/services/CrossVerifier');

const resultado = await verificar({
  diff: gitDiffDelCambio,
  tarea: 'descripcion de la tarea original',
  proveedorActor: 'anthropic',
});
// { pass: boolean, hallazgos: [...], proveedor: 'deepseek' | 'openai' | 'gemini' }
```

Se dispara automaticamente en el hook `SubagentStop` cuando `code-reviewer` marca `APROBADO`. Si no hay proveedor distinto configurado en `.env`, se omite sin bloquear la sesion.

### Herramientas de gobernanza

- **`validate-globals.js`**: verifica que los 39 skills tengan la referencia inmutable a CLAUDE.md, las secciones obligatorias, `rol:` valido en frontmatter, ningun emoji, y conformidad con el schema abierto [agentskills.io](https://agentskills.io/specification) (`name` coincide con la carpeta, formato, limites de longitud). `--fix-drift` corrige `last_updated` desincronizado. Sale con exit 1 si hay hallazgos criticos o altos.
- **`update.js`**: actualizacion cross-platform en un comando. Reporta version anterior vs nueva y si hay breaking changes que requieran accion manual.
- **CI** (`.github/workflows/ci.yml`): corre tests y `validate-globals` en cada push a `main` y cada PR. Matriz: Ubuntu y Windows con Node 20/22, macOS solo con Node 22 (Node 20 removido de macOS por exit code espurio intermitente de `node --test` en esa combinacion especifica de runner — ver CHANGELOG v3.15.1).

---

## Arquitectura Multi-Agente (MoA)

`scripts/services/ModelDispatcher.js` reparte sub-tareas entre proveedores segun su naturaleza, en vez de resolver todo con un unico modelo:

```js
const { executeMoATask } = require('./scripts/services/ModelDispatcher');

const { resultado, fallos } = await executeMoATask('implementa la funcion X');
// resultado: string combinado con seccion ContextGathering + seccion SyntaxDrafting
// fallos: [] si ambos workers resolvieron, o el detalle del worker que fallo
```

| Sub-tarea | Proveedor | Rol |
|---|---|---|
| `ContextGathering` | Gemini | Mapea el terreno — manejo masivo de tokens, tier gratuito |
| `SyntaxDrafting` | DeepSeek | Genera un borrador de sintaxis de bajo costo |
| `SurgicalEdit` | Claude | Aplica el cambio quirurgico final, con el contexto y el borrador ya resueltos |

`executeMoATask` ejecuta `ContextGathering` y `SyntaxDrafting` en paralelo con `Promise.allSettled` — un worker caido (timeout, rate limit, key ausente) no aborta al otro; el orquestador nunca rechaza, solo degrada la seccion afectada a un marcador de contexto vacio.

**Conexion al flujo de conversacion**: `.claude/bin/moa-context-gatherer.js` invoca `executeMoATask` en el hook `UserPromptSubmit`, antes de que Claude procese el prompt. Guard de disponibilidad: si falta `GEMINI_API_KEY` o `DEEPSEEK_API_KEY`, no se hace ninguna llamada de red — evita pagar latencia en cada turno de cada sesion por un worker condenado a fallar en cualquier entorno sin ambas keys configuradas (el caso mas comun, ya que DeepSeek no viene activado por defecto). El resultado se escribe en `.claude/moa_context.md`, estado efimero que el siguiente turno sobrescribe.

Categoria de `process-guard.js` propia (`moa`, no `intent`): `moa-context-gatherer.js` y `detect-role.js` corren en el mismo array de hooks de `UserPromptSubmit` y ambos deben ejecutarse siempre — compartir categoria de lock haria que uno se saltara silenciosamente por colision.

---

## Motor de ahorro de tokens

- **Guard Read** (`guard-read.js`): bloquea la lectura directa de archivos de mas de 200 lineas, fuerza delegacion a Gemini.
- **Validate Map** (`validate-map.js`): regenera `CONTEXT_MAP.json` si detecta drift de 3 archivos o mas — evita exploracion ciega del repo.
- **Modo Neanderthal**: en el rol Coder, maximo 3 lineas de prosa.
- **Compact/Clear automatico**: aviso al turno 6, detencion al turno 15.
- **`token-metrics.js`**: mide la reduccion real de consumo por sesion.

### Stack del motor

- **Model Router** (`scripts/services/ModelRouter.js`): jerarquia Gemini free -> Haiku -> Sonnet -> Opus/Fable, con Gemini como prioridad para lecturas y resumenes. Incluye un tier separado para el Cross-Model Verifier que no sigue la jerarquia de costo Anthropic — delega la seleccion de proveedor a `CrossVerifier.seleccionarVerificador()`.
- **Anthropic Bridge** (`scripts/anthropic-bridge.js`): prompt caching de 3 puntos, ventana deslizante de historial.
- **Health-Check System**: autodiagnostico al inicio de sesion, detecta path drift y autocorrige.
- **Error Repair Loop** (`scripts/services/ErrorRepairLoop.js`): ciclo deteccion -> diagnostico -> reparacion, con `LoopGuard` limitando intentos.
- **Syntax Check Hook**: `node --check` en cada `.js` editado.

### Stacks detectados automaticamente

| Stack | Manifiesto detectado | Permisos agregados |
|---|---|---|
| Node.js | `package.json` | `npx*`, `yarn*` |
| Python | `pyproject.toml`, `requirements.txt`, `setup.py` | `python*`, `pip*`, `pytest*`, `uv*` |
| Go | `go.mod` | `go*` |
| Rust | `Cargo.toml` | `cargo*` |
| Java | `pom.xml`, `build.gradle` | `mvn*`, `gradle*`, `java*` |
| PHP | `composer.json` | `composer*`, `php*` |
| Ruby | `Gemfile` | `bundle*`, `rails*`, `ruby*` |
| Docker | `Dockerfile`, `docker-compose.yml` | `docker*`, `docker-compose*` |
| Makefile | `Makefile` | `make*` |
| Terraform | `.terraform/` | `terraform*` |
| Serverless | `serverless.yml` | `serverless*`, `sls*` |
| Kubernetes | `k8s/`, `helm/` | `kubectl*`, `helm*` |
| Monorepo | `turbo.json`, `nx.json`, `pnpm-workspace.yaml` | `turbo*`, `nx*`, `pnpm*` |

### Vinculacion por symlinks (alternativa a submodulo)

Para proyectos que comparten el mismo ai-core local sin usar submodulo Git:

**Linux/Mac:**
```bash
rm -f ./CLAUDE.md
ln -s /ruta/a/ai-core/CLAUDE.md ./CLAUDE.md
```

**Windows PowerShell (administrador):**
```powershell
New-Item -ItemType SymbolicLink -Path './CLAUDE.md' -Target 'C:/ruta/a/ai-core/CLAUDE.md' -Force
```

| Criterio | Symlinks | Submodulos |
|---|---|---|
| Desarrollo centralizado del nucleo | Recomendado | No recomendado |
| Distribucion a terceros / CI | No recomendado | Recomendado |
| Multiples proyectos en la misma maquina | Recomendado | Alternativa |

---

## Mapa de modulos

```
.claude/ai-core/
├── scripts/
│   ├── services/
│   │   ├── ModelRouter.js       Enrutamiento Gemini/Haiku/Sonnet/Opus/Fable por herramienta y tokens
│   │   ├── ModelRegistry.js     Adapter multi-proveedor: chat(provider, messages, options)
│   │   ├── ModelDispatcher.js   Router MoA entre proveedores (Command/Port): executeMoATask fan-out/fan-in
│   │   ├── model-adapters/      Adapters extraidos de ModelRegistry.js (SOLID, <300 lineas c/u)
│   │   │   ├── AnthropicAdapter.js    Claude Haiku/Sonnet/Opus/Fable via @anthropic-ai/sdk
│   │   │   ├── GeminiAdapter.js       Gemini 3.5/3.1 via @google/generative-ai
│   │   │   └── OpenAICompatAdapter.js OpenAI/DeepSeek/Kimi — maxTokensParam y soportaJSONMode por proveedor
│   │   ├── CrossVerifier.js     Verificacion ciega de diffs con proveedor distinto al actor (code-reviewer)
│   │   ├── SubagentGrader.js    Grader generico de calidad post-subagente via LLM-as-judge (Performance Outcomes)
│   │   ├── AgentRoles.js        Perfiles Architect/Coder/Auditor — lee rol: de skills, exige SEARCH/REPLACE en Coder
│   │   ├── IntentClassifier.js  Infiere herramienta y modelo desde el mensaje crudo del usuario
│   │   ├── ContextIndex.js      Indice CONTEXT_MAP.json — resolucion de rutas sin I/O ciego
│   │   ├── TokenManager.js      Conteo y truncado de tokens (Gemini input/output, estimacion de mensajes)
│   │   ├── GeminiApiClient.js   Cliente SDK de Gemini puro — auth, reintentos, parseo JSON, compactado
│   │   ├── McpServerHandlers.js Las 5 herramientas MCP de mcp-gemini.js (logica de negocio, sin protocolo)
│   │   └── ErrorRepairLoop.js   Ciclo deteccion->diagnostico->reparacion de errores
│   ├── anthropic-bridge.js      Bridge Anthropic SDK con prompt caching (<static_context>) y Model Router
│   ├── mcp-gemini.js            Servidor MCP stdio — shell JSON-RPC, delega a McpServerHandlers.js
│   ├── mcp-anthropic.js         Servidor MCP stdio — bridge Anthropic como herramienta MCP
│   ├── init-backlog.js          Crea BACKLOG.md en el proyecto anfitrion si no existe
│   ├── query-backlog.js         Filtra BACKLOG.md sin cargarlo completo en contexto
│   ├── dry-run-cost-sim.js      Simulador de costo sin llamadas reales
│   └── migrator.js              Aplica migraciones de version desde DEPRECATIONS.json
├── .claude/
│   ├── settings.json            Hooks + config de servidores MCP (generado, no editar a mano)
│   ├── bin/
│   │   ├── setup-settings.js    Genera settings.json con rutas locales (fuente del archivo anterior)
│   │   ├── health-check.js      Autodiagnostico y path drift al inicio de sesion
│   │   ├── detect-stack.js      Infiere el stack del anfitrion via manifiestos
│   │   ├── validate-map.js      Valida y regenera CONTEXT_MAP.json si hay drift
│   │   ├── guard-read.js        Hook PreToolUse: bloquea Read de mas de 200 lineas
│   │   ├── norm-harness.js      Setup: settings.json + permisos por stack + symlink CLAUDE.md
│   │   ├── validate-globals.js  Auditor de conformidad de skills contra CLAUDE.md (incluye rol:)
│   │   ├── generate-map.js      Genera CONTEXT_MAP con seccion de stack detectado
│   │   ├── security-check.js    Hook PostToolUse: escanea secretos/eval/catch vacio
│   │   ├── standards-guard.js   Hook PostToolUse: bloquea (exit 2) emoji o prosa >150 palabras
│   │   ├── secrets-guard.js     Hook UserPromptSubmit: bloquea (exit 2) credenciales de alta confianza, advierte el resto
│   │   ├── detect-role.js       Hook UserPromptSubmit: clasifica rol y escribe .claude/.current_role
│   │   ├── moa-context-gatherer.js Hook UserPromptSubmit: fan-out MoA con guard de disponibilidad de keys
│   │   ├── pre-commit-tdd.js    Hook PreToolUse: bloquea (exit 2) codigo fuente sin test tocado en sesion
│   │   ├── dependency-tracer.js Hook PreToolUse: grafo de dependencias inverso (informativo)
│   │   ├── aiops-score.js       Hook Stop: scoring 0-10 por 6 dimensiones
│   │   ├── memory-index.js      Motor BM25 del vault de memoria semantica — namespacing por rol
│   │   ├── memory-index-stop.js Hook Stop: consume .current_role de forma destructiva e indexa por rol
│   │   ├── subagent-review.js   Hook SubagentStop: validacion adversarial de 3 perspectivas
│   │   ├── cross-verify-gate.js Hook SubagentStop: segunda opinion cross-model tras code-reviewer
│   │   ├── hooks-definition.js  Fuente unica de la seccion "hooks" de settings.json (usada por setup-settings.js y norm-harness.js)
│   │   ├── subagent-guard.js    Hook PreToolUse(Agent): bloquea recursion y exceso de subagentes paralelos
│   │   ├── bash-verbosity-guard.js Hook PreToolUse(Bash): bloquea comandos de alto riesgo de output masivo
│   │   ├── code-exec-guard.js   Hook PreToolUse(Write|Edit): bloquea eval/exec/shell antes de escribir (ASI05)
│   │   ├── mcp-integrity-check.js Hash SHA-256 de servidores MCP propios contra baseline (ASI04, via health-check.js)
│   │   ├── circuit-breaker.js   Hook PreToolUse(mcp__.*): avisa tras 3 fallos MCP consecutivos en 5 min (ASI08)
│   │   ├── subagent-grader.js   Hook SubagentStop: grader de calidad via SubagentGrader.js (Performance Outcomes)
│   │   ├── lib/                 Modulos compartidos entre hooks
│   │   │   ├── hook-stdin.js         Lectura/parseo del JSON de evento que Claude Code entrega por stdin
│   │   │   ├── risky-code-patterns.js Patrones de ejecucion arbitraria compartidos con code-exec-guard.js
│   │   │   ├── aiops-scorers.js      Las 6 funciones de scoring de aiops-score.js
│   │   │   ├── bm25-engine.js        Motor BM25 de memory-index.js (tokenizacion, indice invertido)
│   │   │   └── subagent-task-store.js Correlaciona PreToolUse/SubagentStop por session_id+prompt_id
│   │   └── memory-vault-prune-check.js Hook Stop: avisa (sin borrar) cuando el vault supera 50 archivos
│   └── skills/                  39 skills — enrutamiento via frontmatter description (agentskills.io), reglas en CLAUDE.md
├── tests/                       741 tests — tests/harness/*.test.js (dividido por modulo) + archivos dedicados
├── .github/workflows/ci.yml     CI: Ubuntu/Windows Node 20+22, macOS solo Node 22
├── CLAUDE.md                    Autoridad unica: reglas globales, skills, enrutamiento
├── DEPRECATIONS.json            Contrato de migracion por version
├── package.json                 v3.15.1, Node >= 18
└── .env.example                 Plantilla de variables de entorno
```

---

## Como contribuir

### Crear un skill nuevo

1. Crear `.claude/skills/{nombre-en-kebab-case}/SKILL.md`.
2. Frontmatter obligatorio: `name`, `description`, `origin: ai-core`, `version`, `last_updated`, `rol` (`architect`, `coder` o `auditor` — asignado por criterio semantico real, no por keywords automaticos; determina el system prompt y el proveedor de modelo que hereda el skill).
3. Secciones obligatorias: "Cuando Activar Este Perfil", "Cuando NO Activar Este Perfil", "Primera Accion al Activar", "Directiva de Interrupcion", "Restricciones del Perfil" con la referencia inmutable a CLAUDE.md.
4. Evaluar si cumple los tres criterios de agente. Si los cumple, crear tambien el `.md` correspondiente en `.claude/agents/`.
5. Agregar la fila correspondiente en la tabla "Seleccion de Skills" de `CLAUDE.md` — es la unica tabla que existe, no se duplica en README.
6. `npm run validate-globals` debe terminar en 0 criticos y 0 altos.
7. Commit y push.

### Crear un agente nuevo

Frontmatter obligatorio:
```yaml
---
name: nombre-del-agente
description: descripcion concisa para auto-discovery
origin: ai-core
version: 1.0.0
last_updated: YYYY-MM-DD
provider: any
loop: true|false
---
```

### Agregar un proveedor de IA

1. Config en `PROVIDER_CONFIGS` de `scripts/services/ModelRegistry.js`.
2. Adapter propio solo si el proveedor no es OpenAI-compatible (si lo es, reutilizar `chatOpenAICompat`).
3. Documentar la variable en `.env.example`.

### Reportar un problema

El issue-tracker captura errores automaticamente y los sube a GitHub al cerrar sesion. Para reportar algo manualmente:

```bash
node .claude/bin/capture-event.js \
  --type skill_gap \
  --tool "<skill-mas-cercano>" \
  --error "<descripcion del gap>" \
  --context "<lo que se pidio y no fue cubierto>"
```

---

## Mantenerse actualizado

| Fuente | Que monitorear | Frecuencia |
|---|---|---|
| [Anthropic Changelog](https://www.anthropic.com/changelog) | Modelos nuevos, capacidades de hooks, cambios en MCP | Semanal |
| [Claude Code Docs](https://docs.anthropic.com/en/docs/claude-code) | Hooks nuevos, cambios en settings.json | Semanal |
| [Google DeepMind Models](https://deepmind.google/models/) | Familia Gemini vigente, modelos "coming soon" vs disponibles | Semanal |
| [Gemini API Docs](https://ai.google.dev/gemini-api/docs) | Pricing, free tier, nombres exactos de modelo, deprecaciones | Semanal |
| [Gemini Deprecations](https://ai.google.dev/gemini-api/docs/deprecations) | Fechas de apagado y modelo de reemplazo obligatorio | Mensual |
| [MCP Blog](https://blog.modelcontextprotocol.io/) | Release candidates y cambios de protocolo | Mensual |
| [MCP Spec Changelog](https://modelcontextprotocol.io/changelog) | Transportes, primitivas, politica de deprecacion | Mensual |
| [npm: @anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) | Versiones, breaking changes | Por release |
| [npm: @google/generative-ai](https://www.npmjs.com/package/@google/generative-ai) | Versiones de Gemini, cambios de API | Por release |

Cuando aparezca una capacidad nueva: `npm outdated` para ver si el SDK ya la trae, `npm run update` si hay version nueva, revisar si afecta hooks o `settings.json`, y documentar en `CHANGELOG.md` con la version que la habilita. El detalle del proceso de verificacion (fuentes aceptadas, orden de pasos, alcance de la actualizacion) vive en `CLAUDE.md`, seccion "Protocolo de Vigencia Tecnologica" — no se duplica aqui.

El agente `aiops-auditor` detecta drift de SDK y skills faltantes. Lanzarlo cuando se sospeche degradacion del arnes.

### Variables de entorno — referencia rapida

```bash
GEMINI_API_KEY     # Gemini 3.5 Flash / 3.1 Flash-Lite, gratuito, tier 0. Tambien worker ContextGathering de MoA
ANTHROPIC_API_KEY  # Claude Haiku/Sonnet/Opus/Fable
OPENAI_API_KEY     # GPT-5.6 (Sol/Terra/Luna) — opcional, tambien verificador cross-model
DEEPSEEK_API_KEY   # DeepSeek V4 (Flash/Pro) — opcional, verificador cross-model y worker SyntaxDrafting de MoA
KIMI_API_KEY       # Kimi K3, 1M de contexto — opcional
DOCS_PATH          # ruta a documentacion interna para RAG local
```

---

## Autoridad unica: CLAUDE.md

`README.md` cubre instalacion, arquitectura y uso. `CLAUDE.md` es el sistema operativo completo: reglas, roles, skills y tablas de enrutamiento. Ante cualquier discrepancia entre ambos, `CLAUDE.md` gana.

---

## Licencia

MIT. Usa, modifica y distribuye libremente, incluso en proyectos comerciales. La autoria queda en el historial de git.

Consultoria o configuracion privada: salvex93@gmail.com.
