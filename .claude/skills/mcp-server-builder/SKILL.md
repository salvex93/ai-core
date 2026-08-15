---
name: mcp-server-builder
description: Especialista en construccion de servidores MCP (Model Context Protocol). Cubre ciclo de vida del protocolo, transportes stdio y SSE/HTTP, definicion de herramientas con JSON Schema, seguridad de inputs, testing con MCP Inspector y despliegue. Activa al construir un servidor MCP propio, exponer herramientas internas a Claude, o publicar un servidor MCP en el registro oficial.
origin: ai-core
version: 1.5.1
last_updated: 2026-08-15
rol: coder
compatibility: Requiere @modelcontextprotocol/sdk (TypeScript) o mcp (Python) compatible con especificacion MCP 2026-07-28; depende de conectividad de red para transporte Streamable HTTP.
---

# MCP Server Builder — Especialista en Servidores Model Context Protocol

Este perfil cubre la construccion del lado servidor del protocolo MCP: crear servidores que exponen herramientas, recursos y prompts a Claude (o cualquier cliente MCP compatible). No duplica el skill `claude-agent-sdk`, que cubre el consumo de servidores MCP como cliente. Este skill cubre la construccion del servidor en si.

MCP es el mecanismo estandar para extender las capacidades de Claude Code y de cualquier agente Anthropic con herramientas propias: APIs internas, bases de datos privadas, servicios de la empresa, pipelines de datos. Un servidor MCP bien construido puede conectarse a cualquier cliente MCP sin modificacion.

Disponible en TypeScript (`@modelcontextprotocol/sdk`) y Python (`mcp`).

## Cuando Activar Este Perfil

- Al construir un servidor MCP que expone herramientas de un sistema interno (base de datos, API REST, servicio de archivos).
- Al definir el schema de las herramientas que Claude puede invocar via MCP.
- Al elegir entre transporte `stdio` (proceso local) y `Streamable HTTP` (servidor remoto).
- Al implementar validacion de inputs de herramientas antes de ejecutar logica de negocio.
- Al publicar un servidor MCP en el registro de Anthropic o como paquete npm/PyPI.
- Al diagnosticar errores de comunicacion entre un cliente MCP y el servidor.
- Al revisar la seguridad de un servidor MCP existente.


## Cuando NO Activar Este Perfil

- La tarea es usar herramientas MCP ya existentes, no construir el servidor — usar el skill del dominio correspondiente.
- La tarea es construir un agente que consume herramientas MCP — usar `claude-agent-sdk`.
- Las herramientas necesarias ya estan disponibles via bridge MCP del ai-core — no es necesario un servidor nuevo.
- La tarea es una API REST para consumo HTTP generico, no especificamente para LLMs via MCP — usar `backend-architect`.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta SDK MCP presente (@modelcontextprotocol/sdk o mcp Python), herramientas registradas, transportes configurados (stdio/SSE) y credenciales de servicios")
```

Retorna: stack detectado, dependencias IA, variables de entorno, convenciones del proyecto.

Si MCP gemini-bridge no disponible → leer manualmente: `package.json`, `.env.example`, `CLAUDE.md` local.

Complementar con grep para herramientas existentes: `grep -r "server.tool\|@mcp.tool\|ListToolsRequest" --include="*.ts" --include="*.py" .`

Si el archivo de configuracion del servidor o el modulo de herramientas supera 200 lineas (o 50 lineas si es log/error), aplicar la regla GEMINI PRIMERO de CLAUDE.md (delegacion obligatoria al bridge):

```
node scripts/mcp-gemini.js --mission "Analiza el servidor MCP e identifica: herramientas sin validacion de schema, ausencia de manejo de errores JSON-RPC, secretos en schemas de herramientas, ausencia de autenticacion en transportes HTTP y herramientas con permisos excesivos" --file <ruta> --format json
```

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No emitir codigo hasta tener el plan aprobado.

- El servidor MCP expone herramientas que operan sobre datos de produccion sin mecanismo de autenticacion en el transporte.
- El servidor MCP expone herramientas destructivas (delete, drop, execute) sin validacion de schema estricta.
- El diseno requiere que el servidor MCP tenga acceso a secretos del sistema (credenciales de base de datos, API keys) sin gestion segura de variables de entorno.
- El servidor MCP se publica en el registro oficial de Anthropic sin auditoria de seguridad previa.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Especificacion Vigente: Release Candidate 2026-07-28

La especificacion 2026-07-28 (RC publicado 2026-05-21, final el 2026-07-28) reemplaza a 2025-03-26 como base de este skill. Cambio de fondo: el protocolo pasa de sesion con estado a stateless por request. Ver detalle en `blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/`.

Ventana de migracion: 10 semanas desde el RC. Servidores nuevos deben construirse directamente contra 2026-07-28; servidores existentes en 2025-03-26 siguen funcionando (garantia minima de 12 meses antes de remocion), pero migrar antes del final de la ventana evita trabajo de doble mantenimiento.

### Ciclo de vida de la conexion (stateless)

El handshake `initialize`/`initialized` desaparece como intercambio unico de conexion. La version de protocolo, info del cliente y capabilities viajan en `_meta` en cada request (`io.modelcontextprotocol/protocolVersion`, `io.modelcontextprotocol/clientCapabilities`). Todo servidor conforme a 2026-07-28 implementa ademas el RPC `server/discover` para anunciar version y capacidades soportadas:

```
1. Descubrimiento de capacidades del servidor
   Cliente -> server/discover (sin params propios, solo _meta estandar)
   Servidor -> { resultType: "complete", supportedVersions: ["2026-07-28"], capabilities: {...},
                 _meta: { "io.modelcontextprotocol/serverInfo": { name, version } },
                 instructions, ttlMs, cacheScope }

