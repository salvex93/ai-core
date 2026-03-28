---
name: claude-agent-sdk
description: Especialista en construccion de agentes autonomos con el Claude Agent SDK (TypeScript/Python). Cubre herramientas integradas, hooks de ciclo de vida, subagentes, integracion MCP, OAuth 2.0 client flow (Authorization Code + PKCE) para servidores MCP remotos, gestion de permisos y sesiones. Activa al construir agentes personalizados, orquestar subagentes, integrar el Agent SDK en un proyecto anfitrion o disenar flujos de automatizacion con Claude.
origin: ai-core
version: 1.2.0
last_updated: 2026-03-28
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

## Computer Use — Patrones Seguros

La herramienta `computer` permite al agente controlar interfaces graficas de escritorio mediante capturas de pantalla y acciones de teclado/raton. Su superficie de riesgo es significativamente mayor que `bash` o `text_editor` porque opera sobre el entorno grafico completo del sistema.

### Principios de uso seguro

- Aislamiento obligatorio: el agente que usa `computer` debe correr en un entorno de escritorio aislado (contenedor con Xvfb, maquina virtual, sandbox). Nunca en el escritorio del usuario en produccion.
- Confirmacion humana por sesion: antes de iniciar cualquier sesion de computer use, el hook `onPreToolCall` debe pausar y requerir confirmacion explicita del usuario.
- Perimeter de accion declarado: el agente debe recibir en su system prompt una lista exacta de las aplicaciones y acciones permitidas. Cualquier accion fuera del perimeter activa el bloqueo del hook.
- Logging de capturas: cada captura de pantalla tomada durante la sesion se persiste en un log de auditoria con timestamp. Las capturas pueden contener datos sensibles; gestionar la retencion segun la politica del anfitrion.

### Hook de confirmacion para computer use

```typescript
agent.onPreToolCall(async (toolName, toolInput) => {
  if (toolName === 'computer') {
    // Loguear la accion que el agente intenta ejecutar
    logger.info({
      evento: 'computer_use_pre',
      accion: toolInput.action,
      coordenadas: toolInput.coordinate,
      texto: toolInput.text,
    });

    // En produccion, requerir confirmacion explicita antes de cada accion
    const accionesDeAltoRiesgo = ['left_click', 'right_click', 'type', 'key'];
    if (accionesDeAltoRiesgo.includes(toolInput.action)) {
      const confirmado = await solicitarConfirmacionHumana(
        `El agente intenta ejecutar: ${toolInput.action}. Confirmar? [s/n]`
      );
      if (!confirmado) {
        return { action: 'block', reason: 'Accion de computer use bloqueada por el operador.' };
      }
    }
  }
});
```

### Configuracion de entorno aislado (Docker + Xvfb)

```dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    fluxbox \
    && rm -rf /var/lib/apt/lists/*

ENV DISPLAY=:99
CMD ["Xvfb", ":99", "-screen", "0", "1280x800x24"]
```

El agente se conecta al display virtual via la variable `DISPLAY`. Ningun proceso del contenedor tiene acceso al display fisico del host.

## Observabilidad del Agente

Los agentes autonomos en produccion requieren el mismo nivel de observabilidad que cualquier servicio de backend: trazas distribuidas, metricas de operacion y logs estructurados. Sin esta instrumentacion, los fallos son opacos y el debugging es inviable.

### Trazas distribuidas con OpenTelemetry

Instrumentar el ciclo de vida del agente con spans de OpenTelemetry permite correlacionar cada decision del modelo con las herramientas que invoco y los resultados que obtuvo.

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// Configurar el provider de trazas
const provider = new NodeTracerProvider();
provider.addSpanProcessor(
  new SimpleSpanProcessor(new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }))
);
provider.register();

const tracer = trace.getTracer('agente-nombre', '1.0.0');

// Instrumentar manualmente el loop del agente si el SDK no lo hace automaticamente
agent.onPreToolCall(async (toolName, toolInput) => {
  const span = tracer.startSpan(`tool.${toolName}`, {
    attributes: {
      'agent.tool.name': toolName,
      'agent.tool.input': JSON.stringify(toolInput).slice(0, 500), // truncar para evitar spans masivos
    },
  });
  // Adjuntar el span al contexto para cerrarlo en onPostToolCall
  (toolInput as any).__span = span;
});

agent.onPostToolCall(async (toolName, toolInput, toolOutput) => {
  const span = (toolInput as any).__span;
  if (span) {
    if (toolOutput.error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: toolOutput.error });
    }
    span.setAttribute('agent.tool.success', !toolOutput.error);
    span.end();
  }
});
```

### Metricas de operacion

Exponer las siguientes metricas via Prometheus o el sistema de metricas del anfitrion:

```
# Contador de invocaciones por herramienta
agent_tool_calls_total{tool_name, status}

# Histograma de duracion de cada invocacion de herramienta
agent_tool_duration_seconds{tool_name}

# Contador de tokens consumidos por sesion
agent_tokens_consumed_total{model, token_type}   # token_type: input | output

# Contador de iteraciones del loop de razonamiento por sesion
agent_loop_iterations_total{agent_name}

