---
name: claude-agent-sdk
description: Especialista en construccion de agentes autonomos con el Claude Agent SDK (TypeScript/Python). Cubre herramientas integradas, hooks de ciclo de vida, subagentes, integracion MCP, OAuth 2.0 client flow (Authorization Code + PKCE) para servidores MCP remotos, gestion de permisos y sesiones. Activa al construir agentes personalizados, orquestar subagentes, integrar el Agent SDK en un proyecto anfitrion o disenar flujos de automatizacion con Claude.
origin: ai-core
version: 2.2.1
last_updated: 2026-04-21
---

# Claude Agent SDK — Especialista en Agentes Autonomos

Cubre la construccion de agentes autonomos con el Claude Agent SDK de Anthropic. Dominio: orquestacion de herramientas, ciclo de vida del agente, composicion de subagentes e integracion con servidores MCP. No duplica `ai-integrations`; donde ese skill cubre llamadas directas al LLM como feature de producto, este skill cubre agentes que razonan, actuan y se coordinan.

Disponible en TypeScript (`@anthropic-ai/sdk`) y Python (`anthropic`). Para extender Claude Code con herramientas y hooks propios, usar `claude-code-sdk` (TypeScript).

## Cuando Activar Este Perfil

- Al construir un agente personalizado con el Agent SDK de Anthropic.
- Al orquestar multiples subagentes con roles diferenciados (investigador, ejecutor, validador).
- Al definir hooks de pre/post llamada a herramientas para logging, validacion o interrupcion.
- Al integrar servidores MCP en el ciclo de ejecucion del agente.
- Al gestionar permisos de herramientas (allow/deny por herramienta, por contexto, por usuario).
- Al disenar sesiones persistentes o flujos de automatizacion multi-turno con Claude.
- Al revisar si un agente existente cumple criterios de seguridad y trazabilidad en produccion.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta presencia de @anthropic-ai/sdk, ANTHROPIC_API_KEY, MCP servers registrados, configuraciones de agente y convenciones de herramientas")
```

Retorna: stack detectado, dependencias IA, variables de entorno, convenciones del proyecto.

Si MCP gemini-bridge no disponible → leer manualmente: `package.json`, `.env.example`, `CLAUDE.md` local.

Archivos > 500 lineas / 50 KB → Regla 9: `node scripts/mcp-gemini.js --mission "Analiza la arquitectura del agente e identifica: herramientas registradas, flujo de decision, hooks activos, riesgos de bucle infinito, ausencia de condicion de parada y surface de inyeccion de prompt" --file <ruta> --format json`

## Directiva de Interrupcion

Insertar directiva y detener ante:
- Agente con herramientas destructivas (delete, overwrite, execute) sin confirmacion humana en el loop.
- Subagentes con permisos distintos al padre sin aislamiento explicito de sesion.
- Diseno sin condicion de parada definida (riesgo de bucle infinito con costo acumulado).
- Modificacion de permisos globales del Agent SDK en entorno compartido.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Arquitectura de un Agente

### Componentes obligatorios

1. Definicion de herramientas — que puede hacer el agente.
2. System prompt — quien es y cuales son sus restricciones.
3. Loop de razonamiento — turno de Claude + ejecucion de herramienta + turno siguiente.
4. Condicion de parada — cuando el agente termina sin intervenir al usuario.

Sin condicion de parada, el agente puede iterar hasta agotar el presupuesto de tokens o el timeout de sesion.

### Separacion de responsabilidades en multi-agente

```
Orquestador → Investigador (solo lectura)
           → Ejecutor    (escritura, requiere confirmacion humana)
           → Validador   (solo lectura + evaluacion de outputs)