2. Listado de herramientas
   Cliente -> tools/list (incluye _meta con protocol version y capabilities)
   Servidor -> lista de herramientas con schemas JSON Schema, en orden deterministico

3. Ejecucion
   Cliente -> tools/call (nombre de herramienta + argumentos tipados + _meta)
   Servidor -> resultado con campo resultType obligatorio ("complete" o "input_required")

4. Cierre
   Sin estado de sesion que cerrar — cada request es autonomo (EOF en stdio, fin de request HTTP en Streamable HTTP)
```

Implicacion practica: sin sticky sessions ni almacen de sesion compartido. Cualquier instancia detras de un load balancer round-robin puede atender cualquier request.

Todo resultado retornado por el servidor (incluido cada `tools/call`) debe incluir el campo `resultType` (`"complete"` o `"input_required"`) como campo hermano dentro de `result`, no anidado. Un servidor que omite este campo no es conforme a 2026-07-28, aunque siga funcionando contra clientes tolerantes que lo tratan como `"complete"` por defecto. `tools/list` debe devolver las herramientas en orden deterministico (mejora cache hit rate en el cliente).

Todos los mensajes siguen JSON-RPC 2.0. Los IDs de request son enteros o strings. Recurso no encontrado ahora usa el codigo estandar `-32602` (Invalid Params) en lugar del custom `-32002` de la especificacion anterior, dentro de una nueva politica de rangos de error (`-32000` a `-32019` legacy de SDK, `-32020` a `-32099` reservado a la especificacion).

Solicitudes iniciadas por el servidor hacia el cliente (`roots/list`, `sampling/createMessage`, `elicitation/create`) quedan reemplazadas por el patron Multi Round-Trip Requests (MRTR): el servidor retorna un resultado con `resultType: "input_required"` e `InputRequiredResult` (campos `inputRequests`/`requestState`) en vez de iniciar una request propia hacia el cliente.

### Suscripciones a cambios (`subscriptions/listen`)

Reemplaza `resources/subscribe`/`resources/unsubscribe` y el endpoint HTTP GET. Un unico RPC con filtro de que notificar:

```json
{"jsonrpc":"2.0","id":1,"method":"subscriptions/listen","params":{"notifications":{"toolsListChanged":true,"resourceSubscriptions":["file:///project/config.json"]}}}
```

El servidor responde primero con `notifications/subscriptions/acknowledged` (lleva `io.modelcontextprotocol/subscriptionId` en `_meta`), y cada notificacion posterior en el stream (ej. `notifications/resources/updated`) porta ese mismo `subscriptionId` para que el cliente demultiplexe. Cierre gracioso: resultado vacio con `resultType: "complete"`.

### Transportes disponibles

| Transporte | Descripcion | Cuando usar |
|---|---|---|
| `stdio` | El servidor corre como proceso hijo. El cliente se comunica via stdin/stdout. | Servidores locales, herramientas de desarrollo, integracion con Claude Code CLI. |
| `Streamable HTTP` | El servidor expone un endpoint HTTP con soporte opcional de streaming via SSE. Stateless desde la especificacion MCP 2026-07-28. | Servidores remotos, servicios compartidos, SaaS, servidores multi-usuario. |

El transporte `stdio` es mas simple de implementar y mas seguro por defecto (sin superficie de red). El transporte `Streamable HTTP` es stateless desde 2026-07-28 — sin sesion adherida, corre detras de un load balancer round-robin plano. Requiere autenticacion explicita si el servidor es accesible desde redes externas. El transporte SSE puro (`SSEServerTransport`) sigue obsoleto desde 2025-03-26; no construir nuevos servidores con el.

## Definicion de Herramientas

### Schema minimo de una herramienta

```typescript
// TypeScript — @modelcontextprotocol/sdk
server.tool(
  'buscar_producto',               // nombre: snake_case
  'Busca productos por nombre o SKU en el catalogo.',  // descripcion precisa
  {
    // inputSchema: JSON Schema de los argumentos
    query: {
      type: 'string',
      description: 'Termino de busqueda: nombre parcial o SKU exacto.',
      minLength: 2,
      maxLength: 200,
    },
    limite: {
      type: 'number',
      description: 'Numero maximo de resultados. Por defecto 10.',
      minimum: 1,
      maximum: 50,
      default: 10,
    },
  },
  async ({ query, limite = 10 }) => {
    // Implementacion: validacion ya garantizada por el schema
    const resultados = await catalogoService.buscar(query, limite);
    return {
      content: [{ type: 'text', text: JSON.stringify(resultados) }],
    };
  }
);
```

```python
# Python — mcp
@mcp.tool()
def buscar_producto(query: str, limite: int = 10) -> str:
    """Busca productos por nombre o SKU en el catalogo.

    Args:
        query: Termino de busqueda: nombre parcial o SKU exacto. Min 2 chars.
        limite: Numero maximo de resultados (1-50). Por defecto 10.
    """
    resultados = catalogo_service.buscar(query, min(max(limite, 1), 50))
    return json.dumps(resultados)
