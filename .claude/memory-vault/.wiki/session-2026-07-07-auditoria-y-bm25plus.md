# session-2026-07-07-auditoria-y-bm25plus — wiki [general]
> Generado: 2026-07-17 | Fragmentos: 10

# Sesión 2026-07-07 — Auditoría completa + BM25+ + Fable 5

## Realizado

### BM25+ — 3 mejoras al motor de memoria

1. **Stemming mínimo en español** — sufijos comunes (`-aciones`, `-ando`, `-ado`, `-mente`, etc.). "implementamos" y "implementado" ahora matchean el mismo token.
2. **Boost por campo (x3)** — tokens del frontmatter (`name` + `description`) se repiten 3 veces en el vector. Entradas bien tituladas suben en ranking.
3. **Query expansion de sinónimos de dominio** — 15 grupos: `arnes=harness=ai-core`, `sesion=session=conversacion`, `agente=agent`, etc. Mejora recall en queries naturales.

Resultado medido: query "sesion pasada implementado" → score 2.78 (antes: sin resultados).

### Auditoría aiops-engineer

Skills actualizados con Fable 5:
- `claude-api` v1.2.0 — tabla de modelos con Fable 5 + regla de selección vs Opus
- `workflow-orchestrator` v2.1.0 — mapeo split: `arquitectura` → Fable 5, `arquitectura_tools` → Opus 4.8
- `memory-manager` v1.1.0 — description actualizada a "BM25+"
- `gemini-2-5-specialist` v1.1.0 — Flash-Thinking agregado como tier intermedio
- `ai-integrations` v2.4.0 — `opus-4-6` reemplazado por `fable-5`
- `prompt-engineer` v1.7.0 — extended thinking actualizado con `fable-5`

### Auditoría completa de código (agente autónomo)

Hallazgos resueltos:
- `README.md:592` — `opus-4-7` en comentario de ejemplo → `opus-4-8`
- `README.md:778` — tabla Model Router con `opus-4-7` → `fable-5`
- `standards-guard.js:206` — `catch {}` vacío → log a stderr con mensaje de error
- `ModelRouter.js` — FABLE agregado como tier nuevo. TIER_FABLE cubre `disenar_sistema` y `refactorizar_arquitectura`. TIER_OPUS ahora solo cubre `auditar_seguridad_critica` (tareas que requieren computer use o tools integradas).
- `ModelRegistry.js` — ya tenía `claude-fable-5` en comentario; ahora ModelRouter lo soporta formalmente.

Hallazgos descartados (no son bugs reales):
- `catch (_)` en mcp-anthropic stdin — JSON-RPC: líneas inválidas son ruido normal del protocolo
- `catch (_)` en mcp-gemini compresión iterativa — retorna lo acumulado si una ronda falla
- `catch { return '?' }` en health-check getVersion — degradación graceful intencional

## Aprendido

### Fable 5 vs Opus 4.8 — distinción clave

Fable 5 es el modelo de razonamiento profundo sin herramientas integradas.
Opus 4.8 es para arquitectura CON computer use o tools integradas.
Esta distinción debe mantenerse consistente en todos los skills y en ModelRouter.

**Patrón a vigilar:** cuando se agregue un modelo nuevo, actualizar en este orden:
1. `ModelRegistry.js` (comentario)
2. `ModelRouter.js` (MODELOS + COSTO_POR_MODELO + tier)
3. `CLAUDE.md` (tabla de roles si aplica)
4. Skills afectados: `claude-api`, `workflow-orchestrator`, `ai-integrations`, `prompt-engineer`
5. `README.md` (tabla Model Router)

### MCP Memory — decisión diferida

MCP Memory oficial (@modelcontextprotocol/server-memory) fue evaluado y diferido.
Razón: con un solo proyecto el grafo queda plano. El momento correcto es al arrancar arnes-manager
donde habrá múltiples proyectos con entidades y relaciones cruzadas.

### Auditoria de código muerto

Los módulos `ContextIndex.js`, `StyleProfiler.js`, `ResponseValidator.js` solo son consumidos
por `anthropic-bridge.js`. No son código muerto — son dependencias del bridge.
Si el bridge se elimina en el futuro, estos 3 módulos quedan huérfanos.

## Pendiente / Deuda técnica

### Alta prioridad

- **arnes-manager** — proyecto principal pendiente. Arquitectura decidida (ver session-2026-07-06).
  Al arrancar: instalar MCP Memory como parte del setup inicial.

### Media prioridad

- **Test de coherencia setup-settings vs settings.json** — agregar en `harness.test.js` un test que
  ejecute `setup-settings.js` y compare su output con el `settings.json` real.
  Detecta inmediatamente cuando quedan desincronizados tras agregar hooks nuevos.

- **Automatizar norm-harness en proyectos anfitriones** — hook post-update en `update.js` que detecte
  si se ejecuta desde un submodulo y corra `norm-harness.js` en el proyecto padre automáticamente.

- **Skill `mcp-registry-navigator`** — nuevo skill para evaluar MCPs de terceros antes de instalar
  (mcp.run, glama.ai, transportes stdio vs SSE). Caso de uso directo en arnes-manager.

- **claude-sonnet-5 en ModelRouter** — el agente detectó `claude-sonnet-5` en models-cache.json
  pero no está en MODELOS. Evaluar si ya está en producción antes de agregarlo.

### Baja prioridad

- **Bootstrap del vault** — agregar entrada inicial en `.raw/` con estado del harness para que
  la primera query de sesión siempre tenga resultados (ahora funciona porque hay entradas reales).

- **Referencias a `claude-sonnet-4-6` en ejemplos de skills** — llm-evals, llm-observability,
  agent-testing, tech-lead-frontend tienen ejemplos con el modelo anterior. Son ejemplos de código,
  no routing activo — severidad baja, actualizar en la próxima sesión de mantenimiento.