```

Cada subagente tiene scope de herramientas restringido al minimo necesario para su rol. El orquestador no ejecuta herramientas destructivas directamente — las delega al ejecutor.

## Herramientas Integradas (Built-in Tools)

| Herramienta | Capacidad | Cuando usar |
|---|---|---|
| `bash` | Ejecuta comandos de shell | Automatizacion de entorno, CI/CD local |
| `text_editor` | Lee y edita archivos | Modificaciones de codigo, configuracion |
| `browser` | Navega paginas web | Investigacion, scraping estructurado |
| `computer` | Control de GUI (computer use) | Automatizacion de interfaces de escritorio |
| `web_search_20250305` | Busqueda web en tiempo real | Datos actuales, docs externas |

Nota: el nombre `web_search_20250305` incluye fecha de version. Verificar identificador vigente en `docs.anthropic.com/tools` antes de usar en proyecto nuevo — un nombre obsoleto hace que la herramienta no se active sin error explicito.

Herramientas destructivas (`bash` con rm/delete, `text_editor` con write) requieren hook de confirmacion humana en produccion o sobre repositorios compartidos.

## Hooks de Ciclo de Vida

Los hooks interceptan el ciclo antes o despues de cada llamada a herramienta. Son el unico mecanismo para:
- Auditoria de todas las acciones del agente (obligatorio en produccion).
- Circuit breaker por herramienta (bloquear despues de N errores consecutivos).
- Confirmacion humana en el loop (Human-in-the-Loop).

`onPreToolCall(toolName, toolInput)` → puede retornar `{ action: "block", reason: "..." }` para bloquear.
`onPostToolCall(toolName, toolInput, toolOutput)` → para logging de resultado y deteccion de errores.

Implementar siempre ambos hooks en agentes de produccion. El pre-hook valida y loguea la intencion; el post-hook registra el resultado y el exito/fallo.

## Gestion de Permisos

Principio: minimo privilegio. El constructor del agente recibe `permissions: { allow: [...], deny: [...] }`. En produccion, los permisos se definen en configuracion externa (`.claude/settings.json` o variable de entorno), no como literales en el codigo.

## Integracion con Servidores MCP

Cada servidor MCP extiende el set de herramientas del agente via `mcpServers: [{ name, command, args }]`. Antes de agregar un servidor MCP:
- Verificar que esta en el registro oficial de Anthropic o tiene audit externo.
- Restringir scope al directorio o recurso minimo necesario.
- El servidor MCP no debe tener acceso a variables de entorno del agente principal (aislamiento de credenciales).

## Computer Use — Uso Seguro

Superficie de riesgo mayor que `bash` o `text_editor` — opera sobre el entorno grafico completo. Principios obligatorios:
- Aislamiento: el agente debe correr en escritorio aislado (contenedor con Xvfb, VM, sandbox). Nunca en el escritorio del usuario en produccion.
- Confirmacion humana por sesion: el hook `onPreToolCall` pausa y requiere confirmacion explicita antes de cada accion de alto riesgo (`left_click`, `right_click`, `type`, `key`).
- Perimetro declarado: el system prompt lista exactamente las aplicaciones y acciones permitidas. Cualquier accion fuera del perimetro activa el bloqueo del hook.
- Logging de capturas: cada captura de pantalla se persiste con timestamp en log de auditoria. Las capturas pueden contener datos sensibles — gestionar retencion segun politica del anfitrion.

## Observabilidad del Agente

### Metricas obligatorias

```
agent_tool_calls_total{tool_name, status}           # invocaciones por herramienta
agent_tool_duration_seconds{tool_name}              # duracion de cada invocacion
agent_tokens_consumed_total{model, token_type}      # token_type: input | output
agent_loop_iterations_total{agent_name}             # iteraciones del loop por sesion
agent_sessions_active{agent_name}                   # sesiones activas (gauge)
```

### Logs estructurados — campos obligatorios

`timestamp`, `evento`, `agente`, `sesion_id`, `herramienta`, `iteracion`, `trace_id`.

Eventos obligatorios: `agent.session.started`, `agent.session.ended`, `agent.tool.pre_call`, `agent.tool.post_call`, `agent.tool.blocked`, `agent.stop_condition.reached`, `agent.loop.error`, `agent.limit.reached`.

Instrumentar con OpenTelemetry: un span por invocacion de herramienta, atributos `agent.tool.name` y `agent.tool.success`. Adjuntar el span en `onPreToolCall` y cerrarlo en `onPostToolCall`.

## Gestion de Sesiones

- El historial de sesion no debe incluir datos sensibles (PII, secretos) en texto plano.
- Definir TTL maximo de sesion para liberar recursos y evitar acumulacion de tokens en contexto.
- En sistemas multi-usuario, cada sesion debe estar aislada por identificador de usuario.

## Consumo de Servidores MCP Remotos con OAuth 2.0

Servidores MCP via SSE/HTTP pueden requerir OAuth 2.0 para proteger recursos del usuario. El agente implementa el flujo Authorization Code + PKCE como cliente OAuth.

Cuatro pasos: (1) generar PKCE `code_verifier` + `code_challenge` (SHA-256, base64url), (2) construir URL de autorizacion con `response_type=code`, `code_challenge_method=S256` y `state` aleatorio anti-CSRF, (3) intercambiar el codigo de autorizacion por tokens via POST al `tokenEndpoint`, (4) incluir `Authorization: Bearer {accessToken}` en el header del servidor MCP en cada llamada.

### Almacenamiento y renovacion de tokens

- `access_token`: no almacenar en texto plano. Usar gestor de secretos del proveedor de nube o keychain del OS en entornos locales.
- `refresh_token`: almacenar cifrado. Si tiene TTL indefinido, tratarlo como secreto de larga duracion.
- Renovacion proactiva: refrescar cuando falten menos de 60s para la expiracion de `access_token` — no esperar el error 401.
- Si el `refresh_token` esta expirado o revocado, relanzar el flujo completo de autorizacion.

Si la integracion OAuth actua en nombre de un usuario final (user-delegated) con scopes de escritura o eliminacion → activar confirmacion humana en el loop antes de ejecutar cualquier herramienta destructiva.

## Interleaved Thinking en Agentes Multi-Herramienta

Permite que el modelo emita bloques `thinking` entre llamadas a herramientas, razonando sobre cada resultado antes de decidir la siguiente accion.

Cuando activar:
- El agente toma decisiones condicionales basadas en resultados intermedios de herramientas.
- El flujo tiene mas de tres pasos de herramienta con dependencias entre ellos.
- La tarea requiere verificacion de coherencia entre resultados de diferentes herramientas.

No activar en flujos deterministas simples — el overhead de tokens no se justifica sin razonamiento adaptativo.

Reglas: incluir bloques `thinking` del turno anterior en el historial del siguiente. Loguear tokens thinking separado. Requiere `claude-sonnet-4-6` o superior.

## Adaptive Thinking — Opus 4.7

`claude-opus-4-7` introduce pensamiento adaptativo: el modelo asigna presupuesto de razonamiento de forma variable por paso, proporcional a la complejidad local de cada decision. Es la opcion optima para agentes con pasos de complejidad heterogenea.

Activar con `thinking: { type: "auto" }` en lugar de budget fijo:

```typescript
const respuesta = await cliente.messages.create({
  model: 'claude-opus-4-7',
  thinking: { type: 'auto' },   // el modelo decide el budget por paso
  max_tokens: 16000,
  messages: historial,
});
```

Cuando usar cada modo:
- `{ type: "auto" }` (Opus 4.7): pasos de complejidad variable — ahorra en pasos simples sin degradar calidad en pasos complejos.
- `{ type: "enabled", budget_tokens: N }` (Opus/Sonnet 4.6): costo predecible por llamada o complejidad uniforme entre pasos.

Loguear `thinking_tokens` separado de `output_tokens` en ambos modos. La diferencia entre llamadas revela que porcion del costo es razonamiento adaptativo.

## Lista de Verificacion — Agentes

1. Herramientas: solo las necesarias para el rol (minimo privilegio).
2. Condicion de parada: al menos una condicion explicita en el loop de razonamiento.
3. Hooks: `onPreToolCall` loguea y valida antes de ejecutar herramientas destructivas.
4. MCP: cada servidor auditado, scope restringido al minimo.
5. Permisos: en configuracion externa, no hardcodeados en el codigo.
6. Sesiones: si es multi-turno, las sesiones tienen TTL y aislamiento por usuario.
7. Costos: limite de tokens o iteraciones configurado para evitar bucles costosos.
8. Injection: input del usuario pasa por proteccion de prompt injection (ver `ai-integrations`).
9. Precision: cada hallazgo cita ruta relativa y numero de linea exacto.

## Managed Agents vs Agent SDK — Arbol de Decision

Anthropic ofrece dos rutas para ejecutar agentes en produccion (desde abril 2026):

| Criterio | Agent SDK (self-hosted) | Managed Agents (hosted) |
|---|---|---|
| Control del loop | Total: el runtime vive en tu proceso | Ninguno: Anthropic ejecuta el loop |
| Infraestructura | Requieres desplegar y mantener el runtime | Cero infraestructura propia |
| Costo | Solo tokens del modelo | Tokens + $0.08/session-hora |
| Sesiones long-running | Manual: debes persistir estado | Nativo: estado gestionado por Anthropic |
| Herramientas built-in | Debes registrarlas manualmente | Disponibles via API sin setup |
| Casos de uso | Control total, loops deterministas, pipeline critico | Prototipado rapido, tareas delegadas, agentes autonomos sin infra |

Cuándo elegir Agent SDK: el loop de razonamiento tiene logica condicional propia, necesitas observabilidad completa con spans OTel propios, o el agente forma parte de un pipeline critico que no puede depender de la disponibilidad de un servicio externo.

Cuándo elegir Managed Agents: el objetivo es desplegar sin operar infraestructura, el costo de $0.08/session-hora es aceptable, y las sesiones son long-running (minutos a horas) con herramientas built-in (web search, code execution, computer use).

Header obligatorio en Managed Agents: `managed-agents-2026-04-01` (beta). El SDK lo inyecta automaticamente.

Patron de cost optimization en multi-agente: usar `claude-haiku-4-5` para sub-tareas de clasificacion, extraccion y validacion; reservar Opus/Sonnet para razonamiento complejo. Ahorro empirico: 60-70% en costo por token.

## Restricciones del Perfil

- Prohibido construir agentes con herramientas destructivas sin hook de confirmacion humana en el loop.
- Prohibido disenar multi-agente sin aislamiento de permisos entre orquestador y subagentes.
- Prohibido omitir la condicion de parada en agentes que ejecuten herramientas de escritura o eliminacion.
- Prohibido persistir secretos o PII en historial de sesion sin cifrado y politica de retencion documentada.