```

### Reglas de nomenclatura de herramientas

- Nombre en `snake_case`. Debe ser un verbo o frase verbal que describa la accion.
- La descripcion explica el objetivo de negocio, no la implementacion tecnica. Claude la usa para decidir si invocar la herramienta.
- Cada argumento tiene su propio `description` con el formato esperado y los limites validos. Claude construye el llamado basandose en estas descripciones.
- No incluir secretos, URLs internas ni detalles de infraestructura en la descripcion ni en el schema. Son visibles para el modelo.

### Anotaciones de herramientas (Tool Annotations)

La especificacion MCP (vigente desde 2025-03-26, sin cambios en 2026-07-28) define metadatos opcionales de comportamiento por herramienta. El cliente MCP puede usarlos para solicitar confirmacion del usuario antes de ejecutar operaciones sensibles.

| Anotacion | Tipo | Significado |
|---|---|---|
| `readOnlyHint` | boolean | La herramienta no modifica estado ni datos |
| `destructiveHint` | boolean | Puede tener efectos irreversibles |
| `idempotentHint` | boolean | Llamadas repetidas con mismos argumentos producen el mismo resultado |
| `openWorldHint` | boolean | Accede a servicios o redes externas |

```typescript
server.tool(
  'eliminar_registro',
  'Elimina un registro de la base de datos por ID.',
  { id: { type: 'string', description: 'ID del registro a eliminar.' } },
  { destructiveHint: true, idempotentHint: false },
  async ({ id }) => { /* implementacion */ }
);
```

Regla: declarar `destructiveHint: true` en toda herramienta con efectos irreversibles. El cliente usa esta anotacion para mostrar confirmacion al usuario antes de ejecutar.

### Tipos de contenido en la respuesta

| Tipo | Uso |
|---|---|
| `text` | Texto plano o JSON serializado. El tipo mas comun. |
| `image` | Imagen en base64 con mimeType. Para herramientas que generan graficos o capturas. |
| `resource` | Referencia a un recurso MCP. Para exponer documentos del servidor. |

Una herramienta puede retornar multiples items de contenido en el array `content`.

### Catalogos grandes de herramientas — descubrimiento diferido

Un servidor con muchas herramientas no debe forzar al cliente a cargar todas las definiciones upfront en el system prompt. Anthropic documenta el patron de Tool Search Tool con `defer_loading: true` (anthropic.com/engineering/advanced-tool-use, verificado 2026-08-14) como mecanismo de descubrimiento bajo demanda del lado cliente, con reduccion medida de hasta 85% en tokens de descubrimiento de herramientas. Esta seccion vive del lado cliente (no requiere cambios en el codigo del servidor MCP), pero al definir el catalogo de herramientas de un servidor nuevo: mantener `tools/list` en orden deterministico (ya exigido por 2026-07-28) facilita que el cliente cachee resultados de busqueda sobre el catalogo.

## Servidor stdio Minimo (TypeScript)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'nombre-del-servidor',
  version: '1.0.0',
});

// Registrar herramientas aqui
server.tool('mi_herramienta', 'Descripcion.', { /* schema */ }, async (args) => {
  return { content: [{ type: 'text', text: 'resultado' }] };
});

// Conectar el transporte y arrancar
const transporte = new StdioServerTransport();
await server.connect(transporte);
```

