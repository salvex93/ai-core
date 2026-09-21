---
name: mcp-server-builder
description: Especialista en construccion de servidores MCP (Model Context Protocol). Cubre ciclo de vida del protocolo, transportes stdio y SSE/HTTP, definicion de herramientas con JSON Schema, seguridad de inputs, testing con MCP Inspector y despliegue. Activa al construir un servidor MCP propio, exponer herramientas internas a Claude, o publicar un servidor MCP en el registro oficial.
origin: ai-core
version: 1.5.2
last_updated: 2026-09-21
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

## Especificacion Vigente: 2026-07-28 (Current)

La especificacion 2026-07-28 es la version Current del protocolo (`modelcontextprotocol.io/specification/versioning`, verificado 2026-09-21; RC publicado 2026-05-21, release final 2026-07-28) y reemplaza a 2025-03-26 como base de este skill. Cambio de fondo: el protocolo pasa de sesion con estado a stateless por request. Ver detalle en `blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/`.

Ventana de migracion: la del RC (10 semanas) ya cerro. Servidores nuevos se construyen directamente contra 2026-07-28; servidores existentes en 2025-03-26 siguen funcionando mientras no se remuevan (garantia minima de 12 meses de deprecacion), pero migrar evita el doble mantenimiento.

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


---

## Modulos de Referencia (Primitivas del Protocolo, OAuth, Vanguardia)

Contenido expansivo movido a `references/` (divulgacion progresiva, agentskills.io) para mantener este SKILL.md nucleo por debajo del limite recomendado. Cargar el archivo correspondiente cuando la tarea lo requiera:

- `references/primitivas-protocolo.md` — Primitivas adicionales del protocolo (Prompts, Resources, Roots, Sampling).
- `references/oauth-servidores-remotos.md` — Autenticacion OAuth 2.0 en servidores remotos.
- `references/vanguardia-mcp.md` — Vanguardia transversal en construccion de servidores MCP.
