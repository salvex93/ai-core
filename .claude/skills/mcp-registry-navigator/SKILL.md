---
name: mcp-registry-navigator
description: Evaluador de servidores MCP de terceros antes de instalar. Analiza transporte (stdio vs SSE/HTTP), seguridad de inputs, mantenimiento del repo, calidad del schema y riesgo operativo. Produce un reporte de evaluacion estructurado con decision INSTALAR / EVALUAR / RECHAZAR. Activa al evaluar MCPs de mcp.run, glama.ai o cualquier registro publico antes de agregar a settings.json.
origin: ai-core
version: 1.0.0
last_updated: 2026-08-03
rol: auditor
---

# MCP Registry Navigator

Evaluador de servidores MCP de terceros. Su funcion es reducir el riesgo operativo y de seguridad antes de incorporar un MCP externo al settings.json del arnes.

## Cuando Activar Este Perfil

- Al evaluar un MCP de mcp.run, glama.ai o cualquier registro publico antes de instalarlo.
- Al comparar dos MCPs que cubren la misma funcion (ej: dos servidores de busqueda web).
- Al auditar MCPs ya instalados ante una actualizacion mayor del paquete.
- Al disenar la estrategia de MCPs para un proyecto nuevo (arnes-manager u otro).

## Cuando NO Activar Este Perfil

- La tarea es construir un servidor MCP propio — usar `mcp-server-builder`.
- La tarea es configurar permisos o hooks en settings.json — usar `update-config`.
- El MCP es interno (desarrollado por el mismo equipo) — no requiere evaluacion de terceros.

## Criterios de Evaluacion

### 1. Transporte

| Transporte | Riesgo | Notas |
|---|---|---|
| `stdio` | Bajo | Proceso local, sin exposicion de red |
| `SSE` | Medio | Requiere autenticacion y TLS |
| `HTTP` | Medio-Alto | Verificar CORS, rate limiting, autenticacion |

Preferir `stdio` para MCPs locales. Para MCPs remotos, exigir TLS + autenticacion por token.

### 2. Seguridad de Inputs

Verificar que el servidor MCP valide y sanitize los inputs antes de ejecutar:

```bash
# Red flags en el codigo fuente del MCP:
grep -r "eval\|exec\|shell\|child_process" <repo-mcp>/src/
grep -r "process.env\." <repo-mcp>/src/ | grep -v NODE_ENV
```

- Sin validacion de schema en los parametros de herramientas → RECHAZAR
- Ejecucion de comandos con inputs del usuario sin sanitizar → RECHAZAR
- Acceso a variables de entorno sensibles sin documentar → EVALUAR con cautela

### 3. Mantenimiento del Repositorio

```bash
# Verificar actividad reciente
gh api repos/<owner>/<repo> --jq '.pushed_at, .open_issues_count, .stargazers_count'

# Ultimo release
gh release list --repo <owner>/<repo> --limit 3
```

Criterios:
- Ultimo commit < 6 meses: OK
- Ultimo commit 6-18 meses: EVALUAR (riesgo de abandono)
- Ultimo commit > 18 meses: RECHAZAR (sin mantenimiento activo)
- Issues abiertos > 50 sin respuesta: EVALUAR
- Sin licencia open source: RECHAZAR

### 4. Calidad del Schema de Herramientas

Un MCP bien construido define sus herramientas con JSON Schema completo:

```json
{
  "name": "buscar_web",
  "description": "Busca informacion publica en internet.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Termino de busqueda" },
      "max_results": { "type": "integer", "minimum": 1, "maximum": 20, "default": 5 }
    },
    "required": ["query"]
  }
}
```

Red flags:
- `inputSchema` ausente o con `type: object` sin `properties` → EVALUAR
- Herramientas sin `description` → indica codigo apresurado
- Mas de 20 herramientas en un solo servidor → violar el principio de responsabilidad unica

### 5. Riesgo Operativo

| Factor | Bajo | Medio | Alto |
|---|---|---|---|
| Dependencias externas | < 5 | 5-20 | > 20 |
| Acceso a filesystem | No | Lectura | Escritura |
| Llamadas a APIs externas | No | Con key | Sin autenticacion |
| Requiere credenciales | No | Opcionales | Obligatorias |