Configurar en Claude Code (`.claude/settings.json` del proyecto anfitrion):

```json
{
  "mcpServers": {
    "nombre-del-servidor": {
      "command": "node",
      "args": ["ruta/al/servidor/index.js"]
    }
  }
}
```

## Servidor Streamable HTTP Minimo (TypeScript)

Transporte introducido en la especificacion MCP 2025-03-26, ahora stateless desde 2026-07-28 (ver "Ciclo de vida de la conexion" arriba). Reemplaza al SSE legacy. El cliente envía peticiones HTTP POST al endpoint `/mcp` y el servidor puede responder con JSON simple o con un stream SSE segun la cabecera `Accept` del cliente. Cada request debe incluir su version de protocolo y capabilities en `_meta`, sin handshake previo.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

const app = express();
app.use(express.json());

const server = new McpServer({ name: 'nombre-del-servidor', version: '1.0.0' });

// Registrar herramientas
server.tool(/* ... */);

// Endpoint unico para el protocolo MCP
app.post('/mcp', async (req, res) => {
  // Autenticacion obligatoria antes de procesar el request
  if (!req.headers.authorization || !validarToken(req.headers.authorization)) {
    return res.status(401).json({ error: 'Sin autorizacion' });
  }
  const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transporte);
  await transporte.handleRequest(req, res, req.body);
});

