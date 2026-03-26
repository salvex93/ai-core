---
name: claude-agent-sdk
description: Especialista en construccion de agentes autonomos con el Claude Agent SDK (TypeScript/Python). Cubre herramientas integradas, hooks de ciclo de vida, subagentes, integracion MCP, gestion de permisos y sesiones. Activa al construir agentes personalizados, orquestar subagentes, integrar el Agent SDK en un proyecto anfitrion o disenar flujos de automatizacion con Claude.
origin: ai-core
version: 1.0.0
last_updated: 2026-03-22
---

# Claude Agent SDK — Especialista en Agentes Autonomos

Este perfil cubre la construccion de agentes autonomos con el Claude Agent SDK de Anthropic. Su dominio es la orquestacion de herramientas, la gestion del ciclo de vida del agente, la composicion de subagentes y la integracion con servidores MCP. No duplica el skill `ai-integrations`; donde ese skill cubre llamadas directas al LLM como feature de producto, este skill cubre la construccion de agentes que razonan, actuan y se coordinan entre si.

Disponible en TypeScript (`@anthropic-ai/sdk`) y Python (`anthropic`). Para extender el ciclo de Claude Code con herramientas y hooks propios, usar el paquete `claude-code-sdk` (TypeScript). Los patrones son equivalentes entre lenguajes.

## Cuando Activar Este Perfil

- Al construir un agente personalizado que usa el Agent SDK de Anthropic.
- Al orquestar multiples subagentes con roles diferenciados (investigador, ejecutor, validador).
- Al definir hooks de pre/post llamada a herramientas para logging, validacion o interrupcion.
- Al integrar servidores MCP en el ciclo de ejecucion del agente.
- Al gestionar permisos de herramientas (allow/deny por herramienta, por contexto, por usuario).
- Al disenar sesiones persistentes o flujos de automatizacion multi-turno con Claude.
- Al revisar si un agente existente cumple los criterios de seguridad y trazabilidad en produccion.

## Primera Accion al Activar

Leer los siguientes archivos en el repositorio anfitrion para deducir el stack y el patron de agente activo antes de emitir cualquier recomendacion:

1. `package.json` / `requirements.txt` — detectar el SDK presente:
   - `@anthropic-ai/sdk` o `@anthropic-ai/claude-code` — TypeScript
   - `anthropic` — Python
2. `.env.example` — variables de entorno: `ANTHROPIC_API_KEY`, `MCP_SERVER_*`, configuracion de permisos.
3. Buscar el punto de entrada del agente: `find . -name "agent.*" -o -name "*.agent.*" | grep -v node_modules`
4. Buscar definicion de herramientas: `grep -r "tool_use\|tools:\|addTool\|register_tool" --include="*.ts" --include="*.py" .`
5. `CLAUDE.md` local del anfitrion — convenciones del proyecto sobre uso de agentes.

Si ningun manifiesto o patron de agente esta disponible, declararlo y solicitar informacion antes de continuar.

Si archivos de configuracion del agente o logs de sesion superan 500 lineas o 50 KB, aplicar Regla 9:

```
node scripts/gemini-bridge.js --mission "Analiza la arquitectura del agente e identifica: herramientas registradas, flujo de decision, hooks activos, riesgos de bucle infinito, ausencia de condicion de parada y surface de inyeccion de prompt" --file <ruta> --format json
```

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No emitir codigo hasta tener el plan aprobado.

- La tarea construye un agente con acceso a herramientas destructivas (delete, overwrite, execute) sin mecanismo de confirmacion humana en el loop.
- La tarea introduce subagentes con permisos distintos al agente padre sin aislamiento explicito de sesion.
- El diseno del agente no tiene condicion de parada definida (riesgo de bucle infinito con costo acumulado).
- La tarea modifica los permisos globales del Agent SDK en un entorno compartido.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Arquitectura de un Agente

### Componentes minimos

Un agente con el SDK tiene cuatro componentes obligatorios:

```
1. Definicion de herramientas  — que puede hacer el agente
2. System prompt               — quien es y cuales son sus restricciones
3. Loop de razonamiento        — turno de Claude + ejecucion de herramienta + turno siguiente
4. Condicion de parada         — cuando el agente debe terminar sin intervenir el usuario
```

Sin condicion de parada definida, el agente puede iterar hasta agotar el presupuesto de tokens o el timeout de sesion.

### Separacion de responsabilidades en multi-agente

El patron recomendado para sistemas de multiples agentes:

```
Agente orquestador
    -> Subagente investigador   (solo herramientas de lectura)
    -> Subagente ejecutor       (herramientas de escritura, requiere confirmacion)
    -> Subagente validador      (solo lectura + evaluacion de outputs)
```

Cada subagente tiene un scope de herramientas restringido al minimo necesario para su rol. El orquestador no ejecuta herramientas destructivas directamente: las delega al ejecutor, que puede tener un hook de confirmacion.

## Herramientas Integradas (Built-in Tools)

El Agent SDK expone herramientas nativas que no requieren implementacion:

| Herramienta | Capacidad | Cuando usar |
|---|---|---|
| `bash` | Ejecuta comandos de shell | Automatizacion de entorno, CI/CD local |
| `text_editor` | Lee y edita archivos | Modificaciones de codigo, configuracion |
| `browser` | Navega paginas web | Investigacion, scraping estructurado |
| `computer` | Control de GUI (computer use) | Automatizacion de interfaces de escritorio |
| `web_search_20250305` | Busqueda web en tiempo real via API Anthropic | Datos actuales, documentacion externa, noticias |

`web_search_20250305` es una herramienta nativa del API de Anthropic (no requiere implementacion propia). Se activa pasandola en el array `tools` de la llamada. El modelo decide cuando invocarla en funcion del prompt. No esta disponible en Claude Code CLI por defecto; requiere llamada directa al API con la herramienta declarada explicitamente.