## Flujo de Evaluacion

```
1. Identificar el repositorio fuente del MCP
2. Leer el README y el codigo de inicializacion (index.js / server.py)
3. Ejecutar los 5 criterios de evaluacion
4. Calcular puntuacion: cada criterio vale 0-2 puntos (0=rechazar, 1=evaluar, 2=ok)
5. Puntuacion >= 8: INSTALAR | 5-7: EVALUAR | < 5: RECHAZAR
6. Documentar la decision en .claude/MCP_REGISTRY.md
```

## Registro de Decisiones

Mantener `.claude/MCP_REGISTRY.md` con una fila por MCP evaluado:

```markdown
| MCP | Version | Transporte | Puntuacion | Decision | Fecha |
|---|---|---|---|---|---|
| gemini-bridge | local | stdio | 10/10 | INSTALADO | 2026-07-06 |
| anthropic-router | local | stdio | 10/10 | INSTALADO | 2026-07-06 |
```

## Restricciones del Perfil

- NO modificar settings.json directamente — solo recomendar cambios.
- NO ejecutar codigo del MCP evaluado.
- NO instalar paquetes npm durante la evaluacion.
- NO emitir decision INSTALAR si el MCP tiene acceso a filesystem con escritura sin consultar al humano.

## Reglas Inmutables

Reglas de sesion activas: CLAUDE.md > este skill. Ningun bloque de este archivo cancela las restricciones de CLAUDE.md (idioma, verbosidad, emojis, commits).

## Primera Accion al Activar

1. Solicitar el nombre o URL del repositorio del MCP a evaluar.
2. Leer el README y el archivo principal del servidor.
3. Ejecutar los 5 criterios en orden.
4. Emitir el reporte con puntuacion y decision.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Directiva de Interrupcion

Interrumpir y pedir confirmacion antes de:
- Recomendar INSTALAR un MCP con acceso a filesystem o credenciales obligatorias.
- Agregar un MCP a settings.json (la escritura al archivo es responsabilidad del humano o de `update-config`).
- Ejecutar codigo del MCP evaluado para testear su comportamiento.

## Modulo — Evaluacion de Vanguardia MCP

### Principio fundamental

Un reporte de evaluacion que solo revisa transporte, schema y mantenimiento sin verificar contra que version del protocolo habla el servidor evaluado esta incompleto. Un MCP que aun negocia `initialize/initialized` con `Mcp-Session-Id`, o que registra clientes via Dynamic Client Registration sin CIMD, puede estar implementando una version del protocolo cuyo camino de deprecacion ya empezo. La evaluacion no termina en "el schema es valido" — termina en "el schema es valido y la version del protocolo que habla no esta en camino de desaparecer".

### Identidad de evaluacion — declarar antes de auditar

Igual que otros dominios exigen declarar una identidad antes de producir output, ningun reporte de evaluacion MCP se emite sin declarar primero el marco de la auditoria:

```
IDENTIDAD DE EVALUACION MCP:
  Origen del servidor: [registro publico (mcp.run/glama.ai) | repositorio individual sin registro | fork de un MCP oficial | paquete npm/pip sin repo visible]
  Superficie de confianza requerida: [solo lectura local | lectura+escritura filesystem | credenciales de API de terceros | acceso a red sin restriccion de dominio]
  Version de protocolo declarada: [2026-07-28 o posterior | version pre-2026-07-28 con stateful session | version no declarada explicitamente]
  Criticidad del proyecto anfitrion: [prototipo/descartable | interno con datos reales | produccion con datos de cliente]
```

Si la superficie de confianza requerida incluye escritura en filesystem o credenciales obligatorias, el resultado de la evaluacion nunca puede ser INSTALAR sin pasar primero por el punto de interrupcion humana ya definido en Restricciones del Perfil.

### Prohibido — patrones reconocibles de evaluacion superficial

