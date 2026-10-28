## Seleccion de Skills — Automatica por contexto

NO esperar a que el usuario declare skills. Cada uno de los 46 skills en `.claude/skills/` trae en su `description` lenguaje explicito de activacion ("Activa al..."), que Claude Code ya lista via skill-discovery nativo (`skillListingBudgetFraction` y `skillListingMaxDescChars` en settings.json). Seleccionar el skill cuya description calce con la tarea. Co-activacion de dos skills: punto 6 del ANCLA.

## Arquitectura Skills vs Agents

Skill = perfil de comportamiento conversacional (lo adopta Claude, dura la sesion). Agente = subagente autonomo de loop cerrado con contexto cero. Crear un AGENT.md en `.claude/agents/` si Y SOLO SI la tarea cumple los tres criterios: autonomia real, salida estructurada verificable y recurrencia. Si no, es un skill.

Al agregar un skill: evaluar los tres criterios, crear el AGENT.md si los cumple, ejecutar `npm run validate-globals`. `ModelRegistry.js` expone `chat(provider, messages, options)` para gemini, anthropic, openai, deepseek y kimi (key en `.env` + adapter). Tabla de distincion, portabilidad multi-harness y proveedores: `docs/REFERENCIA-ARNES.md` (leer solo cuando la tarea lo requiera).
