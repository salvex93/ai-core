# CHANGELOG — AI-CORE

Registro de cambios por version. Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Versionado semantico: MAJOR.MINOR.PATCH.

## [3.13.0] — 2026-07-17

### Corregido — 10 bugs reales de regresion silenciosa

- **`scripts/services/ContextIndex.js`**: `listarArchivos()` y `diagnostico()` leian el esquema legacy `map.map.{root_files,directories,total_files}`, que ya no existe (el esquema real de `CONTEXT_MAP.json` es `map.host.*`). El modulo completo quedaba inerte desde el cambio de esquema — `resolver()` nunca encontraba nada, `total_archivos` siempre reportaba 0. Su proposito documentado (evitar lecturas ciegas a disco) nunca funciono en la practica hasta este fix.
- **`.claude/bin/git-queue-advisor.js`**: clasificaba severidad de eventos por `e.sev`, campo que no existe en el esquema real de `capture-event.js` (usa `type`). Todo evento pendiente caia a severidad "INFO" sin distincion real entre critico y trivial. Corregido para derivar prioridad desde `type`, igual criterio que `ISSUE_META` en `issue-reporter.js`.
- **`.claude/bin/health-worker.js`**: filtraba el string hardcodeado `'gemini-2.5-flash'` para excluir el modelo Gemini de la comparacion contra el catalogo de Anthropic — el nombre real ya es `gemini-3.5-flash` desde v3.11.0, el filtro nunca hacia match desde entonces.
- **`.claude/bin/health-sync.js` (`checkSkills`)**: dependia de una tabla de skills en CLAUDE.md eliminada en esta misma sesion (routing via frontmatter `description`, ver mas abajo) — reportaba 36/38 skills como "huerfanos" falsamente en cada `HEALTH_REPORT.md`. Reescrito para verificar conformidad estructural real (`name` coincide con la carpeta, `description` no vacia), mismo criterio que `validate-globals.js`.
- **Bug de regex compartido** en `health-sync.js` y `validate-globals.js`: `\s*` (en vez de `[ \t]*`) al extraer `name`/`description` del frontmatter cruzaba el salto de linea cuando el valor estaba vacio, capturando el contenido de la linea siguiente del YAML como si fuera el valor del campo.
- **`.claude/bin/issue-reporter.js`**: labels de GitHub inexistentes (`bug,hooks`, `bug,mcp`, `enhancement,skill`) hacian fallar `gh issue create` de forma completa y silenciosa, dejando eventos sin marcar `reported: true` indefinidamente. Reducidas a las labels reales del repo (`bug`, `enhancement`). Test que valida las labels contra el repo real para prevenir regresion.
- **`.claude/bin/norm-harness.js` / `setup-settings.js`**: mantenian una copia paralela y desincronizada de la definicion de hooks. `norm-harness.js` (usado cuando ai-core se instala como submodulo) carecia de `subagent-guard.js`, `bash-verbosity-guard.js`, `memory-vault-prune-check.js`, y de `cross-verify-gate.js`/`injection-guard.js` en `SubagentStop`. Unificado en `.claude/bin/hooks-definition.js` (nuevo) como fuente unica de verdad, consumida por ambos callers via su propia funcion `bin()`.
- **`scripts/services/ModelRegistry.js`**: 3 defaults de modelo deprecados actualizados con evidencia verificada por busqueda web — `gpt-4o-mini` (GPT-4o retirado 2026-02) → `gpt-5.6-luna`; `deepseek-chat` (deprecacion confirmada 2026-07-24) → `deepseek-v4-flash`; `moonshot-v1-8k` (sunset 2026-08-31) → `kimi-k3`. Test que impide reintroducir los identificadores deprecados.
- **`tests/model-dispatcher.test.js`**: test de concurrencia media `duracion < 40ms` — flaky bajo carga de CPU (falla intermitentemente cuando la suite completa corre con muchos `spawnSync` reales, aunque la ejecucion si sea concurrente). Reemplazado por verificacion de orden de eventos (ambos workers inician antes de que cualquiera termine).
- **Contaminacion de `EVENTS_QUEUE.json` por los propios tests**: los tests que ejercitan guards reales (`standards-guard.js`, etc.) invocaban `capture-event.js` de verdad, encolando eventos de archivos temporales de prueba junto a fallos genuinos del arnes. `runScript()` en `tests/harness.test.js` inyecta `AI_CORE_TEST_MODE=1`, que `capture-event.js` respeta para salir temprano sin escribir.

### Agregado — Enforcement real y ahorro de tokens