app.listen(3000);
```

Configurar en Claude Code (`.claude/settings.json` del proyecto anfitrion):

```json
{
  "mcpServers": {
    "nombre-del-servidor": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Seguridad en Servidores MCP

### Validacion de inputs

El schema JSON Schema de la herramienta valida la estructura, pero no la logica de negocio. Siempre agregar validacion adicional en la implementacion:

- Verificar que el usuario tiene permiso sobre el recurso que solicita (si el servidor es multi-usuario).
- Sanitizar strings antes de usarlos en queries de base de datos o comandos del sistema.
- Aplicar los mismos controles OWASP A03 (inyeccion) que en cualquier endpoint de API.

### Gestion de secretos

```typescript
// Correcto: leer credenciales de variables de entorno
const BD_URL = process.env.DATABASE_URL;
if (!BD_URL) throw new Error('DATABASE_URL no configurada');

// Incorrecto: nunca en el schema de la herramienta ni en la descripcion
server.tool('herramienta', 'Accede a postgres://admin:password@... ', { });
```

### Autenticacion en transporte Streamable HTTP

Todo servidor MCP expuesto en red (no solo localhost) requiere autenticacion:

- Token Bearer en el header `Authorization`.
- El token se valida antes de procesar el request MCP, no despues.
- En produccion, rotar los tokens con la misma frecuencia que cualquier API key.
- El transporte SSE legacy (`SSEServerTransport`) esta obsoleto desde la especificacion 2025-03-26 y formalmente en estado Deprecated bajo la politica de ciclo de vida de 2026-07-28 (ventana minima de 12 meses antes de Removed). Los servidores nuevos usan `StreamableHTTPServerTransport` exclusivamente — no depender de resumability via `Last-Event-ID`, eliminada en 2026-07-28: un stream roto obliga a reemitir el request completo.

## Framework de Extensiones (2026-07-28)

Capacidades nuevas se distribuyen como extensiones con ID reverse-DNS, negociadas via un mapa `extensions` en las capabilities de cliente y servidor. Viven en repositorios `ext-*` con mantenedores propios y versionan de forma independiente a la especificacion base.

Extensiones oficiales:

| Extension | Funcion |
|---|---|
| `MCP Apps` | El servidor entrega interfaces HTML interactivas que el host renderiza en un iframe sandboxed. Capacidad nueva, no reemplaza ninguna primitiva existente. |
| `Tasks` | Trabajo de larga duracion con ciclo de vida stateless. Reemplaza la Tasks API experimental de 2025-11-25 — quien implemento contra esa version experimental debe migrar al nuevo ciclo de vida. |

Tools, Resources y Prompts siguen siendo las primitivas core del protocolo; no estan afectadas por el framework de extensiones.

## Politica de Deprecacion Formal (2026-07-28)

Ciclo de vida de cualquier metodo, tipo o capability flag:

| Fase | Comportamiento | Duracion minima |
|---|---|---|
| Active | Funcional, recomendado | Indefinida |
| Deprecated | Funciona completamente, desaconsejado para uso nuevo | 12 meses antes de poder pasar a Removed |
| Removed | Ya no disponible | — |

Garantia de la especificacion: todo lo publicado en una version sigue funcionando en esa version y en cualquier version posterior publicada dentro del año siguiente.

Deprecados en 2026-07-28 (no usar en servidores nuevos):
- `Roots` — usar parametros de Tool, URIs de Resource o configuracion propia del servidor.
- `Sampling` — usar integracion directa con la API del proveedor LLM.
- `Logging` (primitiva del protocolo) — usar stderr en stdio; OpenTelemetry para observabilidad estructurada en Streamable HTTP.

## Primitivas Adicionales del Protocolo

El protocolo MCP define tres tipos de primitivas que un servidor puede exponer: Tools, Resources y Prompts. La seccion anterior cubre Tools. A continuacion se describen Resources y Prompts.

### Resources

Un Resource es un dato o documento que el servidor expone para que el cliente lo lea. No ejecuta logica: es un endpoint de lectura de contenido estructurado.

Casos de uso tipicos: exponer archivos de configuracion, esquemas de base de datos, documentacion interna o cualquier dato de referencia que el modelo necesita leer antes de razonar.

```typescript
// TypeScript — registro de un recurso estatico
server.resource(
  'esquema-base-de-datos',                          // nombre del recurso
  'db://schema',                                    // URI del recurso (scheme propio)
  async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify(await obtenerEsquemaDB()),
    }],
  })
);

// Recurso con plantilla URI parametrizada (ResourceTemplate)
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/index.js';

server.resource(
  new ResourceTemplate('archivo://{ruta}', { list: undefined }),
  async (uri, { ruta }) => ({
    contents: [{
      uri: uri.href,
      mimeType: 'text/plain',
      text: await fs.readFile(ruta, 'utf-8'),
    }],
  })
);
```

Reglas de seguridad para Resources:
- Los recursos que exponen rutas del sistema de archivos deben validar que la ruta esta dentro del directorio permitido. Prohibido path traversal (`../`).
- Los recursos que exponen datos de base de datos deben respetar los mismos controles de autorizacion que las herramientas.
- No exponer secretos ni credenciales como recursos legibles.

### Prompts

Un Prompt es una plantilla de mensaje reutilizable que el servidor expone para que el cliente la instancie con argumentos. Permite estandarizar la forma en que el modelo aborda tareas recurrentes.

```typescript
// TypeScript — registro de un prompt
server.prompt(
  'analizar-error',                                 // nombre del prompt
  'Genera un analisis tecnico estructurado de un error de aplicacion.',
  {
    mensaje_error: {
      type: 'string',
      description: 'El mensaje de error completo incluyendo el stack trace.',
    },
    contexto: {
      type: 'string',
      description: 'Contexto adicional: que operacion se estaba ejecutando.',
      required: false,
    },
  },
  async ({ mensaje_error, contexto }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Analiza el siguiente error de aplicacion:\n\n${mensaje_error}${contexto ? `\n\nContexto: ${contexto}` : ''}`,
      },
    }],
  })
);
```

La diferencia entre un Prompt y una Tool: una Tool ejecuta una accion y devuelve un resultado. Un Prompt devuelve un mensaje estructurado listo para ser enviado al modelo. Los Prompts no ejecutan logica de negocio; solo estructuran la entrada al LLM.

## Testing con MCP Inspector

El Inspector de MCP es la herramienta oficial para probar servidores sin necesitar un cliente completo:

```bash
npx @modelcontextprotocol/inspector node ruta/al/servidor.js
```

El inspector lanza una interfaz web en `localhost:5173` donde puedes:
- Ver la lista de herramientas registradas y sus schemas.
- Invocar herramientas con argumentos propios y ver la respuesta.
- Inspeccionar los mensajes JSON-RPC intercambiados.

Nunca publicar un servidor MCP sin haber verificado cada herramienta con el inspector primero.

## Autenticacion OAuth 2.0 en Servidores Remotos

La especificacion MCP define OAuth 2.1 como el mecanismo de autenticacion estandar para servidores MCP accesibles via Streamable HTTP desde redes externas — el servidor MCP actua formalmente como Resource Server OAuth 2.1 (terminologia confirmada en 2026-07-28). El flujo recomendado es Authorization Code con PKCE.

Cambios de 2026-07-28 relevantes para el ecosistema, verificados contra modelcontextprotocol.io/specification/2026-07-28: Dynamic Client Registration (RFC7591) queda deprecado en favor de Client ID Metadata Documents (CIMD), y se exige validar el claim `iss` de la respuesta de autorizacion (RFC 9207) antes de canjear el codigo de autorizacion por un token. **Ambos cambios son responsabilidad del cliente MCP y del authorization server, no del servidor MCP que este skill construye** — el Resource Server (el codigo de abajo) nunca procesa el `client_id` ni el `iss` de la respuesta de autorizacion; su unica responsabilidad sigue siendo validar `issuer`/`audience` del access token ya emitido, que es exactamente lo que hace `verificarToken` mas abajo. No agregar logica de CIMD o de validacion de `iss` al servidor: pertenece al lado del cliente.

### Flujo de autorizacion

```
1. El cliente MCP descubre el servidor de autorizacion via el endpoint /.well-known/oauth-authorization-server
2. El cliente inicia el flujo Authorization Code con PKCE
3. El usuario se autentica en el authorization server
4. El servidor MCP valida el access token en cada request al endpoint /mcp
5. El cliente renueva el token via refresh token cuando expira
```

### Implementacion en el servidor MCP

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const app = express();
app.use(express.json());

const server = new McpServer({ name: 'nombre-del-servidor', version: '1.0.0' });

// JWKS del authorization server para verificar tokens
const JWKS = createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URI));

async function verificarToken(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  try {
    await jwtVerify(token, JWKS, {
      issuer: process.env.AUTH_ISSUER,
      audience: process.env.AUTH_AUDIENCE,
    });
    return true;
  } catch {
    return false;
  }
}

// Endpoint de descubrimiento OAuth (obligatorio para clientes que implementan el flujo completo)
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: process.env.AUTH_ISSUER,
    authorization_endpoint: process.env.AUTH_AUTHORIZATION_ENDPOINT,
    token_endpoint: process.env.AUTH_TOKEN_ENDPOINT,
    jwks_uri: process.env.AUTH_JWKS_URI,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
  });
});

app.post('/mcp', async (req, res) => {
  // La verificacion del token ocurre antes de cualquier procesamiento MCP
  const autorizado = await verificarToken(req.headers.authorization);
  if (!autorizado) {
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'El token de acceso es invalido o ha expirado.',
    });
  }
  const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transporte);
  await transporte.handleRequest(req, res, req.body);
});

app.listen(3000);
```

