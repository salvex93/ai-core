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
