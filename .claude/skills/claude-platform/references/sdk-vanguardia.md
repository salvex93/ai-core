## Modulo — Vanguardia en Diseno de Agentes con Claude Agent SDK

### IDENTIDAD DECLARADA ANTES DE EJECUTAR

Antes de generar codigo, definicion de subagente o configuracion de `query()`, completar:

`IDENTIDAD DE AGENTE: Rol unico (una frase, verbo de accion): [...] | Herramientas minimas (lista cerrada, no "todas"): [...] | Condicion de parada exacta (evento, no "cuando termine"): [...] | Modelo por paso segun complejidad (haiku/sonnet/opus, justificar cada uno): [...] | Que hace el hook onPreToolCall ante la primera herramienta destructiva: [una linea]`

Si algun campo queda vacio o generico ("todas las herramientas necesarias", "cuando el usuario lo pida"), no iniciar la construccion — es sintoma de agente sin scope definido.

### PROHIBIDO — PATRONES RECONOCIBLES DE DEMO/PLANTILLA

- Agente "asistente general" con `allowedTools: ["Bash", "Read", "Write", "WebSearch"]` sin restriccion — el set completo de herramientas built-in sin recorte es la firma de un demo de la propia documentacion, no un agente de produccion.
- System prompt que es una parrafada de "eres un asistente util y honesto" sin restriccion de dominio, sin lista de que NO debe hacer el agente.
- Subagente sin `description` especifica reutilizando literal el texto de ejemplo de la documentacion oficial ("Use this agent when...") sin adaptarlo al dominio real de la tarea.
- Loop de agente sin condicion de parada explicita, confiando en que el modelo "decida terminar solo" — reconocible porque no hay ningun `maxTurns`, contador de iteraciones ni evento de stop en el codigo.
- Hook `onPreToolCall` que solo hace `console.log` sin logica de bloqueo — presente para aparentar gobierno pero no bloquea nada.
- Integracion MCP copiada de un ejemplo publico con el mismo `name` y los mismos `args` de la tool, sin adaptar el scope de directorio o credenciales al proyecto real.

### GATE DE CALIDAD MEDIBLE (no solo estetico)

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Tool calls por tarea completada | <= 8 para tareas de complejidad media (no trivial, no multi-fase) | Contar eventos `agent.tool.pre_call` en logs estructurados de una corrida representativa |
| Iteraciones de loop hasta condicion de parada | 100% de las corridas terminan por evento de stop explicito, 0% por timeout/limite de tokens agotado | Revisar `agent_loop_iterations_total` vs conteo de eventos `agent.stop_condition.reached` en el periodo |
| Cache hit rate en el prefijo estatico del prompt | `cache_read_input_tokens` > 0 en al menos el 80% de las llamadas subsecuentes a la primera del loop | Inspeccionar el campo `usage` de cada respuesta de la API en una sesion de prueba de >= 5 turnos |
| Cobertura de hooks en herramientas destructivas | 100% de las herramientas con capacidad de escritura/eliminacion pasan por `onPreToolCall` con logica de bloqueo (no solo logging) | Grep dirigido de las definiciones de tools destructivas contra el registro de hooks activos, uno por uno |
| Aislamiento de permisos por subagente | 0 subagentes con `tools` igual al superset del orquestador | Comparar el campo `tools`/`disallowedTools` de cada `AgentDefinition` contra `allowedTools` del padre |

### VIGENCIA — ESTANDAR MAS RECIENTE DEL DOMINIO

Verificado contra `docs.claude.com` / `code.claude.com` (documentacion oficial del Agent SDK) en esta misma tarea: las Agent Skills en el SDK se controlan con la opcion `skills` de `query()` — no un flag de CLI — aceptando `"all"`, una lista de nombres o `[]`. Requiere que `settingSources` (TypeScript) / `setting_sources` (Python) incluya `"user"` y/o `"project"`; si se pasa una lista vacia, ninguna skill se descubre aunque exista en disco. Detalle no interpolable por analogia con el flujo de Claude Code CLI: el campo `allowed-tools` del frontmatter de un `SKILL.md` es ignorado completamente bajo el SDK — el control de herramientas para skills en contexto SDK se hace exclusivamente vía `allowedTools`/`allowed_tools` de `ClaudeAgentOptions`, nunca por el frontmatter del propio skill.

Dato adicional detectado pero NO verificado con el mismo nivel de certeza contra fuente primaria en esta pasada — orientativo, verificar antes de uso: fuentes de terceros mencionan renombrado de `ClaudeCodeOptions` a `ClaudeAgentOptions` en el SDK de Python y un modelo `claude-fable-5` agregado a los tipos del SDK de TypeScript; ninguno de los dos se contrasto directamente contra el changelog oficial en esta tarea, no escribir codigo que dependa de esos nombres sin confirmarlo primero en `docs.claude.com`.
