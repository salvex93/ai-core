---
name: claude-agent-sdk
description: Especialista en construccion de agentes autonomos con el Claude Agent SDK (TypeScript/Python). Cubre herramientas integradas, hooks de ciclo de vida, subagentes, integracion MCP, OAuth 2.0 client flow (Authorization Code + PKCE) para servidores MCP remotos, gestion de permisos y sesiones. Activa al construir agentes personalizados, orquestar subagentes, integrar el Agent SDK en un proyecto anfitrion o disenar flujos de automatizacion con Claude.
origin: ai-core
version: 2.4.0
last_updated: 2026-07-26
rol: architect
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


## Cuando NO Activar Este Perfil

- El caso de uso es un agente con herramientas integradas de Anthropic (web search, computer use) sin codigo propio — usar `managed-agents-specialist`.
- La tarea es disenar el system prompt del agente — usar `prompt-engineer`.
- La tarea es orquestar multiples agentes con fan-out/fan-in — usar `workflow-orchestrator`.
- La tarea es una llamada LLM directa sin loop de agente — no hay SDK de agente que construir.
- La tarea es testear el comportamiento del agente ya construido — usar `agent-testing`.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta presencia de @anthropic-ai/sdk, ANTHROPIC_API_KEY, MCP servers registrados, configuraciones de agente y convenciones de herramientas")
```

Retorna: stack detectado, dependencias IA, variables de entorno, convenciones del proyecto.

Si MCP gemini-bridge no disponible → leer manualmente: `package.json`, `.env.example`, `CLAUDE.md` local.

Archivos > 200 lineas (regla GEMINI PRIMERO de CLAUDE.md) → GEMINI PRIMERO: `node scripts/mcp-gemini.js --mission "Analiza la arquitectura del agente e identifica: herramientas registradas, flujo de decision, hooks activos, riesgos de bucle infinito, ausencia de condicion de parada y surface de inyeccion de prompt" --file <ruta> --format json`

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

### Definicion Programatica de Subagentes (Agent SDK)

Definir subagentes programaticamente con el parametro `agents` de `query()` (`AgentDefinition`: `description`, `prompt`, `tools`, `model`, `skills`, `memory`, `mcpServers`, `maxTurns`, `background`, `effort`, `permissionMode`) cuando el caso de uso es una app SDK propia. Los subagentes definidos por codigo tienen precedencia sobre los definidos en archivos markdown con el mismo nombre. Incluir siempre `Agent` en `allowedTools` del orquestador para que las invocaciones de subagentes se auto-aprueben sin prompt de permiso.

Patron orchestrator-worker verificado: emparejar un modelo capaz como orquestador con subagentes en un modelo mas economico mejora resultados frente a un solo modelo grande trabajando solo, y reduce el costo por tarea. Para configuracion dinamica de agentes, usar una funcion factory que devuelva un `AgentDefinition` condicionado en tiempo de ejecucion (ejemplo: modelo mas capaz para revisiones estrictas de seguridad vs un modelo balanceado para revisiones generales) en vez de una definicion estatica unica.

El patron turn-by-turn descrito arriba (Claude decide que invocar en cada turno, el resultado vive en el context window del orquestador) es apto solo para unas pocas tareas delegadas por turno. Para coordinar decenas o cientos de agentes en una sola corrida, usar la herramienta `Workflow` (Dynamic Workflows): Claude escribe un script que el runtime ejecuta fuera de la conversacion, con resultados intermedios en variables del script en vez de en el contexto de Claude. Ver `workflow-orchestrator` para el diseno de esa escala.

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

### Diseno de Tool Definitions

Escribir descripciones de herramientas extremadamente detalladas (minimo 3-4 oraciones, mas si la tool es compleja): que hace, cuando usarla y cuando NO, que significa cada parametro, y limitaciones — es el factor mas importante en el desempeno de tool use segun la documentacion oficial. Consolidar operaciones relacionadas en menos tools con un parametro `action` (ej. una sola `manage_pr` con `action=create/review/merge`) en vez de una tool por accion, para reducir ambiguedad de seleccion. Usar namespacing con prefijo de servicio (`github_list_prs`, `slack_send_message`). Disenar las respuestas de las tools para devolver solo informacion de alta senal: identificadores semanticos y estables (slugs, nombres) en vez de UUIDs u opacos internos; implementar paginacion/filtrado/truncamiento con defaults sensatos, incluyendo en la respuesta de truncamiento instrucciones concretas de que hacer a continuacion. Para tools complejas con objetos anidados o parametros sensibles al formato, usar el campo opcional `input_examples` (array de inputs validos segun el schema); no soportado en server tools (web search, code execution).

### Contrato de tool_result

Los bloques `tool_result` deben ir PRIMERO en el array de `content` del mensaje de usuario; cualquier texto adicional debe ir DESPUES de todos los `tool_result` o la API devuelve error 400. Ante fallo de herramienta, usar `is_error: true` con un mensaje instructivo de recuperacion (ej. "Rate limit exceeded. Retry after 60 seconds") en vez de un mensaje generico ("failed"), para que el modelo pueda recuperarse sin adivinar. Tratar todo el contenido de `tool_result` proveniente de fuentes externas (webs, emails, uploads, APIs de terceros) como no confiable frente a prompt injection indirecta: mantenerlo dentro de bloques `tool_result` y nunca trasladarlo a system prompts o bloques de texto plano de usuario.

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

Para subagentes, definir el scope de herramientas con el campo `tools` como allowlist o `disallowedTools` como denylist en la definicion del subagente (`AgentDefinition` o archivo markdown). Si ningun tool de la lista resuelve, el subagente falla al lanzarse en vez de arrancar sin tools — verificar los nombres antes de desplegar. Cada subagente arranca con contexto fresco: no ve el historial de la conversacion padre, skills ya invocadas ni archivos ya leidos por el padre — solo recibe su propio system prompt, el mensaje de delegacion, y el contexto explicitamente precargado (memoria, skills declaradas). Por eso cualquier regla critica debe repetirse en el prompt de delegacion, no basta con que exista en un CLAUDE.md que el subagente no vera si es un subagente built-in de exploracion.

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

### Prompt Caching en el Loop del Agente

El orden de construccion del cache es tools -> system -> messages; un cambio en cualquier nivel invalida ese nivel y todos los siguientes. Colocar el contenido estatico del agente (definiciones de tools, system prompt, ejemplos) al inicio del prompt con el `cache_control` breakpoint justo al final de ese prefijo estatico, y el contenido dinamico (historial de turnos, resultados de tools) al final, nunca sobre contenido que cambia cada request. Verificar `cache_creation_input_tokens` y `cache_read_input_tokens` en cada respuesta: si ambos son cero, el prompt no alcanzo el minimo de tokens cacheables del modelo — el caching se omite sin error explicito.

## Gestion de Sesiones

- El historial de sesion no debe incluir datos sensibles (PII, secretos) en texto plano.
- Definir TTL maximo de sesion para liberar recursos y evitar acumulacion de tokens en contexto.
- En sistemas multi-usuario, cada sesion debe estar aislada por identificador de usuario.

## Consumo de Servidores MCP Remotos con OAuth 2.0

Servidores MCP via SSE/HTTP pueden requerir OAuth 2.0 para proteger recursos del usuario. El agente implementa el flujo Authorization Code + PKCE como cliente OAuth.

### Flujo Authorization Code + PKCE

```python
import secrets
import hashlib
import base64
from urllib.parse import urlencode