Variables de entorno requeridas:

```
AUTH_JWKS_URI=https://auth.empresa.com/.well-known/jwks.json
AUTH_ISSUER=https://auth.empresa.com
AUTH_AUDIENCE=mcp-servidor-nombre
AUTH_AUTHORIZATION_ENDPOINT=https://auth.empresa.com/authorize
AUTH_TOKEN_ENDPOINT=https://auth.empresa.com/token
```

Principios de seguridad para OAuth en servidores MCP:
- El endpoint `/.well-known/oauth-authorization-server` es publico y no requiere autenticacion.
- El endpoint `/mcp` requiere un Bearer token valido en cada request, sin excepcion.
- Los access tokens tienen TTL corto (maximo 1 hora). Los refresh tokens tienen TTL largo pero se rotan al usarse.
- Nunca hardcodear `AUTH_JWKS_URI` ni ninguna URL del authorization server en el codigo. Solo desde variables de entorno.
- El servidor MCP actua como Resource Server en el flujo OAuth. No actua como Authorization Server; esa responsabilidad recae en un servicio dedicado (Keycloak, Auth0, AWS Cognito, etc.).

## Lista de Verificacion de Revision de Codigo — Servidor MCP

Verificar en orden antes de aprobar un PR que introduce o modifica un servidor MCP.