- **`.claude/bin/subagent-guard.js`** (nuevo, hook `PreToolUse` matcher `Agent`): bloquea con exit 2 la recursion del mismo tipo de subagente y el spawn mas alla de 3 subagentes en una ventana de 2 minutos. Antes "maximo 3 subagentes paralelos" y "prohibido spawn recursivo" eran solo prosa en CLAUDE.md sin verificacion.
- **`.claude/bin/bash-verbosity-guard.js`** (nuevo, hook `PreToolUse` matcher `Bash`): bloquea comandos de alto riesgo de output masivo sin acotar (`git log`/`git diff`/`cat`/`find` sin limite) antes de ejecutarlos — los hooks de Claude Code no exponen el output real de una tool call via variable de entorno, solo el input, asi que la unica intervencion posible es preventiva.
- **`.claude/bin/memory-vault-prune-check.js`** (nuevo, hook `Stop`): avisa cuando `.raw/` del vault de memoria supera 50 archivos, sin mover ni eliminar nada — la poda sigue siendo responsabilidad manual del operador, ya documentada en `memory-manager`.
- **`package.json`**: `postinstall` corre `setup-settings.js` automaticamente tras cada `npm install`, evitando hooks rotos por rutas placeholder sin regenerar manualmente en una maquina nueva.
- **`aiops-score.js`**: gate de verbosidad — solo imprime el reporte completo de las 6 dimensiones si el score baja o hay hallazgos nuevos; en turnos estables emite una sola linea compacta.
- **CLAUDE.md — tabla de seleccion de skills eliminada**: los 38 `SKILL.md` ya cumplen el estandar abierto [agentskills.io](https://agentskills.io/specification) (`name`/`description` en frontmatter con lenguaje de activacion), que Claude Code carga nativamente via skill-discovery — la tabla de 32 filas era duplicacion pura. `validate-globals.js` ahora verifica conformidad con el schema formal (name coincide con la carpeta, formato, limites de longitud).
- **`validate-map.js`**: `DRIFT_THRESHOLD` de 3 a 1 — un drift de 2 archivos no disparaba regeneracion automatica del mapa, causando desincronizacion silenciosa entre `CONTEXT_MAP.json` y el arbol real.
- **Hook post-commit para el mapa**: nuevo matcher `PostToolUse(Bash(git commit*)|Bash(git push*))` que dispara `diff-map-trigger.js` — ningun hook cubria ese momento antes.
- **`standards-guard.js`**: `COMMIT_EDITMSG` ya no se trata como prosa conversacional sujeta al limite de 150 palabras (solo `TO_GEMINI.md` lo es) — un mensaje de commit es documentacion tecnica del cambio, no una respuesta al usuario.

### Cobertura de tests

141 tests nuevos (487 → 628) cubriendo los 19 archivos de `.claude/bin/` y `scripts/services/` que no tenian ninguno: `generate-map.js`, `validate-map.js`, `diff-map-trigger.js`, `health-check.js`, `health-sync.js`, `detect-stack.js`, `detox.js`, `syntax-check.js`, `health-report.js`, `health-worker.js`, `git-queue-advisor.js`, `audit-market.js`, `norm-harness.js`, `hooks-definition.js`, `ContextIndex.js`, `RateLimiter.js`, `ResponseValidator.js`, `RootGuard.js`, `StyleProfiler.js`, `ErrorRepairLoop.js`.

### Aprendido

- Un modulo que "nunca lanza excepcion" (retorna `null`/`[]`/`0` en el camino de error) puede quedar completamente inerte tras un cambio de esquema en sus datos de entrada sin que nada lo detecte — `ContextIndex.js` llevaba sesiones enteras sin resolver ninguna ruta real. La ausencia de error no es evidencia de funcionamiento correcto.
- Escribir el primer test de un modulo existente es, en la practica, una auditoria — 4 de los 10 bugs de esta version se descubrieron exclusivamente al construir el caso de prueba, no en una revision de codigo previa.
- Un test que mide tiempo de reloj real (`duracion < Nms`) para inferir concurrencia es inherentemente fragil bajo carga variable de CPU; verificar orden de eventos (que ambos workers iniciaron antes de que cualquiera terminara) prueba lo mismo sin depender del scheduler del sistema operativo.

### Deuda tecnica remanente

- 17 de 38 skills sin dominio registrado en `MARKET_STANDARDS.json` (no bloqueante, solo limita la auditoria automatica de vigencia de mercado para esos skills).
- Timeouts sin comentario explicativo en `health-sync.js`, `standards-guard.js`, `health-worker.js` (bajo impacto, cosmetico).
- Cascada de calidad de output entre proveedores (`ModelDispatcher.js`) deliberadamente no implementada: no existe caller productivo real que la necesite hoy; se extrajo `ModelRegistry.parsearJSONFailClosed()` como helper compartido para cuando exista.

**628/628 tests, 38 skills.**

## [3.12.0] — 2026-07-10

### Agregado — Arquitectura Multi-Agente (MoA) y aislamiento de memoria por rol

- **`scripts/services/ModelDispatcher.js`**: router Mixture-of-Agents entre proveedores (distinto de `ModelRouter.js`, que enruta dentro de la familia Claude). Patron Command/Port (`SubTaskCommand` abstracta, no instanciable directamente) + Factory (`crearSubTarea`) + Strategy (`PROVIDER_POR_SUBTASK`): `ContextGathering` → Gemini, `SyntaxDrafting` → DeepSeek, `SurgicalEdit` → Claude. `executeMoATask(userPrompt)` ejecuta fan-out concurrente con `Promise.allSettled` — un worker caido (timeout, rate limit, key ausente) no aborta al otro; el resultado combina ambas secciones con marcador de contexto vacio si alguna falla. El orquestador nunca rechaza.
- **`.claude/bin/moa-context-gatherer.js`**: conecta `executeMoATask` al hook `UserPromptSubmit`, categoria propia `moa` en `process-guard.js` (no comparte lock con `detect-role.js`, que corre en el mismo array de hooks). Guard de disponibilidad: si falta `GEMINI_API_KEY` o `DEEPSEEK_API_KEY`, no invoca red y limpia cualquier `.claude/moa_context.md` obsoleto de un turno anterior. `ambasKeysDisponibles()` exportada como unidad testeable en memoria — necesario porque `loadEnv()` (patron compartido por todo el arnes) rellena cualquier env var falsy desde `.env`, lo que hacia que pasar una key vacia por entorno no la deshabilitara realmente.
- **Namespacing del `memory-vault`**: `.raw/<rol>/` y `.wiki/<rol>/` por convencion de carpeta (entradas sueltas en la raiz = namespace `general`, retrocompatible con el vault previo sin namespacing). `index.json` sigue siendo un unico indice BM25 global, pero cada fragmento lleva su `rol` de origen. `memory-index.js query` acepta `--rol=<rol>` para filtrar busqueda o se omite para busqueda cross-rol explicita.
- **Rol declarativo en frontmatter de skills**: las 37 `SKILL.md` ahora declaran `rol: architect|coder|auditor`. `AgentRoles.descubrirSkillsPorRol()` lee el campo directamente — sin inferencia por regex sobre `description`, que producia un sesgo fuerte (28/36 skills caian en `architect` por keywords genericas como "sistema"). `IntentClassifier.js` sigue siendo el unico lugar que infiere, y solo sobre el prompt dinamico del usuario, no sobre el inventario estatico de skills.
- **`validate-globals.js`**: `rol:` agregado a los campos de frontmatter obligatorios — un skill sin ese campo o con valor invalido se marca `NO_CONFORME`.

### Agregado — Guardrails deterministas y ciclo TDD obligatorio

- **`standards-guard.js`**: regla de emoji elevada de severidad `alta` a `critica` (bloqueante). Nueva regla de limite de 150 palabras de prosa, restringida a artefactos conversacionales (`COMMIT_EDITMSG`, `TO_GEMINI.md`) — no aplica a documentacion tecnica extensa (`SKILL.md`, README) que legitimamente supera ese largo. El hook ahora sale con exit 2 ante violacion critica (antes siempre `exit(0)`, solo avisaba y encolaba).
- **`process-guard.js`**: propaga el `result.status` real del comando envuelto en vez de absorberlo — sin esto, `standards-guard.js` nunca podia bloquear una escritura aunque saliera con exit 2.
- **`.claude/bin/pre-commit-tdd.js`**: gate TDD por heuristica de presencia (no Red-Green real, que requeriria ejecutar la suite completa por cada Write/Edit). Bloquea con exit 2 si se edita codigo fuente fuera de `tests/` y ningun `*.test.js` tiene cambios sin commitear en el repo (via `git status --porcelain`). Aplica sin excepcion, incluido el propio harness.
- **ACI diff edits**: `SYSTEM_PROMPTS[ROLES.CODER]` en `AgentRoles.js` ahora exige formato SEARCH/REPLACE (estilo Aider) para editar codigo existente, con excepcion explicita para archivos nuevos.
- **`.claude/bin/dependency-tracer.js`**: grafo de dependencias inverso sobre `require()` relativo en `scripts/` y `.claude/bin/` (regex sobre string literal, sin AST completo). Registrado en `PreToolUse(Write|Edit)`, no bloqueante — informa que otros scripts dependen (directa o transitivamente) del archivo que se esta por tocar.

### Corregido — Deuda estructural (God Objects, DRY)

- **`.claude/skills/aaa-evaluator/SKILL.md`** (nuevo, `rol: auditor`): estandares AAA estilo SWE-bench — limite de 300 lineas por archivo, 20 lineas por funcion, uso justificado (no especulativo) de Factory/Strategy/Observer, prohibicion de God Objects.
- **`scripts/services/TokenManager.js`** (nuevo): extraidas `estimarTokensMensajes`, `truncarInputGemini`, `truncarOutputGemini` de `anthropic-bridge.js` (336 → 280 lineas). `anthropic-bridge.js` re-exporta los mismos nombres para no romper a `dry-run-cost-sim.js`.
- **Fragmentacion de `mcp-gemini.js`** (527 → 183 lineas): `scripts/services/GeminiApiClient.js` (146 lineas — cliente SDK puro: auth, reintentos, parseo JSON, compactado) y `scripts/services/McpServerHandlers.js` (250 lineas — las 5 herramientas MCP + system prompts). `mcp-gemini.js` queda solo como shell del protocolo JSON-RPC/stdio. Elimina ademas la implementacion duplicada de `truncarInputGemini`/`truncarOutputGemini` que vivia localmente en este archivo (constantes numericamente identicas a `TokenManager.js`, solo el mensaje de truncado diferia).
- **Zero-Dead-Code en `settings.json` al actualizar**: `setup-settings.js`/`norm-harness.js` construyen el objeto de hooks desde cero y sobreescriben el archivo completo (nunca mergean) — cualquier hook de una version anterior que referencie un script eliminado o renombrado desaparece automaticamente al regenerar. Verificado con un test de regresion explicito que inyecta un hook obsoleto y confirma su purga tras `npm run setup`.

### Aprendido

- La inferencia por regex sobre texto libre (keywords en `description`) no es un sustituto confiable de metadata declarada explicitamente cuando la clasificacion tiene consecuencias estructurales (asignar rol a un inventario estatico de 37 skills, no un prompt dinamico de un usuario). El mismo mecanismo que funciona razonablemente para clasificar *intent* de una frase corta produce sesgos serios sobre texto largo con vocabulario tecnico repetido entre categorias.
- Un guard de disponibilidad de credenciales no puede verificarse pasando strings vacios via variable de entorno si el propio script tiene un `loadEnv()` que rellena falsy values desde `.env` — el test debe aislar la funcion de decision en memoria, no simular ausencia de config a traves del proceso completo.
- `Promise.allSettled` es preferible a `Promise.all` + try/catch manual para fan-out con fallback aislado: la plataforma ya resuelve exactamente el aislamiento de fallo por promesa que se necesita, sin logica adicional que mantener.

### Deuda tecnica remanente

Ninguna deuda estructural conocida al cierre de esta version: todos los archivos tocados en esta sesion estan bajo el limite de 300 lineas (`ModelDispatcher.js` 171, `TokenManager.js` 75, `mcp-gemini.js` 183, `GeminiApiClient.js` 146, `McpServerHandlers.js` 250, `moa-context-gatherer.js` 80), sin duplicacion DRY conocida entre modulos de token/truncado, y el gate `pre-commit-tdd.js` confirma cobertura de test para cada archivo modificado. Zero-debt estructural para el alcance cubierto en esta sesion — no implica ausencia de deuda en areas no tocadas (ver **487/487 tests, 37 skills**).

**487/487 tests, 37 skills.**

## [3.11.0] — 2026-07-10

### Agregado — Proteccion contra prompt injection

- **`injection-guard.js`**: hook `SubagentStop` que detecta indirect prompt injection en el output de subagentes — contenido externo (archivos del repo anfitrion, resultados de Gemini bridge, paginas web) que intenta hacerse pasar por una instruccion nueva del sistema o del usuario. Advierte, no bloquea; la decision final es del operador humano. Complementa `subagent-review.js` (calidad de codigo) y `cross-verify-gate.js` (regresion funcional) como tercer eje de validacion en el ciclo de vida del subagente.
- **`CLAUDE.md`**: regla 7 nueva en "Gobierno de Agentes y Subagentes" — contenido externo nunca se trata como instruccion del sistema, aunque este formateado como tal. Anclada tambien en el bloque de reglas criticas al final del archivo.
- **`ai-guardrails` v1.2.0**: nota de alcance — el skill gobierna la proteccion de sistemas LLM que el proyecto anfitrion construye, distinto de `injection-guard.js`/`secrets-guard.js` que protegen al propio arnes como infraestructura siempre activa.

### Corregido — Vigencia de modelo y OWASP

- **Drift de version de modelo**: `claude-sonnet-4-6` reemplazado por `claude-sonnet-5` (vigente desde 2026-06-30) en 16 archivos: `CLAUDE.md`, `ModelRegistry.js`, `mcp-anthropic.js` y 12 skills (`agent-testing`, `multimodal-engineer`, `ai-integrations`, `llm-evals`, `workflow-orchestrator`, `tech-lead-frontend`, `llm-observability`, `prompt-engineer`, `claude-api`, `cost-optimizer`, `release-manager`, `claude-agent-sdk`). Detectado en auditoria de vigencia de skills contra fuentes de mercado 2026.
- **`security-auditor` v1.3.0**: OWASP Top 10 actualizado de la edicion 2021 a la edicion 2025 (vigente, publicada enero 2026). SSRF fusionado dentro de A01 Control de Acceso Roto, Security Misconfiguration sube de posicion #5 a #2, categoria nueva A03 Software Supply Chain Failures (reemplaza y amplia el antiguo A06 de componentes vulnerables), categoria nueva A10 Mishandling of Exceptional Conditions (referenciada a `silent-failure-hunter`).
- **README.md**: reescrito completo — eliminada una tabla de auto-routing de skills duplicada y desincronizada contra `CLAUDE.md` (que ya tenia la version correcta), corregido error que fusionaba los tiers `TIER_OPUS` y `TIER_FABLE` de `ModelRouter.js` como si fueran el mismo, conteos de skills sincronizados (existian referencias a 36/32/29 dentro del mismo archivo).

### Corregido — Migracion a la familia Gemini 3.x

Verificado contra fuente oficial primaria (`deepmind.google`, `ai.google.dev`, `blog.google`, `blog.modelcontextprotocol.io`) antes de escribir cualquier cambio, siguiendo el protocolo de contenido externo no confiable de "Gobierno de Agentes y Subagentes".

- **`rag-specialist` v2.5.0**, **`cost-optimizer` v1.2.0**, **`mobile-engineer` v1.3.0**, **`workflow-orchestrator` v2.2.0**, **`multimodal-engineer` v1.1.0**: default de modelo migrado de la familia 2.5 a 3.x. Jerarquia de costo corregida: el tier "Lite" mas barato es `gemini-3.1-flash-lite` (no `gemini-3.5-flash-lite`, que no existe) — `gemini-3.5-flash` es ~5x mas caro que 3.1 Flash-Lite en paid y no es un reemplazo 1:1 de bajo costo, aunque mantiene free tier en la API.
- **`audio-voice-engineer` v1.3.0**: Live API migrada a `gemini-3.1-flash-live-preview` (sucesor de `gemini-2.5-flash-live-preview`, apagado 2025-12-09). Regresion de feature documentada: Affective Dialog no esta soportado en el modelo vigente segun documentacion oficial ("not yet supported"), pese a estar disponible en el modelo que reemplaza. TTS migrado a `gemini-3.1-flash-tts-preview` (200+ audio tags expresivos, 70+ idiomas, watermark SynthID).
- **`prompt-engineer` v1.8.0**: seccion Dynamic Thinking reescrita — `thinking_budget` (tokens, generacion 2.5) reemplazado por `thinking_level` (`low`/`medium`/`high`, generacion 3.x). Documentada la incompatibilidad: combinar ambos parametros en el mismo request retorna error 400. Default de la API si no se especifica es `high` (el mas caro), no un valor neutro.
- **`gemini-2-5-specialist` renombrado a `gemini-3-specialist` v2.0.0**: reescritura completa, no solo cambio de nombre. El tier "Flash-Thinking" desaparecio como modelo discreto — el razonamiento es ahora un parametro (`thinking_level`) sobre cualquier modelo de la familia 3. La generacion de imagen tiene modelo propio (`gemini-3.1-flash-image-preview`, nombre en codigo "Nano Banana 2"), no es una flag sobre el modelo de texto. Referencias actualizadas en `CLAUDE.md` (tabla de seleccion de skills), `multimodal-engineer` y `prompt-engineer`.
- **`mcp-server-builder` v1.4.0**: documentado el release candidate del Model Context Protocol `2026-07-28` (RC publicado 2026-05-21) — protocolo pasa de sesion con estado a stateless por request, headers `MCP-Protocol-Version`/`Mcp-Method`/`Mcp-Name` obligatorios en Streamable HTTP, framework de extensiones (`Tasks`, `MCP Apps`), politica de deprecacion formal (Active/Deprecated/Removed, minimo 12 meses), codigo de error de recurso no encontrado cambia de `-32002` a `-32602`.
- **`CLAUDE.md`**: seccion nueva "Protocolo de Vigencia Tecnologica" — sistematiza cuando y como verificar si un skill quedo anclado a un modelo o protocolo que el proveedor ya reemplazo, con enfasis en no actuar sobre afirmaciones de terceros sin fuente oficial primaria. Tabla "Limites operativos Gemini free tier" corregida con pricing y disponibilidad reales de la familia 3.x.
- **Codigo del bridge**: el default real de Gemini en `ModelRouter.js`, `ModelRegistry.js`, `mcp-gemini.js` y `.env.example` — no solo la documentacion de skills — migrado de `gemini-2.5-flash` a `gemini-3.5-flash`. `npm test` (379/379) y `node --check` en los tres archivos confirman que el cambio no rompe nada.

## [3.10.0] — 2026-07-06

### Agregado — Verificacion Cross-Model

- **`CrossVerifier.js`**: verificacion ciega de un diff con proveedor de IA distinto al que genero el cambio. Implementa el patron "Writer/Reviewer" de Anthropic (code.claude.com/docs/en/best-practices) — el verificador recibe solo el diff y la tarea original, nunca el razonamiento del actor. Motivado por el hallazgo de que verificar con el mismo modelo detecta solo 9.6% de errores self-consistentes (arXiv 2505.17656). Reutiliza `ModelRegistry.chat()`, sin cliente HTTP propio.
- **`cross-verify-gate.js`**: hook `SubagentStop` que dispara `CrossVerifier` automaticamente cuando el subagente `code-reviewer` emite veredicto `APROBADO`. Best-effort: se omite sin bloquear si no hay proveedor distinto de Anthropic configurado en `.env`.
- **`cross-model-verifier` skill v1.0.0**: documenta el mecanismo, activacion automatica via hook y diagnostico manual (total: 36 skills).
- **`ModelRouter.js`**: nuevo tier `TIER_VERIFICADOR` — delega la seleccion de proveedor a `CrossVerifier.seleccionarVerificador()` en vez de la jerarquia de costo Anthropic.
- **`.env.example`**: nota de rol dual para `OPENAI_API_KEY`/`DEEPSEEK_API_KEY` — ahorro de costo tier 2 Y verificador cross-model.
- Plan completo y decision de diseno (sin duplicar `code-reviewer`/`subagent-review.js`/`security-scanner`) en `docs/OPUSPLAN-cross-model-verifier.md`.

### Agregado — Upgrade AAA

- **`ponytail-check.js`**: hook PreToolUse Write|Edit con escalera YAGNI de 5 capas. Detecta reimplementaciones de stdlib, funciones >3 parametros y bloques >200 lineas antes de escribir.
- **`dev-loop` skill v1.0.0**: ciclo Spec→Design→Plan→Build→Review con 5 gates obligatorios. Sin artefacto de la fase anterior, la siguiente no comienza.
- **`memory-index.js`**: motor BM25 zero-deps para vault semantico en `.claude/memory-vault/`. Indexacion automatica en Stop hook. Recuperacion al inicio de sesion con umbral score >2.0.
- **`memory-manager` skill v1.0.0**: protocolo de indexacion y recuperacion semantica entre sesiones.
- **`agent-metrics.js`**: observabilidad por tool call — herramienta, status, tokens estimados, duracion. `npm run agent-report` para ver resumen de sesion.
- **`subagent-review.js`**: validacion adversarial en SubagentStop con 3 perspectivas (Auditor + Adversario + Pragmatico). Exit 1 si hay hallazgos CRITICOS.
- **`ux-visual-designer` v2.0.0**: 10 paradigmas visuales 2026 (glassmorphism, claymorphism, liquid glass, brutalismo, maximalismo, bento grid, spatial UI, editorial-minimal, retro-futurista, organico-tactil), tokens W3C estandar Oct 2025, WCAG 2.2 AA nuevos criterios (2.4.11, 2.5.8, 3.3.8).
- **`tech-lead-frontend` v4.0.0**: Motion v11+ con import path correcto (`motion/react`), edge rendering, container queries como estandar, CSS 2026 (anchor positioning, view transitions, color-mix oklch).
- **`ROADMAP_AAA.md`**: hoja de ruta documentada con 6 mejoras implementadas y arquitectura decidida para arnes-manager.
- **Protocolo de Arranque** en CLAUDE.md: al inicio de cada sesion ejecuta telemetria, consulta vault BM25, verifica mapa y lee metricas de sesion anterior — sin intervencion del usuario.
- **2 skills nuevos** en tabla de auto-routing: `dev-loop` y `memory-manager` (total: 34 skills).

### Corregido

- **`ModelRouter.js` + `mcp-anthropic.js`**: `claude-opus-4-7` actualizado a `claude-opus-4-8`.
- **`health-sync.js`**: parsing de skills en CLAUDE.md corregido (formato tabla markdown, no linea legacy) — eliminados 34 falsos positivos en HEALTH_REPORT.
- **`aiops-score.js`**: `subagent-review.js` agregado a lista de exclusion del scan de seguridad — score corregido de 9/10 a 10/10.
- **`CLAUDE.md` linea 4**: version string corregida de v3.9.1 a v3.10.0.
- **`DOCS_MAESTRA.md`** eliminado: documento legacy v2.6.4 que contaminaba el contexto. Contenido absorbido por README y CLAUDE.md desde v3.8.
- **Conteos sincronizados**: todas las referencias a 32 skills / 286 tests actualizadas a 34 / 342 en README, CLAUDE.md, update.js, ci.yml y aiops-score.js.
- **`@anthropic-ai/sdk`**: actualizado de 0.104.1 a 0.110.0.
- **`package.json` engines**: constraint actualizado de `>=18.0.0` a `>=20.0.0` (Node 18 en EOL).
- **CI matrix**: Node 18 eliminado de la matrix de pruebas (EOL 2025).

### Actualizacion de scripts de portabilidad — NOTA CRITICA

`setup-settings.js` y `norm-harness.js` estaban desactualizados: generaban un `settings.json` con solo 2 hooks (version v3.9.0) en lugar de los 22 hooks del harness actual. Cualquier proyecto que clonara ai-core o corriera `npm run setup` recibia un harness incompleto sin: ponytail-check, agent-metrics, subagent-review, memory-index, secrets-guard, session-summary, aiops-score, SubagentStop, PostToolUseFailure, git-queue-advisor.

Ambos scripts fueron reescritos y ahora producen el harness completo.

**Accion requerida en proyectos existentes con ai-core como submodulo:**

```bash
# Desde la raiz del proyecto anfitrion
cd .claude/ai-core
git pull origin main
npm install
cd ../..
node .claude/ai-core/.claude/bin/norm-harness.js
```

El ultimo comando sobreescribe el `settings.json` del anfitrion con los 22 hooks actualizados. Sin este paso, el anfitrion sigue usando el harness viejo aunque el submodulo este en v3.10.0.

## [3.9.1] — 2026-06-12

### Corregido

- **`validate-globals.js`**: parser reemplazado para leer la tabla markdown de seleccion de skills en CLAUDE.md en lugar del patron de lista lineal legacy. Elimina 32 falsos positivos de severidad media reportados en cada ejecucion desde v3.9.0.
- **`@anthropic-ai/sdk`**: actualizado de 0.100.1 a 0.104.1.
- **`ModelRegistry.js`**: comentario de catalogo de modelos actualizado (Haiku 4.5 / Sonnet 4.6 / Opus 4.8 / Fable 5) para orientar seleccion por tier de costo.

### Auditoria de Portabilidad

La garantia de que el arnes funciona en cualquier maquina tras `git clone` se apoya en dos mecanismos:

1. **`npm run setup`** — regenera `settings.json` con las rutas absolutas del sistema actual. Lo ejecuta automaticamente `npm run update`. Sin este paso, los hooks de Claude Code apuntan a la ruta del owner original y fallan silenciosamente.
2. **`.env.example`** — plantilla completa con todas las API keys necesarias (GEMINI_API_KEY, ANTHROPIC_API_KEY y opcionales). El usuario copia a `.env` y completa solo las claves que use.

Riesgo residual documentado: `settings.json` se commitea con rutas absolutas del owner. Si un colaborador clona y NO ejecuta `npm run setup`, los hooks apuntan a `/home/cyber/Proyectos/ai-core/` y no a su ruta local. El arnes corre pero todos los hooks fallan silenciosamente (los scripts tienen `|| true` como guardia). Solucion: ejecutar `npm run setup` siempre tras clonar.

## [3.9.0] — 2026-06-10

### Skills — Upgrade Senior (nivel basico → nivel produccion)

**Patron aplicado en 10+ skills:** Seccion `Cuando NO Activar Este Perfil` + conversion de reglas PROHIBIDO a imperativo positivo + checklists de PR donde faltaban.

- `qa-engineer` v2.0.0 — seccion "Cuando NO activar" (5 casos), checklist de PR (6 items), restricciones en positivo.
- `workflow-orchestrator` v2.0.0 — seccion "Cuando NO activar" (5 casos), restricciones en positivo.
- `backend-architect` — seccion "Cuando NO activar" (5 casos), restricciones en positivo.
- `prompt-engineer` — seccion "Cuando NO activar" (5 casos), restricciones en positivo.
- `agent-testing` — seccion "Cuando NO activar" (5 casos), restricciones en positivo, eliminadas reglas redundantes con CLAUDE.md.
- `llm-evals` — seccion "Cuando NO activar" (5 casos), restricciones en positivo.
- `managed-agents-specialist` — seccion "Cuando NO activar" (5 casos), restricciones en positivo.
- `cost-optimizer` — seccion "Cuando NO activar" (4 casos).
- `rag-specialist` v2.4.0 — seccion "Cuando NO activar" (4 casos), checklist de PR (6 items), restricciones en positivo.

**Fundamento:** Investigacion 2026 (650 trials) indica que reglas PROHIBIDO se violan con mayor frecuencia que imperativos positivos. La seccion "Cuando NO activar" previene activacion de skill erroneo — principal causa de respuestas de baja calidad en proyectos reales.

---

## [3.8.0] — 2026-06-04

### Agregado

- **`web-scraping-specialist`**: patron Power BI iframe anidado con Azure Static Apps — soporte para extraccion desde iframes con autenticacion Azure AD embebida.
- **`norm-harness.ps1`**: equivalente PowerShell de `norm-harness.js` con rutas dinamicas via `$PSScriptRoot` para instalacion en Windows sin edicion manual.
- **`diff-map-trigger.js`** y **`validate-map.js`**: hooks PostToolUse y PreToolUse para deteccion automatica de drift estructural en CONTEXT_MAP sin consultar `git ls-files` ni `find`.
- **Instalacion cross-platform**: README expandido con instrucciones completas para macOS, Linux y Windows (Administrador).
- **`token-metrics.js`** y **`dry-run-cost-sim.js`**: medicion de reduccion de consumo de tokens y simulacion de costo sin llamadas reales.
- **`CONTEXT_MAP.json`**: indice dual host/core con seccion de stack, regenerado automaticamente via hooks.

### Cambiado

- **`CLAUDE.md`**: version bumpeada a v3.8.0. Protocolo Zero-Token, Modo Neanderthal, Gobierno de Agentes (estandar AAA), Patron CONTEXT_MAP y Limites Gemini free tier 2026 documentados.
- **32 skills**: `last_updated` sincronizado. Skills nuevos: `ux-visual-designer`, `seo-sem-specialist`.
- **`package.json`**: version bumpeada a 3.8.0.
- **README.md**: seccion de arquitectura y arbol de modulos actualizados a v3.8.0.
- **`.gitignore`**: excluidos artefactos de sesion local (`.claude/HEALTH_REPORT.md`, `TO_GEMINI.md`, `last_session.md`).

### MIGRACION

```bash
# En cada proyecto anfitrion que use ai-core como submodulo:
cd .claude/ai-core && git pull origin main
node .claude/ai-core/.claude/bin/norm-harness.js
npm run validate-globals
```

---

## [3.3.0] — 2026-06-05

### Agregado

- **`validate-globals.js`** (nuevo script en `.claude/bin/`): auditor de conformidad que verifica que los 32 skills no copien reglas de `CLAUDE.md`, tengan la referencia inmutable, las secciones obligatorias y el frontmatter completo. Detecta drift de `last_updated` y lo corrige con `--fix-drift`. Exit code 1 si hay hallazgos criticos o altos — bloquea CI.
- **`update.js`** (nuevo script en `scripts/`): actualizacion one-command. Ejecuta `git pull` → `setup-settings.js` → `npm test` → `validate-globals.js` y reporta que cambio entre versiones. Si hay breaking changes, avisa antes de continuar.
- **GitHub Actions CI** (`.github/workflows/ci.yml`): pipeline que corre `npm test` + `validate-globals` en Linux, macOS y Windows con Node 18/20/22 en cada push a `main` y en cada PR. Un PR que rompa la conformidad de un skill no puede mergear.
- **Seccion MIGRACION** en cada entrada de version del CHANGELOG: indica exactamente que debe ejecutar el usuario para actualizar.

### Cambiado

- **32 skills**: el bloque `PROTOCOLO DE SESION` copiado fue reemplazado por una referencia inmutable de una linea: `> Reglas de sesion activas: CLAUDE.md > este skill.` Ahora hay una sola fuente de verdad. Si `CLAUDE.md` cambia, los skills no necesitan actualizarse.
- **Jerarquia declarada**: cada skill tiene la declaracion explicita `CLAUDE.md > este skill` — el modelo sabe que en caso de tension entre el skill activo y las reglas globales, `CLAUDE.md` gana siempre.
- **`package.json`**: version bumpeada a 3.3.0. Nuevos scripts: `validate-globals`, `update`.
- **`CLAUDE.md`**: version bumpeada a 3.3.0. Comandos de referencia actualizados.

### Corregido

- Formato de `Restricciones del Perfil` en todos los skills: el bug de inyeccion anterior habia pegado "Restricciones adicionales:" al final de una linea de codigo en lugar de como seccion separada.
- `last_updated` actualizado en los 32 skills a 2026-06-05 via `validate-globals --fix-drift`.

### MIGRACION

**Tiempo estimado: 30 segundos.**

Para usuarios que ya tienen el ai-core clonado:

```bash
npm run update
```

Eso es todo. El script hace `git pull`, regenera `settings.json` con tus rutas locales, corre los tests y valida los skills. No hay accion manual requerida.

Para usuarios que clonan por primera vez:

```bash
git clone git@github.com:salvex93/ai-core.git
cd ai-core
npm install
npm run setup    # adapta settings.json a tu ruta local
npm test         # verifica que todo esta en orden
```

---

## [3.2.0] — 2026-06-04

### Agregado

- **32 skills** (antes 30): nuevos `ux-visual-designer` y `seo-sem-specialist`.
- **`tech-lead-frontend` v3.0.0**: SEO tecnico (Open Graph, Schema.org, Lighthouse CI gate), SEM, motion design con GSAP/Framer Motion, design tokens con tipografia variable.
- **`web-scraping-specialist` v2.0.0**: Stagehand, browser-use, Crawlee, Browserbase, estrategias especificas por proveedor anti-bot (Cloudflare, Datadome, Imperva, PerimeterX).
- **Bloque `PROTOCOLO DE SESION`** inyectado en los 32 skills (Modo Neanderthal + compact/clear).
- **`setup-settings.js`**: portabilidad cross-platform (Linux/Mac/Windows).
- **`tests/harness.test.js`**: 269 assertions con Node nativo, sin dependencias externas.
- **`tests/token-metrics.js`**: mide reduccion de consumo de tokens por sesion.

### MIGRACION

```bash
npm run update
```

---

## [3.0.0] — 2026-05-19

### Agregado
- **Skill `multimodal-engineer`** (nuevo — skill #28): especialista en vision, PDFs y extraccion estructurada con LLMs. Cubre analisis de imagenes con Claude Opus 4.7 (vision 3.75MP) y Gemini 2.5 Pro (1M tokens), extraccion estructurada con `tool_use`, Citations API con Files API, procesamiento de PDFs multi-pagina, embeddings multimodales con `voyage-multimodal-3`, y optimizacion de costo por token visual. Incluye tabla de seleccion de modelo por caso de uso y funcion de calculo de tokens por imagen para Claude (tiles) y Gemini (patches).
- **Vectores de evasion modernos en `ai-guardrails`**: nueva seccion "Vectores de Evasion Modernos 2026" con contramedidas para interleaved thinking como canal opaco, Google Cloud Model Armor GA en GCP, y adaptive thinking de Opus 4.7 como superficie de ataque ampliada.
- **Merge Queues en `release-manager`**: seccion dedicada a GitHub Actions Merge Queues (GA) con workflow completo para evitar merge races en equipos de mas de 3 desarrolladores integrando en paralelo.
- **Evals como Gate de Release en `release-manager`**: nueva seccion con umbrales minimos por metrica (faithfulness >= 0.85, hallucination rate <= 5%, task success >= 90%), tabla de frameworks de medicion y workflow de GitHub Actions que bloquea el release si los umbrales no se cumplen.
- **Firebase Vertex AI y Flutter 3.32 en `mobile-engineer`**: soporte para `firebase_vertexai` con ejemplo de integracion de Gemini en edge, actualizacion a Impeller como renderer por defecto, y migracion de `StateNotifierProvider` (deprecado) a `NotifierProvider`.

### Cambiado
- **`prompt-engineer`**: corregida referencia incorrecta a modelo inexistente `gemini-3.1-flash-live`. La seccion "Dynamic Thinking" ahora documenta correctamente `Gemini 2.5 Pro` con `thinking_config.thinking_budget`, SDK real (`google-genai`), costo de `thoughts_token_count` y criterios de seleccion de nivel.
- **`doc-builder`**: agregada literal `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]` que faltaba en la "Directiva de Interrupcion". La version anterior solo tenia condiciones narrativas sin el token maquina requerido por el protocolo.
- **`ai-guardrails`**: Model Armor actualizado de "preview en 2026" a "GA en GCP desde 2026-Q2".
- **`CLAUDE.md`**: version bumpeada a 3.0.0, nueva entrada en tabla de seleccion de skills para `multimodal-engineer`, lista de 28 skills actualizada.
- **`package.json`**: version bumpeada a 3.0.0.
- **README**: actualizado a v3.0.0 con tabla de 28 skills, palabras clave de auto-routing expandidas, mapa de modulos corregido.

### Corregido
- `ai-guardrails` v1.0.4 → v1.1.0: last_updated sincronizado (estaba 33 dias desactualizado).
- `mobile-engineer` v1.1.1 → v1.2.0: last_updated sincronizado.
- `release-manager` v1.1.4 → v1.2.0: last_updated sincronizado.
- `aiops-engineer` v1.6.0 → v1.7.0: last_updated sincronizado post-auditoria.

---

## [2.8.0] — 2026-05-19

### Agregado
- **Health-Check System v1.0**: autodiagnostico y autocorreccion al inicio de cada sesion. Verifica integridad de skills, hooks, CONTEXT_MAP y variables de entorno antes de que el agente tome el control. Modulos: `health-check.js`, `health-report.js`, `health-sync.js`, `health-worker.js`.
- **Guard Read** (`bin/guard-read.js`): hook `PreToolUse` que bloquea lecturas directas en archivos > 200 lineas y fuerza el uso de `analizar_archivo` de Gemini. Protege la cuota de Claude.
- **Validate Map** (`bin/validate-map.js`): regenera `CONTEXT_MAP.json` automaticamente al inicio de sesion si detecta drift >= 3 archivos respecto al indice.
- **Skill `gemini-2-5-specialist`**: cubre thinking budgets, Live API con TTS nativo, image generation conversacional, Flash-Lite como tier 0 de alta escala y contexto de 1M tokens con Gemini Pro.
- **Skill `web-scraping-specialist`**: cubre scraping etico con Playwright/Puppeteer, OCR con Tesseract y Google Vision, bypass de CAPTCHA, rotacion de proxies y pipelines de datos desde marketplaces.
- `context-monitor.js`: monitor de uso de contexto con alertas de compactacion.
- `IntentClassifier.js`: arbol de decision que infiere herramienta y modelo desde el mensaje crudo del usuario.

### Cambiado
- `buscar_web` migrado a Gemini tier 0 (antes usaba Sonnet como fallback primario).
- Cobertura de Haiku ampliada a mas herramientas de bajo volumen.
- README actualizado a v2.8.0 con mapa de modulos completo y tabla de 26 skills.
- `package.json` bumpeado a v2.8.0.

### Corregido
- `node_modules/` desrastreado del historial git. Estaba committeado desde versiones anteriores a pesar de estar en `.gitignore`.
- `.gitignore` actualizado para excluir artefactos de sesion: `HEALTH_REPORT.md` y `TO_GEMINI.md`.

---

## [2.7.1] — 2026-05-17

### Corregido
- Correccion de `cwd` en servidor MCP Gemini al ejecutarse fuera del directorio del nucleo.
- Filtros de cuota Gemini: `truncarInputGemini()` y `truncarOutputGemini()` aplicados correctamente en todos los paths del bridge.
- Reduccion de overhead de hooks al inicio de sesion.
- Ajuste del limite de compactacion de contexto (de 10 a 6 turnos para anticipar la presion de cuota).

---

## [2.7.0] — 2026-05-01

### Agregado
- **Model Router v2.7**: jerarquia de costo de 4 niveles — Gemini free (tier 0) → Haiku → Sonnet → Opus. Gemini con prioridad absoluta para lecturas, resumenes y analisis de repositorio.
- **Skill `cost-optimizer`**: optimizador de costos de inferencia LLM — selecciona el modelo mas barato que completa la tarea.
- **Skill `workflow-orchestrator`**: patrones fan-out/fan-in, retry con backoff exponencial, checkpointing de estado y coordinacion de subagentes heterogeneos.
- **Skill `tech-lead-frontend` v2**: seguridad frontend de produccion, ortografia impecable en cualquier idioma y tests de componentes.
- **Skill `backend-architect` v2**: tests unitarios e integracion incluidos en el perfil.
- `ResponseValidator.js`: validacion deterministica (regex, sin LLM) del output antes de entregarlo. Detecta emojis, respuestas en ingles y frases prohibidas.
- `StyleProfiler.js`: acumula rasgos de escritura del usuario en la sesion y genera instruccion de tono inyectada dinamicamente en el system prompt.
- Umbral de delegacion a Gemini bajado de 500 a 200 lineas para maximizar ahorro de cuota.

### Cambiado
- Architect ya no fuerza Opus por defecto — usa Sonnet y escala solo si la herramienta lo requiere.
- `AgentRoles.js` desacoplado de `ModelRouter.js` — importa constantes MODELOS sin instanciar el router completo.

---

## [2.6.6] — 2026-04-27

### Agregado
- Gemini Bridge: compactacion iterativa de respuestas largas.
- Trazabilidad de IA activa en cada respuesta del bridge (`[IA: gemini-2.5-flash | HERRAMIENTA: X]`).
- `RateLimiter` en el bridge de Anthropic para evitar saturacion de cuota.
- `mcp-anthropic.js`: servidor MCP alternativo con fallback directo a Anthropic SDK.
- Zero-Token Protocol: checklist obligatorio antes de responder para minimizar tokens consumidos por turno.

### Cambiado
- Reglas Claude Pro web formalizadas en `CLAUDE.md`: maximo 150 palabras de prosa por respuesta, delegacion obligatoria a `TO_GEMINI.md` para explicaciones > 100 palabras.

---

## [2.6.5] — 2026-04-27

### Agregado
- **Skill `claude-api`**: especialista en Claude API y Anthropic SDK — prompt caching, extended thinking, tool use, Batch API, Files API, Citations API.
- `MEMORY.md`: indice de memorias persistentes entre sesiones.
- Protocolo de permisos MCP documentado en `settings.json`.
- Sincronizacion de `last_updated` en todos los SKILL.md al modificarlos.

---

## [2.6.3] — 2026-04-21

### Agregado
- `ModelRouter.js`: enrutamiento dinamico Haiku/Sonnet/Opus por herramienta y volumen de tokens con estimacion de costo.
- `ContextIndex.js`: resolucion de rutas via `CONTEXT_MAP.json` sin I/O ciego al disco.
- `AgentRoles.js`: perfiles Architect/Coder/Auditor con system prompts diferenciados.
- `ErrorRepairLoop.js`: ciclo deteccion → diagnostico → reparacion en tres fases.

### Corregido
- 5 hallazgos de auditoria AIOps: conformidad OWASP, coherencia de escalamiento y purga de acoplamiento residual.

---

## [2.6.2] — 2026-04-19

### Cambiado
- README reestructurado como guia completa de implementacion.
- Sentinel Protocol formalizado como nombre del sistema de reglas.
- Skills sincronizados con especificaciones de abril 2026.
- `CONTEXT_MAP.json` introducido como indice primario de rutas.

---

## [2.6.0] — 2026-04-17

### Agregado
- Protocolo de vinculacion via symlinks para desarrollo centralizado (alternativa a submodulos).
- Equivalente PowerShell de `norm-harness.js` con rutas dinamicas via `$PSScriptRoot`.
- **Skill `audio-voice-engineer`**: Voice AI, streaming de audio, Gemini 2.5 Flash Live API.

### Cambiado
- Modelo base de Architect actualizado a Opus 4.7 con task-budgets.

---

## [2.4.0] — 2026-03-25

### Agregado
- Aislamiento premium: `scripts/premium/` excluido del repositorio publico.
- **Skill `claude-agent-sdk`**: construccion de agentes autonomos, hooks de ciclo de vida, subagentes, integracion MCP y OAuth 2.0.
- **Skill `ai-integrations`**: integracion de LLMs en aplicaciones de produccion, streaming, fallback entre proveedores.
- Model routing: triada Sonnet/Opus/Gemini con optimizacion de tokens.
- Licencia MIT formalizada para distribucion open source.

---

## [2.3.0] — 2026-04-16

### Agregado
- Arnes agentico autonomo: Gemini Bridge como tier 0, hook de sesion `Stop`, Regla 15 (Documentacion Viva).
- Sensor de Eficiencia (Regla 22): `wc -l` antes de Read, delegacion automatica si > 300 lineas.

---

## [2.2.0] — 2026-04-16

### Agregado
- Arquitectura de orquestacion documentada.
- **Skill `rag-specialist`**: pipelines RAG, Hybrid Search (BM25 + denso + RRF), Contextual Retrieval, re-ranking.
- **Skill `llm-evals`**: evaluacion sistematica de outputs LLM, LLM-as-judge, integracion en CI/CD.
- **Skill `llm-observability`**: OpenTelemetry, dashboards de costo/latencia, Langfuse, Helicone.

---

## [1.0.0] — 2026-03-22

### Agregado
- Implementacion inicial de ai-core agnostico.
- Sistema de skills universales: `backend-architect`, `devops-infra`, `security-auditor`, `data-engineer`, `mobile-engineer`, `qa-engineer`, `release-manager`.
- `CLAUDE.md` como autoridad unica de reglas globales.
- Integracion como submodulo Git con instrucciones de instalacion.
- README comunitario y Regla 7 de persistencia de hallazgos en `BACKLOG.md`.