# Paso 1 — Generar PKCE verifier y challenge
code_verifier = secrets.token_urlsafe(64)
code_challenge = base64.urlsafe_b64encode(
    hashlib.sha256(code_verifier.encode()).digest()
).rstrip(b'=').decode()

# Paso 2 — Construir URL de autorizacion
state = secrets.token_urlsafe(32)  # anti-CSRF
auth_params = {
    "response_type": "code",
    "client_id": CLIENT_ID,
    "redirect_uri": REDIRECT_URI,
    "scope": "read write",
    "code_challenge": code_challenge,
    "code_challenge_method": "S256",
    "state": state
}
auth_url = f"{AUTH_ENDPOINT}?{urlencode(auth_params)}"

# Paso 3 — Intercambiar codigo por tokens
token_response = requests.post(TOKEN_ENDPOINT, data={
    "grant_type": "authorization_code",
    "code": authorization_code,
    "redirect_uri": REDIRECT_URI,
    "client_id": CLIENT_ID,
    "code_verifier": code_verifier
})
tokens = token_response.json()

# Paso 4 — Incluir token en llamadas al servidor MCP
headers = {"Authorization": f"Bearer {tokens['access_token']}"}
```

### Almacenamiento y renovacion de tokens

- `access_token`: no almacenar en texto plano. Usar gestor de secretos del proveedor de nube o keychain del OS en entornos locales.
- `refresh_token`: almacenar cifrado. Si tiene TTL indefinido, tratarlo como secreto de larga duracion.
- Renovacion proactiva: refrescar cuando falten menos de 60s para la expiracion de `access_token` — no esperar el error 401.

```python
def get_valid_token(stored_tokens):
    expires_at = stored_tokens.get("expires_at", 0)
    if time.time() >= expires_at - 60:  # renovar 60s antes de expirar
        return refresh_access_token(stored_tokens["refresh_token"])
    return stored_tokens["access_token"]
