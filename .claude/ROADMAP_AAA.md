---
version: 1.0.0
created: 2026-07-06
scope: ai-core AAA upgrade + arnes-manager
---

# AI-CORE AAA — Hoja de Ruta

Plan de mejora derivado de investigacion: Ponytail, Superpowers (Jesse Vincent/obra), agent-skills y agent-house (Addy Osmani), claude-obsidian, idea-to-build (Winch XYZ).

La intencion es adoptar lo encontrado, no copiar. Cada mejora se adapta a la arquitectura y convenciones de ai-core.

---

## Orden de Implementacion

| # | Mejora | Impacto | Esfuerzo | Turno |
|---|---|---|---|---|
| 1 | Ponytail hook | Inmediato, cada sesion | Bajo | 1 |
| 2 | Dev-loop skill | Resuelve validacion | Medio | 2 |
| 3 | Memoria semantica | Resuelve context rot | Medio | 3 |
| 4 | Skills diseno 2026 | Calidad visual | Medio | 4 |
| 5 | agent-house | Observabilidad | Bajo | 5 |
| 6 | adverse en SubagentStop | Validacion subagentes | Bajo | 5 |

---

## Detalle por Mejora

### 1. Ponytail hook — enforcement de codigo quirurgico

**Fuente:** github.com/DietrichGebert/ponytail — escalera de decision YAGNI reinyectada cada turno.

**Que adoptar:** Escalera de decision ejecutable en hook `PreToolUse` (Write/Edit). Script que evalua antes de escribir:
1. ¿Necesita existir? No → skip (YAGNI)
2. ¿Ya existe en el codebase? → reutilizar
3. ¿Stdlib lo hace? → usar stdlib
4. ¿Feature nativa del platform? → usar nativa
5. ¿Dependencia ya instalada lo hace? → usar dependencia
6. ¿Cabe en una linea? → una linea
7. Solo entonces: minimo que funcione

**Implementacion en ai-core:**
- Nuevo script: `.claude/bin/ponytail-check.js`
- Hook: `PreToolUse` en Write/Edit
- Safety floor: nunca simplificar validacion en limites de confianza

**Impacto esperado:** -40% lineas por diff, diffs mas quirurgicos, mejor Modo Neanderthal.

---

### 2. Dev-loop skill — ciclo de validacion obligatorio

**Fuente:** Superpowers de Jesse Vincent (obra) + agent-skills de Addy Osmani.

**Que adoptar:** Skill `dev-loop` con 5 gates obligatorios antes de generar codigo. Sin artefacto de la fase anterior, no avanza. Subagentes frescos por tarea.

**Fases:**
1. **Spec** — entender el problema, no la solucion. Output: definicion del problema en <= 5 lineas.
2. **Design** — arquitectura y contratos antes de implementar. Output: interfaces/tipos + diagrama ASCII.
3. **Plan** — lista de pasos atomicos verificables. Output: checklist de cambios con rutas de archivo.
4. **Build** — implementar siguiendo el plan. TDD: test primero si aplica.
5. **Review** — revision adversarial del output. Output: hallazgos clasificados por severidad.

**Implementacion en ai-core:**
- Nuevo skill: `.claude/skills/dev-loop/SKILL.md`
- Integracion con agente `code-reviewer` existente en fase Review

---

### 3. Memoria semantica — claude-obsidian

**Fuente:** github.com/AgriciDaniel/claude-obsidian — patron LLM Wiki de Karpathy.

**Que adoptar:** Vault `.claude/memory-vault/` con estructura `.raw/` → `.wiki/`. BM25 nativo, backlinks, plain markdown, git-compatible. Sin BD externa.

**Implementacion en ai-core:**
- Estructura: `.claude/memory-vault/.raw/` + `.claude/memory-vault/.wiki/`
- Script: `.claude/bin/memory-index.js` — indexa al Stop, recupera al inicio de sesion
- Skill: `memory-manager` — define cuando indexar y como recuperar contexto relevante
- Reemplaza el sistema actual de archivos `.md` planos por uno con busqueda BM25