1. Schema: cada herramienta tiene un `inputSchema` completo con tipos, `description` por argumento y limites de valores.
2. Validacion: la implementacion de cada herramienta valida inputs de negocio mas alla del schema JSON Schema.
3. Errores: las herramientas devuelven errores MCP con codigo y mensaje descriptivo, no exceptions no manejadas.
4. Secretos: no hay credenciales, URLs con contrasenas ni tokens en schemas, descripciones ni logs.
5. Autenticacion: si el transporte es Streamable HTTP, la autenticacion se valida antes de procesar el request MCP.
6. Testing: cada herramienta fue verificada con MCP Inspector antes del PR.
7. Permisos: las herramientas solo acceden a los recursos estrictamente necesarios para su funcion.
8. Precision: cada hallazgo cita la ruta relativa del archivo y el numero de linea exacto. Sin esta referencia, el hallazgo no es accionable.

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.
- Verificar autenticacion en el transporte antes de publicar un servidor MCP que accede a datos de produccion.
- Asegurar que no se ejecuta: incluir secretos, URLs internas o datos de infraestructura en schemas o descripciones de herramientas.
- Verificar confirmacion explicita en el schema (parametro `confirmar: boolean` o similar) antes de disenar herramientas con efectos secundarios destructivos.
- Prohibido usar el transporte SSE legacy (`SSEServerTransport`) en nuevos servidores. Usar exclusivamente `StreamableHTTPServerTransport` para servidores remotos (especificacion MCP 2025-03-26).

## Modulo — Vanguardia Transversal en Construccion de Servidores MCP

### IDENTIDAD DECLARADA ANTES DE EJECUTAR

Antes de generar el primer archivo de un servidor MCP nuevo, completar en una linea:

`IDENTIDAD MCP: Dominio del servidor: [nombre real del sistema interno que expone, no "mi servidor"] | Transporte: [stdio para local/CLI | Streamable HTTP para remoto/multi-usuario] | Primitivas expuestas: [Tools | Resources | Prompts | combinacion, con lista real de nombres] | Superficie de confianza: [localhost sin red | red interna con auth | publico con OAuth 2.0] | Referencia de spec objetivo: [numero de version MCP contra el que se construye, ej. 2026-07-28]`

Sin esta linea llenada con nombres reales (no placeholders tipo "mi_herramienta"), no se emite codigo del servidor.

### PROHIBIDO — PATRONES RECONOCIBLES DE DEMO/PLANTILLA

