# Gobierno de agentes y ahorro de cuota: fundamento y verificaciones

Documento de consulta bajo demanda. Las reglas operativas viven en `CLAUDE.md`; aqui queda la justificacion y la evidencia que las respalda, movida sin cambios desde `CLAUDE.md` para no cargarla en el contexto de cada sesion.

## Conteo de turnos como proxy de consumo (verificado 2026-09-01)

El usuario opera indistintamente con API por token (billing real por input/output) y con Claude Pro (suscripcion con ventana de sesion de ~5h que se reinicia relativa al primer mensaje, mas un limite semanal, compartido entre Code/web/desktop/mobile). Anthropic no expone hoy ningun endpoint o telemetria documentada para que un hook o script lea cuanta cuota de sesion Pro resta -- confirmado que no es un gap de este arnes, es una limitacion real de lo que la plataforma expone. El conteo de turnos es la unica aproximacion posible sin esa telemetria, y aplica igual de bien a ambos modelos: en API, se acerca al limite de contexto del modelo; en Pro, un turno "pesado" (mucha lectura/escritura) consume proporcionalmente mas de la ventana de sesion aunque el usuario no vea el conteo de tokens exacto. No tratar el aviso como exclusivo de gestion de contexto de API -- sirve igual para avisar antes de agotar cuota de sesion Pro.

## Alcance de la regla de turnos vs `compaction` nativo de la API (evaluado 2026-08-05)

El conteo de turnos y el aviso `/compact` gobiernan exclusivamente la sesion interactiva de Claude Code (la CLI) — `/compact` es un comando propio del harness de Claude Code, no un parametro de la Messages API. Anthropic ofrece ademas un mecanismo de `compaction` server-side (beta, header `compact-2026-01-12`, dispara automaticamente a 150k tokens de input) para llamadas directas a la API con historial de mensajes creciente. Verificado contra el codigo real: ningun modulo de `scripts/services/` (`ModelRegistry.js`, `CrossVerifier.js`, `SubagentGrader.js`, `ErrorRepairLoop.js`) acumula un array `messages` que crezca entre llamadas a la API — cada invocacion a `chat()`/`chatAnthropic()` es un intercambio de un solo turno, asi que el `compaction` nativo no tiene un caso de uso real hoy en este proyecto. Si en el futuro se agrega un modulo que mantenga conversacion multi-turno contra la API de Anthropic (ej. un agente con memoria de sesion propia via SDK), evaluar `compaction` nativo ahi antes de reimplementar una heuristica manual de poda — no aplica a la regla de turnos, que sigue vigente para la sesion de Claude Code.

## Auto-compact nativo de la CLI (verificado 2026-08-31 contra code.claude.com/docs/en/context-window y /model-config)

Claude Code YA compacta la sesion interactiva de forma automatica y transparente al acercarse al limite real de tokens de la ventana de contexto del modelo activo (umbral configurable via `autoCompactWindow` en `settings.json`, variable de entorno `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, o el comando `/autocompact <umbral>` en sesion) — mecanismo distinto y superior al conteo heuristico de turnos, porque opera sobre tokens reales (dos sesiones de 6 turnos pueden diferir en 10x de tokens segun cuanto se leyo) en vez de un proxy aproximado. El conteo de turnos NO decide cuando compactar — eso ya lo resuelve el auto-compact nativo solo, sin intervencion — su unico valor restante es ser una capa INFORMATIVA en prosa para que el usuario vea un aviso legible antes de que el auto-compact dispare en silencio. El umbral de TURNOS >= 15 ("detener y pedir /clear") no tiene equivalente nativo (el auto-compact nunca detiene la tarea) y se mantiene como politica propia del proyecto para limitar ruido/costo de sesion, no para evitar overflow de contexto.

## Supervisor con presupuesto por hallazgo (practica de campo del harness oficial de Anthropic, verificado 2026-09-02)

Fuente: `github.com/anthropics/defending-code-reference-harness`, `docs/best-practices.md`. Caso real documentado de runaway: pipeline de 4 agentes en loop 264h, $47k gastados (`vectara/awesome-agent-failures`).

`subagent-budget-guard.js` es un techo ciego de llamadas; no distingue trabajo productivo de giro en falso. El harness oficial complementa esto con un supervisor que "gates at a $/finding threshold" y — clave — "runs in a separate context from the worker". Aplicacion en ai-core cuando el hilo principal orquesta un pipeline de subagentes de deteccion (security-scanner, code-reviewer en fan-out, o el patron de `workflow-orchestrator`):

- El hilo principal actua como supervisor y NO comparte el contexto de trabajo de cada subagente — cada subagente arranca con contexto cero (regla 1) y devuelve solo su reporte truncado (regla 4). El supervisor evalua ese reporte, no la traza de razonamiento.
- Criterio de corte: si un subagente consume su ventana de trabajo (se acerca al techo de 40 llamadas de `subagent-budget-guard.js`) sin producir ningun hallazgo nuevo con witness de nivel 2+ (ver `security-scanner.md` / `code-reviewer.md`), el supervisor NO relanza ese subagente sobre la misma particion — reasigna la particion o la marca "revisar manualmente" y sigue.
- Regla derivada: costo marginal decreciente = detener. Si la ronda N de subagentes produjo la mitad de hallazgos verificados que la ronda N-1, la ronda N+1 no se lanza.

## Capas anti-runaway entre subagentes (gap cerrado 2026-09-02)

Ambas aplican SOLO dentro de subagentes (`agent_type` presente, nunca al hilo principal), matcher `Bash|Write|Edit|Read|Grep|Glob|WebFetch|Agent`:

- `subagent-budget-guard.js`: techo fijo de 40 llamadas a tools por subagente (session_id+agent_type), independiente de semantica — recomendacion explicita del post-mortem real ("Per-agent and per-pipeline budget caps are non-negotiable"). Al superarse, bloquea exit 2.
- `loop-alternante-guard.js`: detecta el patron A-B-A-B-A-B entre 2 tools distintas alternando 6+ ciclos sin converger, aunque los argumentos cambien en cada vuelta (patron validado en produccion por OpenHands StuckDetector, `docs.openhands.dev/sdk/guides/agent-stuck-detector` — comparacion de firma `tool_name`, sin embeddings ni LLM-as-judge por ronda, que el paper de semantic early-stopping, arXiv 2606.27009, confirma contraproducente en costo). La PRIMERA deteccion solo ADVIERTE (exit 0); si el mismo patron persiste en una segunda ventana completa, BLOQUEA (exit 2).
