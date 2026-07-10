# OPUSPLAN — Cross-Model Verifier

Estado: IMPLEMENTADO (2026-07-10). 372/372 tests OK, 36/36 skills conformes.
Pendiente exclusivamente: Andrew debe rellenar OPENAI_API_KEY/DEEPSEEK_API_KEY en .env
para que el gate deje de omitirse (Fase 0).

## Origen

Investigacion de estandares de mercado 2026 (research agent, 2026-07-10) sobre
regresiones silenciosas: fixes que rompen funcionalidad ya validada, sin deteccion
en la primera pasada de auditoria. Hallazgo clave: verificar con el mismo modelo
que genero el cambio detecta poco (solo 9.6% de errores self-consistentes se repiten
entre modelos distintos — arXiv 2505.17656). Patron oficial recomendado por Anthropic:
"Writer/Reviewer" — revisor en contexto fresco, ciego al razonamiento del actor
(code.claude.com/docs/en/best-practices).

Informe completo y gaps detectados: ver memoria de proyecto `project-regresiones-silenciosas.md`.

## Decision de diseno (validada contra duplicados existentes)

Se verifico el catalogo real de agentes (`.claude/agents/`) antes de aprobar:

- `code-reviewer.md` — clasifica hallazgos por severidad, bloquea si hay criticos,
  pero corre con el mismo Claude que genero el cambio (`provider: any`, no fuerza
  modelo distinto). No es ciego por diseno.
- `subagent-review.js` (hook `SubagentStop`) — validador adversarial automatico,
  detecta patrones textuales (catch vacio, `eval()`), no compara comportamiento
  antes/despues ni usa otro proveedor de IA.
- `security-scanner.md` — auditoria de seguridad, no de regresion funcional.

Ninguno fuerza proveedor distinto al que genero el cambio. Ese es el gap real.

**Decision:** `CrossVerifier.js` NO es un agente paralelo nuevo. Se invoca DENTRO
del flujo de `code-reviewer` como paso obligatorio antes del veredicto `APROBADO`,
y se dispara automaticamente via el mismo hook `SubagentStop` que ya gobierna
`subagent-review.js` — gate automatico, no depende de que Claude decida activarlo.

## Backlog de implementacion

### Fase 0 — Prerrequisito (accion de Andrew, no de Claude)
- [ ] Rellenar `OPENAI_API_KEY` y/o `DEEPSEEK_API_KEY` en `.env` (ya existen los
      placeholders en `.env.example`, `ModelRegistry.js` ya los detecta via
      `listProviders()` sin cambio de codigo).

### Fase 1 — CrossVerifier.js (nuevo archivo, scripts/services/, limite 300 lineas)
- [x] Funcion que recibe: diff del cambio + tarea/requisitos originales (NUNCA el
      razonamiento del actor — grading ciego, ver hallazgo "Verifier pattern con
      independencia total").
- [x] Selecciona proveedor distinto al que genero el cambio (si actor fue Claude →
      usar DeepSeek u OpenAI; nunca el mismo proveedor).
- [x] Prompt de revisor ciego: "¿este diff cumple la tarea sin romper nada fuera de
      su alcance?" — devuelve veredicto estructurado `{ pass: bool, hallazgos: [] }`.
- [x] Reutilizar `ModelRegistry.chat()` existente — no crear cliente HTTP nuevo.
- [x] Test unitario: camino feliz (pass) + camino de error (detecta regresion).

### Fase 2 — Integracion en ModelRouter.js
- [x] Nuevo tier `TIER_VERIFICADOR` en `scripts/services/ModelRouter.js` que fuerza
      proveedor distinto al actor — reutilizar patron OCP ya existente (agregar
      Set + rama en `route()`, sin modificar logica de tiers existentes).

### Fase 3 — Gate automatico en el hook SubagentStop
- [x] Extender `.claude/bin/subagent-review.js` (o script hermano) para que, cuando
      el subagente que termina es `code-reviewer` con veredicto `APROBADO`, dispare
      `CrossVerifier.js` antes de aceptar el veredicto como final.
- [x] Si `CrossVerifier` retorna `pass: false` → downgrade veredicto a
      `REQUIERE_CAMBIOS` y anexar hallazgos al reporte, formato ya definido en
      `code-reviewer.md`.

### Fase 4 — Skill de referencia
- [x] `.claude/skills/cross-model-verifier/SKILL.md` — documenta el mecanismo para
      que sea descubrible y auditable (aunque la activacion sea automatica via hook,
      no manual).

### Fase 5 — Housekeeping obligatorio (CLAUDE.md)
- [x] Actualizar `.env.example` con nota de rol dual (costo tier 0/2 + verificacion
      cross-model) para OPENAI_API_KEY/DEEPSEEK_API_KEY.
- [x] `npm run validate-globals` tras crear el skill nuevo.
- [x] `npm test` — el repo exige 351+ tests en verde, con los nuevos de CrossVerifier.
- [x] Evaluar si `cross-model-verifier` cumple los 3 criterios de agente (autonomia,
      salida estructurada, recurrente) — si los cumple, crear tambien
      `.claude/agents/cross-model-verifier.md` segun protocolo de CLAUDE.md.
- [x] Documentar en CHANGELOG.md la version que habilita esta capacidad.

## Pendiente de decision futura (fuera de este OPUSPLAN, backlog general)

Del informe de investigacion original, recomendaciones no incluidas en esta fase:

- Golden-state snapshot de `npm test` + outputs clave antes de cada fix (alto
  impacto, complejidad media) — comparar resultado antes/despues de un fix.
- Stop hook de verificacion funcional que corre `npm test` y bloquea el turno si
  falla, patron oficial Anthropic (alto impacto, baja-media).
- Dataset golden por skill critico + regression-detector en CI (medio impacto, alta
  complejidad — requiere curar 3-5 casos por skill).
- Memory decay explicito en el vault BM25+: timestamp de "ultima confirmacion de
  vigencia", bajar score de entradas no revalidadas en N sesiones (medio impacto,
  baja complejidad).
- Mutation testing selectivo en `scripts/services/` y `.claude/bin/` con Stryker,
  threshold 50-70% (bajo impacto, baja complejidad).

Ver memoria `project-regresiones-silenciosas.md` para el informe completo con fuentes.