- El servidor "weather" o "calculadora" de los tutoriales oficiales del SDK, copiado como esqueleto sin adaptar nombre, dominio ni schema al sistema real que se esta exponiendo.
- Una sola herramienta generica `ejecutar_accion(input: string)` que recibe un string libre y lo interpreta internamente, en vez de un schema tipado por operacion — evade el proposito de JSON Schema como contrato.
- `console.log` o `print` para depuracion dejados en el transporte stdio, que corrompen el canal stdout reservado exclusivamente para JSON-RPC y rompen al cliente en produccion.
- Nombre de servidor y de herramientas en ingles genérico de ejemplo (`my-server`, `tool_1`, `do_something`) que sobrevive del boilerplate hasta el commit final.
- Registrar recursos (`server.resource`) que exponen el filesystem completo con un template `archivo://{ruta}` sin validacion de directorio permitido, replicando el ejemplo minimo de la documentacion tal cual, sin el guardado de path traversal que el propio skill ya exige.
- Anotaciones de herramientas (`destructiveHint`, `readOnlyHint`) omitidas por completo porque el ejemplo de referencia tampoco las mostraba, en servidores donde si aplican.

### GATE DE CALIDAD MEDIBLE (no solo estetico)

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Cobertura de schema por herramienta | 100% de las herramientas registradas tienen `description` en la herramienta y en cada argumento de su `inputSchema` | Inspeccion manual con MCP Inspector (`npx @modelcontextprotocol/inspector`) — panel de "Tools", cada entrada sin campos vacios |
| Latencia de respuesta de `tools/call` | p95 <= 300ms para herramientas que no dependen de I/O externo lento (red/DB remota se excluye del umbral pero debe medirse aparte) | Medir con el Inspector o un script que invoque la herramienta 50 veces y calcule p95 |
| Errores JSON-RPC sin manejar | 0 excepciones no capturadas que lleguen al cliente como error de transporte generico en vez de error MCP con codigo y mensaje | Forzar inputs invalidos (fuera de rango, tipo incorrecto, recurso inexistente) contra cada herramienta via Inspector y confirmar que cada caso devuelve un error estructurado, no un crash del proceso |
| Autenticacion en Streamable HTTP | 100% de los requests a `/mcp` sin `Authorization` valido responden 401 antes de tocar logica MCP | `curl -X POST http://localhost:3000/mcp` sin header, confirmar status 401 y que no se ejecuto ninguna herramienta (revisar logs) |
| Secretos en superficie visible al modelo | 0 ocurrencias de patrones tipo credencial (`://.*:.*@`, `sk-`, `Bearer `) en schemas, descripciones de herramientas o nombres de recursos | `grep -rn "://.*:.*@\|api[_-]key\|password" --include="*.ts" --include="*.py"` sobre el modulo de definicion de herramientas |

### VIGENCIA — ESTANDAR MAS RECIENTE DEL DOMINIO

Verificado contra fuente oficial (`modelcontextprotocol.io/specification/2026-07-28/changelog` y paginas de especificacion referenciadas, 2026-08-14): la version 2026-07-28 sigue siendo la vigente, y la seccion tecnica principal de este skill (arriba) ya fue actualizada para ser consistente con este modulo — `server/discover`, `resultType` obligatorio y `subscriptions/listen` estan documentados en el cuerpo principal, no solo aqui.

Shape exacto verificado de `server/discover` (request sin params propios, solo `_meta` estandar):

```json
{"jsonrpc":"2.0","id":"discover-1","result":{"resultType":"complete","supportedVersions":["2026-07-28"],"capabilities":{"tools":{},"resources":{}},"_meta":{"io.modelcontextprotocol/serverInfo":{"name":"ExampleServer","version":"1.0.0"}},"instructions":"...","ttlMs":3600000,"cacheScope":"public"}}
```

Precision adicional sobre OAuth (fuente: `modelcontextprotocol.io/specification/2026-07-28/basic/authorization` y `.../basic/authorization/client-registration`): CIMD y la validacion de `iss`/RFC 9207 son responsabilidad exclusiva del cliente MCP y del authorization server — el servidor MCP (Resource Server) no implementa ninguno de los dos; su unico deber sigue siendo validar `issuer`/`audience` del access token, ya cubierto por el ejemplo de codigo de este skill. No agregar codigo de CIMD ni de validacion de `iss` al servidor.

Roots, Sampling y Logging (la primitiva del protocolo, no el uso de stderr) quedan formalmente en estado Deprecated con ventana minima de 12 meses — coherente con lo que ya declara este skill.
