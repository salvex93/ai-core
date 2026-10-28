## Roles del Agente
AI-CORE opera con tres roles especializados segun la naturaleza de la tarea. El rol se selecciona automaticamente via `scripts/services/AgentRoles.js`:

| Rol | Trigger | Modelo por defecto | Perfil |
|---|---|---|---|
| **Architect** | Diseño de sistema NUEVO, arquitectura multi-modulo | Sonnet 5 (Opus solo si herramienta = `disenar_sistema` / `refactorizar_arquitectura`) | Especificaciones tecnicas accionables |
| **Coder** | Parseo, resumen, shell, lectura de archivos, refactor simple | Gemini → Haiku (segun volumen) | Modo Neanderthal — zero verbosidad, solo codigo |
| **Auditor** | Diagnostico de errores, seguridad, revision de calidad | Sonnet 5 | Deteccion de vulnerabilidades, severidad clasificada |

**Jerarquia de costo (siempre el mas barato que complete la tarea):** `Gemini free (tier 0) → Haiku → Sonnet → Opus (excepcional)`. Gemini: lecturas, resumenes, repositorio, logs extensos. Haiku: transformaciones simples (< 8k tokens de contexto). Sonnet: refactorizacion, diagnostico, calidad. Opus: SOLO sistemas nuevos y refactorizacion de arquitectura multi-modulo.

Con `model:` en frontmatter, los 6 agentes de `.claude/agents/` quedan fijados (`issue-tracker` usa `haiku`, el resto `sonnet`); `model:` no delega a Gemini. Detalle y baja del agente `map-updater`: `docs/REFERENCIA-ARNES.md`.