**Impacto esperado:** Resolucion del context rot, persistencia semantica real entre sesiones.

---

### 1. Ponytail hook — COMPLETADO (2026-07-06)
Script `.claude/bin/ponytail-check.js` con escalera YAGNI de 5 capas. Hook PreToolUse Write|Edit. 9 tests.

### 2. Dev-loop skill — COMPLETADO (2026-07-06)
Skill `.claude/skills/dev-loop/SKILL.md` v1.0.0. 5 gates: Spec→Design→Plan→Build→Review. 8 tests.

### 3. Memoria semantica — COMPLETADO (2026-07-06)
Motor BM25 `.claude/bin/memory-index.js`. Vault `.claude/memory-vault/`. Skill `memory-manager` v1.0.0. Stop hook activo. 10 tests.

### 4. Skills diseno 2026 — COMPLETADO

**Estado:** ux-visual-designer v2.0.0 y tech-lead-frontend v4.0.0 actualizados el 2026-07-06.

**Lo que se agrego:**
- 10 paradigmas visuales 2026: glassmorphism, claymorphism, liquid glass, brutalismo, maximalismo, bento grid, spatial UI, editorial-minimal, retro-futurista, organico-tactil
- Tokens W3C estandar Oct 2025 (`$value`/`$type`)
- CSS moderno 2026: container queries, view transitions, anchor positioning, color-mix()
- Motion: libreria correcta por caso (Motion v11+ renombrado, GSAP, Motion One)
- WCAG 2.2 AA nuevos criterios: Focus Not Obscured (2.4.11), Target Size (2.5.8), Accessible Authentication (3.3.8)
- Implementacion de cada paradigma con CSS de produccion
- Componentes LLM con streaming (Anthropic SDK v3+, prompt caching)
- Edge rendering: Vercel Edge, Cloudflare Workers, Astro Islands
- Frameworks 2026: Next.js 15+, Astro 5+, Svelte 5, Nuxt 3+

---

### 5. agent-house — COMPLETADO (2026-07-06)

**Fuente:** github.com/addyosmani/agent-house — Lighthouse para agentes. OpenTelemetry + Node.js.

**Que adoptar:** Metricas de costo/latencia/confiabilidad/contexto por agente. Integrado en hooks PostToolUse.

**Implementacion en ai-core:**
- Script: `.claude/bin/agent-metrics.js` — registra metricas por tool call
- Hook: `PostToolUse` — captura duracion, tokens estimados, exito/fallo
- Dashboard: reportes HTML generados por `npm run agent-report`

---

### 6. adverse en SubagentStop — COMPLETADO (2026-07-06)

**Fuente:** github.com/addyosmani/adverse — code review multi-agente paralelo.

**Que adoptar:** En `SubagentStop` hook, antes de integrar el output de un subagente, pasarlo por revision con 3 perspectivas: Auditor (seguridad/correctitud) + Adversario (casos borde, fallas) + Pragmatico (implementacion real).

**Implementacion en ai-core:**
- Script: `.claude/bin/subagent-review.js`
- Hook: `SubagentStop` — intercepta output antes de integrarlo al padre
- Condicion: solo activa si el output supera 100 lineas o modifica archivos criticos

---

## Post-AAA: arnes-manager

Una vez completados los 6 puntos anteriores, comenzar el gestor de arneses.

**Base tecnica ya identificada:**
- claude-session-driver (obra) — protocolo JSONL para workers paralelos. Adaptar para soporte remoto (Railway.app).
- idea-to-build (Winch XYZ) — flujo Understand→Context→Generate→Deep Dive→Critique→Plan para brainstorming estructurado.

**Arquitectura decidida:**
```
arnes-manager/
  api/          → Express/Fastify
  agents/
    harness-updater    → clona repo, npm run update, abre PR
    skill-auditor      → detecta skills obsoletos
    dependency-watcher → CVEs, versiones deprecadas
  dashboard/    → UI web
  cli/          → npx arnes-manager init
```

Deploy target: Railway.app. Instalable via `npx arnes-manager init`.