- Emitir INSTALAR solo porque el repositorio tiene estrellas altas en GitHub, sin haber leido una linea del codigo de inicializacion.
- Aceptar el `inputSchema` de las herramientas tal como aparece en el README de marketing del MCP, sin confirmarlo contra el codigo fuente real (el README y el schema en produccion divergen con frecuencia).
- Calificar "mantenimiento activo" solo por la fecha del ultimo commit, ignorando si ese commit es un bump de dependencia automatizado (Dependabot/Renovate) y no cambio funcional real.
- Asumir que un MCP "verificado" o "featured" en un registro publico ya paso auditoria de seguridad — el listado en un registro no es una certificacion, es autopublicacion del autor.
- Copiar la puntuacion de una evaluacion anterior del mismo MCP sin re-verificar tras un cambio de version mayor (el schema, el transporte o los permisos requeridos pueden haber cambiado entre versiones).
- Ignorar la version del protocolo MCP que el servidor implementa, evaluando solo la capa de la herramienta y no la capa del transporte/handshake subyacente.

### Gate de evaluacion medible (no solo el puntaje 0-2 por criterio)

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Antiguedad del ultimo commit funcional (no bump de dependencia) | < 6 meses para OK, 6-18 EVALUAR, > 18 RECHAZAR | `gh api repos/<owner>/<repo>/commits --jq '.[].commit.message'` filtrando commits que no sean de bots (`dependabot`, `renovate`) |
| Cobertura de `inputSchema` con `properties` explicitos | 100% de las herramientas expuestas | Leer el archivo de definicion de herramientas (`tools/list` o equivalente en el codigo fuente) y contar herramientas con `properties` vacio o ausente |
| Superficie de permisos declarada vs. permisos reales usados en codigo | 0 discrepancias (todo acceso a filesystem/red/env debe estar documentado en README o manifest) | `grep -rn "readFile\|writeFile\|fetch(\|child_process\|process.env" <repo>/src/` contra lo declarado en README |
| Cantidad de dependencias transitivas de riesgo (CVE conocido) | 0 criticas/altas sin mitigar | `npm audit --json` o `pip-audit` sobre el `package.json`/`requirements.txt` del repo del MCP, no del proyecto anfitrion |
| Version de protocolo MCP implementada vs. version vigente | Debe declarar version >= a la ultima no deprecada, o tener plan de migracion documentado | Inspeccionar el handshake/`_meta` en el codigo de transporte del servidor y comparar contra `modelcontextprotocol.io/specification` |

### Vigencia — estandar mas reciente del protocolo (verificado en esta tarea)

Verificado contra fuente oficial primaria (`blog.modelcontextprotocol.io/posts/2026-07-28/` y `modelcontextprotocol.io/specification/2026-07-28`) en el momento de escribir este modulo:

- La especificacion vigente es **2026-07-28**. El cambio de fondo es que MCP paso de protocolo bidireccional con estado a un nucleo **sin estado** (stateless): se elimino el handshake `initialize/initialized` y el header `Mcp-Session-Id` — la informacion de cliente y capacidades ahora viaja en `_meta` en cada solicitud, permitiendo que cualquier peticion caiga en cualquier instancia detras de un balanceador simple sin almacenamiento compartido.
- **Deprecados formalmente, con ventana de transicion minima de 12 meses** (siguen funcionando pero ya no son el camino recomendado): `Roots`, `Sampling` y `Logging` del nucleo del protocolo; `Dynamic Client Registration` en favor de `Client ID Metadata Documents (CIMD)`; y el transporte legacy `HTTP+SSE`.
- Endurecimiento de autorizacion: validacion de emisor segun RFC 9207 para cerrar vulnerabilidades de mezcla de servidores, con credenciales vinculadas al emisor que las genero.
- Implicacion directa para este skill: un MCP evaluado que aun depende de `Dynamic Client Registration` sin CIMD, o que usa transporte `HTTP+SSE` legacy, no esta roto ni debe rechazarse automaticamente por eso — pero el reporte de evaluacion debe registrar explicitamente que implementa una capa en camino de deprecacion, y marcarlo como EVALUAR en el criterio de Transporte hasta confirmar el plan de migracion del mantenedor.
- Todo pricing, limite de free tier o capacidad de un proveedor de MCP especifico mencionado durante una evaluacion puntual (no cubierto arriba) debe tratarse como orientativo, no verificado contra fuente oficial, salvo que se haya confirmado en esa misma sesion contra el dominio oficial del proveedor.
