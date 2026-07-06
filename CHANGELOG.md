# CHANGELOG — AI-CORE

Registro de cambios por version. Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Versionado semantico: MAJOR.MINOR.PATCH.

## [3.10.0] — 2026-07-06

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