# Gauge de sesiones activas
agent_sessions_active{agent_name}
```

### Logs estructurados del agente

Cada evento significativo del ciclo de vida del agente se emite como un log estructurado en JSON con los campos obligatorios de la Regla de Logs del nucleo:

```typescript
// Eventos obligatorios a loguear
const EVENTOS_AGENTE = {
  SESION_INICIADA:    'agent.session.started',
  SESION_TERMINADA:   'agent.session.ended',
  HERRAMIENTA_PRE:    'agent.tool.pre_call',
  HERRAMIENTA_POST:   'agent.tool.post_call',
  HERRAMIENTA_BLOQ:   'agent.tool.blocked',
  CONDICION_PARADA:   'agent.stop_condition.reached',
  ERROR_LOOP:         'agent.loop.error',
  LIMITE_ALCANZADO:   'agent.limit.reached',   // tokens o iteraciones
};

logger.info({
  timestamp: new Date().toISOString(),
  evento: EVENTOS_AGENTE.HERRAMIENTA_PRE,
  agente: 'nombre-del-agente',
  sesion_id: sesionId,
  herramienta: toolName,
  iteracion: iteracionActual,
  trace_id: span?.spanContext().traceId,
});
```

## Gestion de Sesiones

Una sesion del Agent SDK preserva el historial de mensajes y el estado de las herramientas entre turnos. Para sesiones persistentes:

- El historial de sesion no debe incluir datos sensibles (PII, secretos) en texto plano.
- Definir un TTL maximo de sesion para liberar recursos y evitar acumulacion de tokens en el contexto.
- En sistemas multi-usuario, cada sesion debe estar aislada por identificador de usuario.

## Consumo de Servidores MCP Remotos con OAuth 2.0

Los servidores MCP accesibles via SSE/HTTP pueden requerir autenticacion OAuth 2.0 para proteger el acceso a herramientas que actuan sobre recursos del usuario (repositorios, calendarios, CRMs). El cliente MCP — en este caso el agente construido con el Agent SDK — implementa el flujo Authorization Code + PKCE como cliente OAuth.

El flujo completo tiene cuatro pasos: obtencion de la URL de autorizacion, redireccion del usuario al proveedor de identidad, intercambio del codigo de autorizacion por tokens, y llamada autenticada al servidor MCP con el `access_token`.

### Implementacion del flujo Authorization Code + PKCE (TypeScript)

```typescript
import crypto from 'crypto';

// Paso 1 — Generar PKCE code_verifier y code_challenge
function generarPKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

// Paso 2 — Construir la URL de autorizacion
function construirUrlAutorizacion(params: {
  authorizationEndpoint: string;  // URL del endpoint de autorizacion del servidor MCP
  clientId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  state: string;                  // valor aleatorio para prevenir CSRF
}): string {
  const url = new URL(params.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', params.state);
  return url.toString();
}

// Paso 3 — Intercambiar el codigo de autorizacion por tokens
async function intercambiarCodigo(params: {
  tokenEndpoint: string;
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const respuesta = await fetch(params.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      code: params.code,
      code_verifier: params.codeVerifier,
    }),
  });

  if (!respuesta.ok) {
    const error = await respuesta.json();
    throw new Error(`Token exchange failed: ${error.error_description ?? error.error}`);
  }

  const tokens = await respuesta.json();
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  };
}

// Paso 4 — Conectar el agente al servidor MCP usando el access_token
import Anthropic from '@anthropic-ai/sdk';

const cliente = new Anthropic();

async function ejecutarAgenteConMCPAutenticado(accessToken: string): Promise<void> {
  const respuesta = await cliente.beta.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools: [
      {
        type: 'mcp',
        server_label: 'mi-servidor-mcp',
        server_url: 'https://mi-servidor-mcp.example.com/sse',
        headers: {
          Authorization: `Bearer ${accessToken}`,  // token incluido en cada llamada al servidor MCP
        },
      } as any,
    ],
    messages: [{ role: 'user', content: 'Ejecuta la tarea via el servidor MCP' }],
  });
}
```

### Almacenamiento y renovacion de tokens

Los tokens OAuth son credenciales sensibles. Reglas de manejo obligatorio:

- El `access_token` no se almacena en texto plano en base de datos. Usar el gestor de secretos del proveedor de nube (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault) o el keychain del sistema operativo en entornos locales.
- El `refresh_token` se almacena cifrado. Si el proveedor lo emite con TTL indefinido, tratarlo como secreto de larga duracion.
- Implementar renovacion proactiva: refrescar el `access_token` cuando falten menos de 60 segundos para su expiracion (`expires_in` del token), no despues de recibir un error 401.

```typescript
async function refrescarToken(params: {
  tokenEndpoint: string;
  clientId: string;
  refreshToken: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const respuesta = await fetch(params.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: params.clientId,
      refresh_token: params.refreshToken,
    }),
  });

  if (!respuesta.ok) {
    // refresh_token expirado o revocado: relanzar el flujo completo de autorizacion
    throw new Error('REFRESH_TOKEN_INVALID: requiere re-autorizacion del usuario');
  }

  const tokens = await respuesta.json();
  return { accessToken: tokens.access_token, expiresIn: tokens.expires_in };
}
```

### Condicion de activacion de la Directiva de Interrupcion para OAuth

Si la integracion OAuth del servidor MCP actua en nombre de un usuario final (user-delegated access) y tiene scopes que permiten escritura o eliminacion sobre datos del usuario, agregar la condicion de confirmacion humana en el loop del agente antes de ejecutar cualquier herramienta destructiva. Un agente que obtiene tokens de usuario y los usa para actuar sin confirmacion es un riesgo de seguridad de nivel critico.

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
