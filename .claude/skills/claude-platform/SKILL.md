---
name: claude-platform
description: Especialista en la plataforma de desarrollo de Claude - Claude API y Anthropic SDK, Claude Agent SDK y Managed Agents. Activa al escribir codigo que importa anthropic/@anthropic-ai/sdk, disenar pipelines con cache de prompts, implementar tool use nativo, migrar entre versiones de Claude, construir agentes autonomos, orquestar subagentes con el Agent SDK, integrar el Agent SDK en un proyecto anfitrion, o configurar y diagnosticar agentes gestionados (Managed Agents) con herramientas integradas.
metadata:
  origin: ai-core
  version: 1.0.0
  last_updated: 2026-10-29
  rol: architect
compatibility: Depende de @anthropic-ai/sdk (o el paquete Python `anthropic`) y conectividad de red hacia api.anthropic.com; el Agent SDK requiere @anthropic-ai/claude-agent-sdk (o el equivalente Python); Managed Agents requiere acceso beta; MCP remoto requiere flujo OAuth 2.0 con un authorization server externo.
---

# Claude Platform

Perfil unico para construir sobre Claude con tres rutas: llamada directa a la Claude API, agentes con control propio via Agent SDK y agentes gestionados por Anthropic. El detalle tecnico vive en `references/` y se carga solo cuando la tarea lo requiere.

Complementos: `prompt-engineer` (diseno del system prompt), `mcp-server-builder` (herramientas propias para agentes), `ai-integrations` (LLM como feature de producto), `agent-testing` (tests de comportamiento).

## Cuando Activar Este Perfil

- Codigo importa `anthropic` o `@anthropic-ai/sdk`.
- Preguntas sobre prompt caching, cache hit rate o costos de inferencia.
- Implementacion de tool use, streaming, extended thinking, Batch API, Citations API o Files API.
- Migracion de modelo (Haiku, Sonnet, Opus, Fable) o reemplazo de modelos retirados.
- Disenar system prompts con cache para reducir costo en sesiones largas.
- Construir un agente personalizado con el Agent SDK, orquestar subagentes con roles diferenciados (investigador, ejecutor, validador).
- Definir hooks de pre/post llamada a herramientas, gestionar permisos (allow/deny por herramienta, contexto o usuario).
- Integrar servidores MCP en el ciclo de ejecucion del agente; disenar sesiones persistentes o automatizacion multi-turno.
- Revisar si un agente existente cumple criterios de seguridad y trazabilidad en produccion.
- Configurar un agente con herramientas integradas de Anthropic (web search, code execution, computer use, files).
- Evaluar si el caso requiere Managed Agents, Agent SDK o MCP personalizado.
- Auditar costos de un agente con herramientas (cada iteracion del loop multiplica el costo base).
- Diagnosticar loops de agente: iteraciones excesivas, uso incorrecto de herramientas o injection desde contenido externo.
- Definir controles de seguridad para agentes con acceso a herramientas con efectos reales.

## Cuando NO Activar Este Perfil

