# session-2026-09-20-validacion-mcp-bridge — wiki [general]
> Generado: 2026-09-21 | Fragmentos: 6

# Sesion 2026-09-20 — Validacion de vigencia y reparacion de carga del gemini-bridge

## Realizado

### 1. Validacion interna de vigencia

- `npm run validate-globals`: 45/45 skills conformes, 0 criticos, 0 altos.
- `npm run migrate-dry`: version 3.40.1 activa, sin migraciones pendientes.
- `npm run audit-market`: 2 hallazgos `SIN_DOMINIO_REGISTRADO` (`ciso`, `product-lifecycle-orchestrator`). Ningun modelo o SDK desactualizado.
- Dominios cercanos al umbral de 60 dias: `mcp-protocol` 55d (vence ~2026-09-25), `ai-core-internal-governance` 48d (vence ~2026-10-02).

### 2. Diagnostico del bloqueo de investigacion web

Se intento investigar el mercado (harnesses, skills, sistemas agenticos) y `web-search-guard.js` bloqueo WebSearch/WebFetch por presencia de `GEMINI_API_KEY`. Pero `gemini-bridge` no estaba conectado en la sesion: `claude mcp list` solo mostraba Claude Docs y Google Drive, y no existe `.mcp.json` en la raiz.

### 3. Reparacion aplicada

Registro local de ambos servidores, sin tocar el repo:
- `claude mcp add -s local gemini-bridge -- node /Users/andrewarizmendi/ai-core/scripts/mcp-gemini.js`
- `claude mcp add -s local anthropic-router -- node /Users/andrewarizmendi/ai-core/scripts/mcp-anthropic.js`
- Resultado: escritos en `~/.claude.json` (proyecto ai-core). `claude mcp list` los reporta Connected. Las tools MCP solo cargan al reiniciar la sesion.

## Aprendido

- `mcpServers` dentro de `.claude/settings.json` no hizo que Claude Code cargara los servidores. Causa inferida por observacion (no verificada contra la documentacion oficial): la ubicacion soportada es `.mcp.json` (scope project) o `~/.claude.json` (scope local/user).
- Los servidores `mcp-gemini.js` y `mcp-anthropic.js` cargan su propia `.env` via `loadEnv` — no requieren pasar la API key en el registro.
- Gap en `web-search-guard.js`: degrada a permitir la tool nativa solo si falta `GEMINI_API_KEY`, pero no comprueba que el bridge este realmente conectado. Con la key presente y el bridge caido, WebSearch y WebFetch quedan bloqueados sin alternativa (deadlock). CLAUDE.md regla 7 describe la degradacion solo para el caso sin key.
- `guard-read.js` probablemente tiene el mismo gap (mismo patron de degradacion) — no verificado.
- En esta sesion la tool Grep no estaba disponible; usar `grep` via Bash con patrones `--include='*.js'` entrecomillados (zsh expande el glob sin comillas y falla).

## Pendiente

1. Reiniciar la sesion y ejecutar la investigacion externa via `buscar_web` / `analizar_contenido` en tres frentes: harnesses y skills de GitHub (Claude Code, Codex CLI, OpenCode, Cline, OpenHands, Gemini CLI, Aider, anthropics/skills, agentskills.io); creadores dev y lideres tecnicos senior; vigencia de MCP y Claude Code. Verificar cada afirmacion contra fuente primaria antes de tocar el arnes (Protocolo de Vigencia Tecnologica).
2. Corregir de raiz la generacion de MCP: `setup-settings.js` y `norm-harness.js` escriben `mcpServers` en `settings.json` sin efecto. Generar `.mcp.json` desde un modulo compartido (patron de `hooks-definition.js`). Impacto: ambos generadores, `health-check.js` (lee `mcpServers.gemini-bridge.cwd`), `tests/harness/setup-settings-js.test.js`, `tests/harness/norm-harness-js.test.js`. Afecta tambien a proyectos anfitriones.
3. Cerrar el gap de `web-search-guard.js` (y verificar `guard-read.js`): confirmar disponibilidad real del bridge antes de denegar la tool nativa.
4. Registrar `ciso` y `product-lifecycle-orchestrator` en `MARKET_STANDARDS.json` con su dominio.
5. Reverificar dominio `mcp-protocol` antes de ~2026-09-25 y `ai-core-internal-governance` antes de ~2026-10-02.
6. Decidir si CLAUDE.md debe documentar que el registro MCP requiere `claude mcp add` o `.mcp.json`.