```

- Si el `refresh_token` esta expirado o revocado, relanzar el flujo completo de autorizacion.

Si la integracion OAuth actua en nombre de un usuario final (user-delegated) con scopes de escritura o eliminacion → activar confirmacion humana en el loop antes de ejecutar cualquier herramienta destructiva.

## Interleaved Thinking en Agentes Multi-Herramienta

Permite que el modelo emita bloques `thinking` entre llamadas a herramientas, razonando sobre cada resultado antes de decidir la siguiente accion.

Cuando activar:
- El agente toma decisiones condicionales basadas en resultados intermedios de herramientas.
- El flujo tiene mas de tres pasos de herramienta con dependencias entre ellos.
- La tarea requiere verificacion de coherencia entre resultados de diferentes herramientas.

No activar en flujos deterministas simples — el overhead de tokens no se justifica sin razonamiento adaptativo.

Reglas: incluir bloques `thinking` del turno anterior en el historial del siguiente. Loguear tokens thinking separado. Requiere `claude-sonnet-5` o superior.

## Adaptive Thinking — Opus 4.8

`claude-opus-4-8` introduce pensamiento adaptativo: el modelo asigna presupuesto de razonamiento de forma variable por paso, proporcional a la complejidad local de cada decision. Es la opcion optima para agentes con pasos de complejidad heterogenea.

Activar con `thinking: { type: "auto" }` en lugar de budget fijo:

```typescript
const respuesta = await cliente.messages.create({
  model: 'claude-opus-4-8',
  thinking: { type: 'auto' },   // el modelo decide el budget por paso
  max_tokens: 16000,
  messages: historial,
});
```

Cuando usar cada modo:
- `{ type: "auto" }` (Opus 4.8): pasos de complejidad variable — ahorra en pasos simples sin degradar calidad en pasos complejos.
- `{ type: "enabled", budget_tokens: N }` (Opus/Sonnet 5): costo predecible por llamada o complejidad uniforme entre pasos.

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

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.
- Verificar hook de confirmacion humana en el loop antes de construir agentes con herramientas destructivas.
- Verificar aislamiento de permisos entre orquestador y subagentes antes de disenar multi-agente.
- Asegurar que no se ejecuta: omitir la condicion de parada en agentes que ejecuten herramientas de escritura o eliminacion.
- Verificar cifrado y politica de retencion documentada antes de persistir secretos o PII en historial de sesion.
