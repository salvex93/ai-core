## Protocolo de Ahorro de Tokens y Cuota

- **Contexto (punto 9 del ANCLA):** estimacion N turnos visibles × 800 tokens. TURNOS >= 6 → imprimir AL INICIO `[AVISO: contexto pesado — ejecuta /compact]`. TURNOS >= 15 → imprimir AL INICIO `[CRITICO: contexto saturado — ejecuta /clear]` y detener la tarea hasta que el usuario lo ejecute. Tras `/compact` resetear a 1, tras `/clear` a 0. Anticiparse siempre.
- **Mapa:** `.claude/CONTEXT_MAP.json` es el indice primario; leer un archivo solo si se va a modificar. PROHIBIDO `git ls-files`, `find` o `ls` para explorar estructura.
- **Bash masivo:** `bash-verbosity-guard.js` bloquea comandos de output sin acotar (log, diff, cat, find); preferir la version acotada o Read, Glob y Grep.
- **Gemini Bridge (TIER 0, gratuito, siempre primero):** archivo > 200 lineas → `analizar_archivo`; logs > 50 lineas → `analizar_contenido`; repositorio completo → `analizar_repositorio`; backlog o listas → `resumir_backlog`; busqueda web → `buscar_web`; investigacion extensa → Deep Research. Enforcement real solo en lectura de archivos y busqueda web (`guard-read.js`, `web-search-guard.js`). Sin bridge (cuota o conexion): tier Claude inmediato superior; los guards lo permiten automaticamente. Razonamiento profundo: Gemini lee, Claude razona sobre el resumen. Explicaciones de arquitectura > 5 pasos o comparacion de mas de 3 alternativas: delegar.
- **Filtros:** input a Gemini por `truncarInputGemini()` (8.000 tokens), output por `truncarOutputGemini()` (1.500 tokens).

Alcance del conteo de turnos, Anti-Detox y detalle de guards: `docs/REFERENCIA-ARNES.md`.
