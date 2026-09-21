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
