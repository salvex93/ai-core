---
name: mcp-server-builder
description: Especialista en construccion de servidores MCP (Model Context Protocol). Cubre ciclo de vida del protocolo, transportes stdio y SSE/HTTP, definicion de herramientas con JSON Schema, seguridad de inputs, testing con MCP Inspector y despliegue. Activa al construir un servidor MCP propio, exponer herramientas internas a Claude, o publicar un servidor MCP en el registro oficial.
origin: ai-core
version: 1.3.1
last_updated: 2026-04-16
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

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta SDK MCP presente (@modelcontextprotocol/sdk o mcp Python), herramientas registradas, transportes configurados (stdio/SSE) y credenciales de servicios")
```

Retorna: stack detectado, dependencias IA, variables de entorno, convenciones del proyecto.

Si MCP gemini-bridge no disponible → leer manualmente: `package.json`, `.env.example`, `CLAUDE.md` local.

Complementar con grep para herramientas existentes: `grep -r "server.tool\|@mcp.tool\|ListToolsRequest" --include="*.ts" --include="*.py" .`

Si el archivo de configuracion del servidor o el modulo de herramientas supera 500 lineas o 50 KB, aplicar Regla 9:

```
node scripts/gemini-bridge.js --mission "Analiza el servidor MCP e identifica: herramientas sin validacion de schema, ausencia de manejo de errores JSON-RPC, secretos en schemas de herramientas, ausencia de autenticacion en transportes HTTP y herramientas con permisos excesivos" --file <ruta> --format json
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

## Arquitectura del Protocolo MCP

### Ciclo de vida de la conexion

```
1. Handshake
   Cliente -> initialize (version, capabilities)
   Servidor -> initialized (version, capabilities del servidor)

2. Descubrimiento
   Cliente -> tools/list
   Servidor -> lista de herramientas con schemas JSON Schema

3. Ejecucion
   Cliente -> tools/call (nombre de herramienta + argumentos tipados)
   Servidor -> resultado (contenido de texto, imagen, recurso, o error)

4. Cierre
   Cliente -> cierra la conexion (EOF en stdio, cierre del stream HTTP para Streamable HTTP)
```

Todos los mensajes siguen JSON-RPC 2.0. Los IDs de request son enteros o strings. Los errores siguen los codigos estandar de JSON-RPC mas los codigos de error MCP.

### Transportes disponibles

| Transporte | Descripcion | Cuando usar |
|---|---|---|
| `stdio` | El servidor corre como proceso hijo. El cliente se comunica via stdin/stdout. | Servidores locales, herramientas de desarrollo, integracion con Claude Code CLI. |
| `Streamable HTTP` | El servidor expone un endpoint HTTP con soporte opcional de streaming via SSE. Especificacion MCP 2025-03-26. | Servidores remotos, servicios compartidos, SaaS, servidores multi-usuario. |

El transporte `stdio` es mas simple de implementar y mas seguro por defecto (sin superficie de red). El transporte `Streamable HTTP` reemplaza al SSE legacy de la especificacion anterior y requiere autenticacion explicita si el servidor es accesible desde redes externas. El transporte SSE puro (`SSEServerTransport`) esta obsoleto a partir de la especificacion 2025-03-26; no construir nuevos servidores con el.

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

La especificacion MCP 2025-03-26 define metadatos opcionales de comportamiento por herramienta. El cliente MCP puede usarlos para solicitar confirmacion del usuario antes de ejecutar operaciones sensibles.

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

Transporte definido en la especificacion MCP 2025-03-26. Reemplaza al SSE legacy. El cliente envía peticiones HTTP POST al endpoint `/mcp` y el servidor puede responder con JSON simple o con un stream SSE segun la cabecera `Accept` del cliente.

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
- El transporte SSE legacy (`SSEServerTransport`) esta obsoleto a partir de la especificacion 2025-03-26. Los servidores nuevos usan `StreamableHTTPServerTransport` exclusivamente.

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

La especificacion MCP 2025-03-26 define OAuth 2.0 como el mecanismo de autenticacion estandar para servidores MCP accesibles via Streamable HTTP desde redes externas. El flujo recomendado es Authorization Code con PKCE.

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

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil. Restricciones adicionales:
- Prohibido publicar un servidor MCP que accede a datos de produccion sin autenticacion en el transporte.
- Prohibido incluir secretos, URLs internas o datos de infraestructura en schemas o descripciones de herramientas.
- Prohibido disenar herramientas con efectos secundarios destructivos sin confirmacion explicita en el schema (parametro `confirmar: boolean` o similar).
- Prohibido usar el transporte SSE legacy (`SSEServerTransport`) en nuevos servidores. Usar exclusivamente `StreamableHTTPServerTransport` para servidores remotos (especificacion MCP 2025-03-26).
