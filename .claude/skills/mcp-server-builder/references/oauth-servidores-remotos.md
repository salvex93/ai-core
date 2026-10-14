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