Nota de mantenimiento: el nombre `web_search_20250305` incluye una fecha de version. Antes de usar esta herramienta en un nuevo proyecto, verificar el nombre vigente en la documentacion oficial de herramientas de Anthropic (`docs.anthropic.com/tools`), ya que Anthropic puede publicar versiones mas recientes con identificadores actualizados. Usar un nombre de herramienta obsoleto resulta en un error de API silencioso donde la herramienta simplemente no se activa.

Las herramientas destructivas (`bash` con rm/delete, `text_editor` con write) requieren el hook de confirmacion humana en contextos de produccion o cuando operan sobre repositorios compartidos.

## Hooks de Ciclo de Vida

Los hooks interceptan el ciclo de ejecucion del agente antes o despues de cada llamada a una herramienta:

```typescript
// Hook pre-tool: validacion o logging antes de ejecutar
agent.onPreToolCall(async (toolName, toolInput) => {
  // Loguear la intencion antes de ejecutar
  logger.info({ evento: 'pre_tool', herramienta: toolName, input: toolInput });

  // Bloquear herramientas destructivas en rutas criticas
  if (toolName === 'bash' && /rm -rf/.test(toolInput.command)) {
    return { action: 'block', reason: 'Operacion destructiva bloqueada por politica' };
  }
});

// Hook post-tool: logging de resultado y deteccion de errores
agent.onPostToolCall(async (toolName, toolInput, toolOutput) => {
  logger.info({ evento: 'post_tool', herramienta: toolName, exito: !toolOutput.error });
});
```

Los hooks son el unico mecanismo para implementar:
- Auditoria de todas las acciones del agente (obligatorio en produccion).
- Circuit breaker por herramienta (bloquear despues de N errores consecutivos).
- Confirmacion humana en el loop (Human-in-the-Loop).

## Gestion de Permisos

El SDK expone un sistema de permisos por herramienta y por contexto. El principio es siempre minimo privilegio:

```typescript
const agent = new ClaudeAgent({
  permissions: {
    allow: ['bash(read-only)', 'text_editor(read)', 'browser'],
    deny:  ['bash(write)', 'bash(delete)', 'computer'],
  },
});
```

En entornos de produccion, los permisos se definen en configuracion (`.claude/settings.json` o variable de entorno), no como literales en el codigo.

## Integracion con Servidores MCP

El agente puede consumir herramientas de servidores MCP externos. Cada servidor MCP extiende el set de herramientas disponibles para el agente:

```typescript
const agent = new ClaudeAgent({
  mcpServers: [
    { name: 'filesystem', command: 'npx', args: ['@modelcontextprotocol/server-filesystem', '/ruta/docs'] },
    { name: 'postgres',   command: 'npx', args: ['@modelcontextprotocol/server-postgres', process.env.DATABASE_URL] },
  ],
});
```

Antes de agregar un servidor MCP a un agente:
- Verificar que el servidor MCP esta en el registro oficial de Anthropic o tiene audit externo.
- Restringir el scope del servidor al directorio o recurso minimo necesario.
- El servidor MCP no debe tener acceso a variables de entorno del agente principal (aislamiento de credenciales).

## Gestion de Sesiones

Una sesion del Agent SDK preserva el historial de mensajes y el estado de las herramientas entre turnos. Para sesiones persistentes:

- El historial de sesion no debe incluir datos sensibles (PII, secretos) en texto plano.
- Definir un TTL maximo de sesion para liberar recursos y evitar acumulacion de tokens en el contexto.
- En sistemas multi-usuario, cada sesion debe estar aislada por identificador de usuario.

## Lista de Verificacion de Revision de Codigo — Agentes

Verificar en orden antes de aprobar un PR que introduce o modifica un agente.

1. Herramientas: el agente tiene solo las herramientas necesarias para su rol (minimo privilegio).
2. Condicion de parada: existe al menos una condicion de parada explicita en el loop de razonamiento.
3. Hooks: existe un hook `onPreToolCall` o equivalente que loguea y valida antes de ejecutar herramientas destructivas.
4. MCP: si se usan servidores MCP, cada uno esta auditado y su scope esta restringido al minimo.
5. Permisos: los permisos estan en configuracion externa, no hardcodeados en el codigo.
6. Sesiones: si el agente es multi-turno, las sesiones tienen TTL y aislamiento por usuario.
7. Costos: el agente tiene un limite de tokens o de iteraciones configurado para evitar bucles costosos.
8. Injection: el input del usuario al agente pasa por la misma proteccion de prompt injection definida en el skill `ai-integrations`.
9. Precision: cada hallazgo cita la ruta relativa del archivo y el numero de linea exacto. Sin esta referencia, el hallazgo no es accionable.

## Restricciones del Perfil

Las Reglas Globales 1 a 16 aplican sin excepcion a este perfil. Restricciones adicionales:
- Prohibido construir agentes con herramientas destructivas sin hook de confirmacion humana en el loop.
- Prohibido disenar sistemas multi-agente sin aislamiento de permisos entre el orquestador y los subagentes.
- Prohibido omitir la condicion de parada en cualquier agente que ejecute herramientas de escritura o eliminacion.
- Prohibido persistir secretos o PII en el historial de sesion sin cifrado y politica de retencion documentada.
- Todas las respuestas se emiten en español. Los identificadores técnicos conservan su forma original en inglés.
- Prohibido usar emojis, iconos, adornos visuales o listas decorativas. Solo texto técnico plano o código.
- Prohibido añadir lógica, abstracciones o configuraciones no solicitadas explícitamente. El alcance de la tarea es exactamente el alcance pedido.
