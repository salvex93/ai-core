# CHANGELOG — AI-CORE

Registro de cambios por version. Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Versionado semantico: MAJOR.MINOR.PATCH.

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