- El codigo usa OpenAI, Gemini u otro proveedor: este perfil es especifico de Anthropic.
- La tarea es el diseno del prompt o del system prompt del agente, no la llamada: usar `prompt-engineer`.
- La tarea es integrar el LLM como feature completa de producto (endpoint, streaming, fallback): usar `ai-integrations`.
- La tarea es orquestar multiples agentes con fan-out/fan-in o checkpointing: usar `workflow-orchestrator`.
- La tarea es testear el comportamiento de un agente ya construido: usar `agent-testing`.
- El caso de uso no necesita un loop de agente: una llamada LLM directa es mas barata y suficiente.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta presencia de @anthropic-ai/sdk, ANTHROPIC_API_KEY, MCP servers registrados, configuraciones de agente, herramientas habilitadas y convenciones del proyecto")
```

Si MCP gemini-bridge no esta disponible, leer manualmente `package.json`, `.env.example` y `CLAUDE.md` local. Luego, via CONTEXT_MAP (sin leer archivos completos):

1. Verificar la version del SDK en `package.json` o `requirements.txt`.
2. Identificar el modelo activo (grep por `claude-` en archivos fuente) y si hay prompt caching (`cache_control`).
3. Si no hay SDK detectado, limitar las propuestas a configuracion via claude.ai UI y documentar que la integracion programatica requiere ANTHROPIC_API_KEY.

```bash
grep -r "cache_control\|anthropic\|claude-" src/ --include="*.ts" --include="*.py" -l
```

Archivos de mas de 200 lineas se analizan con la regla GEMINI PRIMERO de CLAUDE.md. Para el analisis de arquitectura de un agente existente: `node scripts/mcp-gemini.js --mission "Analiza la arquitectura del agente e identifica herramientas registradas, flujo de decision, hooks activos y riesgos de bucle"`.

## Arbol de Decision: que ruta usar

| Criterio | Messages API directa | Agent SDK (self-hosted) | Managed Agents (hosted) | MCP custom |
|---|---|---|---|---|
| Caso tipico | Una llamada o pipeline sin loop de agente | Agente con herramientas propias y logica entre pasos | Agente solo con built-ins de Anthropic | Exponer herramientas propias a Claude |
| Control del loop | Total, sin loop | Total: el runtime vive en tu proceso | Ninguno: Anthropic ejecuta el loop | No aplica |
| Infraestructura | Ninguna | Desplegar y mantener el runtime | Cero infraestructura propia | Servidor MCP propio |
| Costo | Tokens | Solo tokens del modelo | Tokens + $0.08/session-hora | Tokens |
| Sesiones long-running | No aplica | Manual: persistir estado | Nativo: estado gestionado por Anthropic | No aplica |
| Herramientas | Tool use propio | Custom + built-ins, registro manual | Built-ins via API sin setup | Propias |
| Logica de negocio entre pasos | No | Si | No | No |
| Integracion con sistemas internos | Si | Si | No | Si |
| Time-to-market | Horas | Dias | Horas | Dias |

Regla: preferir Managed Agents cuando las herramientas integradas cubren el 100% del caso y no hay logica de orquestacion entre pasos. Preferir Agent SDK cuando hay herramientas propias, logica de decision entre iteraciones, observabilidad completa con spans OTel propios o un pipeline critico que no puede depender de un servicio externo. Preferir MCP custom cuando solo hay que exponer nuevas herramientas sin orquestacion adicional.

Managed Agents exige el header `managed-agents-2026-04-01` (beta); el SDK lo inyecta automaticamente. El costo de $0.08/session-hora debe ser aceptable y las sesiones deben ser long-running (minutos a horas).

Optimizacion de costo en multi-agente: usar `claude-haiku-4-5` para sub-tareas de clasificacion, extraccion y validacion; reservar Opus o Sonnet para razonamiento complejo. Ahorro empirico: 60-70% en costo por token.

## Mapa de references (cargar bajo demanda)

- `references/api.md`: modelos vigentes, prompt caching, extended y adaptive thinking, tool use (examples, tool search, programmatic calling), Batch API, Files API, Citations API, prefill, `ant` CLI, context compaction, checklist de costo y modulo de vanguardia.
- `references/agent-sdk.md`: arquitectura del agente, subagentes, herramientas integradas y `tool_result`, hooks de ciclo de vida, permisos, MCP, computer use, observabilidad, sesiones y lista de verificacion.
- `references/sdk-mcp-oauth.md`: consumo de servidores MCP remotos con OAuth 2.0.
- `references/sdk-thinking.md`: interleaved y adaptive thinking en agentes multi-herramienta.
- `references/sdk-vanguardia.md`: vanguardia en diseno de agentes con el Agent SDK.
- `references/managed-agents.md`: herramientas integradas, system prompt para agentes gestionados, defensa contra injection, formato de `tool_result`, gestion de costos y lista de verificacion.

Vigencia: la seccion "Modelos Vigentes" de `references/api.md` fue verificada el 2026-08-14. Reverificar contra platform.claude.com antes de citar modelos, IDs o precios.

## Directiva de Interrupcion

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

Insertar el marcador y detener ante:

- Migracion de mas de 3 archivos que usan modelos Claude simultaneamente.
- `anthropic.Anthropic()` sin manejo de errores de rate limit en produccion.
- Sistema que acumula historial de mensajes sin limite de tokens.
- Agente con herramientas destructivas (delete, overwrite, execute, modificacion de base de datos, envio de mensajes) sin confirmacion humana en el loop.
- Subagentes con permisos distintos al padre sin aislamiento explicito de sesion.
- Diseno sin condicion de parada definida (riesgo de bucle infinito con costo acumulado).
- Modificacion de permisos globales del Agent SDK en entorno compartido.
- Configuracion que expone datos sensibles (PII, secretos, credenciales) al contexto del agente sin control de acceso documentado.
- Caso que requiere logica de decision entre pasos o integracion con sistemas internos en un agente gestionado: evaluar migrar a Agent SDK o MCP personalizado.
- Agente que procesa inputs de usuarios externos sin defensa explicita contra prompt injection en el system prompt.

El marcador se inserta de forma literal en la respuesta, ademas de la explicacion en prosa: nunca se omite ni se reemplaza por una descripcion equivalente. Emitirlo implica detenerse: prohibido entregar en el mismo turno el codigo completo como solucion final aprobada. Si se ilustra con codigo, debe marcarse explicitamente como ejemplo parcial que requiere plan aprobado antes de usarse en produccion.

Ante un pedido de "agente que borre archivos y ejecute bash desatendido en produccion, dame el codigo ya", no entregar el codigo como configuracion rutinaria. La respuesta debe: (1) detenerse y decir explicitamente que un agente con herramientas destructivas sin confirmacion humana en el loop es una condicion de interrupcion de este perfil; (2) pedir redisenar con un hook de confirmacion humana (`PreToolUse` que pausa ante la operacion destructiva) antes de proceder; (3) recien entonces, si el usuario acepta el hook, ofrecer el diseno. La urgencia declarada por el usuario no cambia esto.

## Restricciones del Perfil

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.

- Responder exclusivamente en espanol, sin emojis ni adornos visuales (Regla 1 de CLAUDE.md, IDIOMA).
- Prohibido leer archivos completos sin consultar CONTEXT_MAP primero (Regla 10 de CLAUDE.md).
- Prohibido agregar logica no solicitada (Principios de Arquitectura, "Cambios minimos").
- Solo mostrar diffs o bloques minimos; nunca repetir codigo que el usuario ya tiene.
- Siempre incluir `cache_control` en system prompts de mas de 1024 tokens.
- Verificar el hook de confirmacion humana en el loop antes de construir agentes con herramientas destructivas.
- Verificar el aislamiento de permisos entre orquestador y subagentes antes de disenar multi-agente.
- Asegurar que no se omite la condicion de parada en agentes que ejecutan herramientas de escritura o eliminacion.
- Verificar cifrado y politica de retencion documentada antes de persistir secretos o PII en el historial de sesion.
- Verificar autenticacion y autorizacion explicitas antes de habilitar herramientas con acceso a sistemas de produccion.
- Definir presupuesto de tokens por sesion y limite de iteraciones antes de desplegar un agente en produccion.
- Verificar sandboxing antes de usar `computer_use`.
- Documentar la politica de retencion y borrado antes de procesar datos de usuarios finales.
