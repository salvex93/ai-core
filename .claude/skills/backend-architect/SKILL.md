---
name: backend-architect
description: Backend Architect Universal. Experto en SOLID, Clean Architecture, gestion de persistencia, arquitectura event-driven (Kafka/RabbitMQ/SQS, patron Outbox, DLQ), WebSockets/Server-Sent Events y scaffolding de proyectos desde cero. Con codigo real verificado en Node.js/TypeScript, Python, Go (net/http y Gin), Rust (Axum), Java/JVM (Spring Boot), .NET (ASP.NET Core), PHP (Laravel) y Ruby (Rails) ademas de las convenciones agnosticas de stack. Deduce el ORM, lenguaje y base de datos del repositorio anfitrion antes de emitir recomendaciones. Activa al disenar APIs, modelar esquemas, escribir migraciones, revisar queries, implementar mensajeria asincrona o tiempo real, o arrancar un servidor nuevo de cero.
origin: ai-core
version: 1.7.0
last_updated: 2026-08-04
rol: architect
---

# Backend Architect Universal

Este perfil gobierna las decisiones de arquitectura en la capa de servidor, persistencia e integraciones. Se adapta automaticamente al lenguaje y framework del Proyecto Anfitrion (Node.js, Python, Go, Rust, JVM, etc.) leyendo los manifiestos de dependencias, sin requerir un skill separado por tecnologia. Antes de cualquier recomendacion, deduce el entorno del repositorio anfitrion leyendo sus manifiestos.

## Cuando Activar Este Perfil

- Al disenar o revisar endpoints de una API (REST, GraphQL, RPC).
- Al escribir o revisar migraciones de esquema o datos.
- Al modelar tablas, colecciones, relaciones o indices en cualquier motor de base de datos.
- Al definir la capa de repositorio, acceso a datos o adaptadores de persistencia.
- Al revisar queries con riesgo de N+1, locks, deadlocks o rendimiento degradado.
- Al evaluar seguridad en la capa de servidor: autenticacion, autorizacion, validacion de entrada.
- Al introducir o revisar patrones de arquitectura: SOLID, Clean Architecture, Hexagonal, CQRS.
- Al disenar comunicacion asincrona entre servicios: colas de mensajes, event sourcing, pub/sub.
- Al implementar comunicacion en tiempo real: WebSockets, Server-Sent Events, chat, notificaciones live.

## Cuando NO Activar Este Perfil

- La tarea es un cambio de UI/UX, routing del cliente o estado del frontend — usar `tech-lead-frontend`.
- La tarea es configurar CI/CD, Dockerfiles o infraestructura de nube — usar `devops-infra`.
- La tarea es disenar queries lentas o tuning de indices en una BD existente en produccion — usar `database-ops`.
- La tarea es construir un pipeline de ingesta/transformacion de datos (ETL) — usar `data-engineer`.
- La tarea es solo añadir una ruta simple a un controlador existente sin cambio de capa — el perfil `coder` es suficiente.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta ORM, framework HTTP, motor de base de datos, lenguaje del stack y convenciones del proyecto")
```

Retorna: stack detectado, dependencias IA, variables de entorno, convenciones del proyecto.

Si MCP gemini-bridge no disponible → leer manualmente: `package.json`, `.env.example`, `CLAUDE.md` local.

Si un archivo identificado para analisis (esquema, migracion, capa de repositorio) supera 200 lineas (o 50 lineas si es log/error), aplicar la regla GEMINI PRIMERO de CLAUDE.md (delegacion obligatoria al bridge) antes de cargarlo:

```
node scripts/mcp-gemini.js --mission "Identifica patrones N+1, queries sin indice, violaciones de separacion de capas y riesgos de inyeccion SQL" --file <ruta> --format json
```

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No emitir codigo hasta tener el plan aprobado.

- La tarea afecta mas de un servicio con contrato publico compartido.
- La tarea incluye una migracion con DROP, ALTER con perdida de datos o cambio de tipo en una columna con datos existentes.
- La tarea introduce un patron arquitectonico no documentado en el proyecto anfitrion.
- La tarea modifica la capa de autenticacion o autorizacion.
- La tarea afecta la concurrencia o introduce mecanismos de bloqueo distribuido.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Principios de Arquitectura

### Separacion de responsabilidades

La arquitectura interna de un servicio backend se organiza en capas con dependencias unidireccionales:

```
Controlador / Router
    -> Servicio (logica de negocio)
        -> Repositorio (acceso a datos)
            -> Driver / ORM / Query Builder
```

Ninguna capa importa de una capa superior. El servicio no conoce el framework HTTP. El repositorio no conoce la logica de negocio.

### Patron Repositorio

El repositorio abstrae el motor de persistencia. El servicio trabaja con una interfaz, no con una implementacion concreta. Esto permite cambiar el motor de base de datos sin modificar la logica de negocio.

```
interface RepositorioUsuarios {
  buscarPorId(id: string): Promise<Usuario | null>
  crear(datos: DatosCrearUsuario): Promise<Usuario>
  actualizar(id: string, datos: DatosActualizarUsuario): Promise<Usuario>
  eliminar(id: string): Promise<void>
}
```

La implementacion concreta depende del ORM detectado en el anfitrion.

### Inyeccion de dependencias

Los servicios reciben sus dependencias (repositorios, clientes externos) como parametros del constructor o como argumentos de funcion. No los instancian internamente. Esto facilita el testing y el reemplazo de implementaciones.

## Convenciones de API REST

### Nomenclatura de rutas

Las rutas usan sustantivos en plural y kebab-case. El metodo HTTP determina la operacion. Ningun verbo en la ruta.

Incorrecto:
```
POST   /crearUsuario
GET    /getProductoById?id=5
DELETE /borrarPedido
```

Correcto:
```
POST   /usuarios
GET    /productos/:id
DELETE /pedidos/:id
```

### Codigos de estado obligatorios

| Situacion | Codigo |
|---|---|
| Recurso creado | 201 |
| Operacion exitosa sin cuerpo de respuesta | 204 |
| Error de validacion de entrada | 400 |
| Sin autenticacion valida | 401 |
| Sin permiso sobre el recurso | 403 |
| Recurso no encontrado | 404 |
| Conflicto de estado (ej: duplicado) | 409 |
| Error interno no anticipado | 500 |

### Contrato de error universal

Todos los errores devuelven el mismo contrato independientemente del stack:

```json
{
  "error": {
    "codigo": "RECURSO_NO_ENCONTRADO",
    "mensaje": "El usuario con id 42 no existe.",
    "campo": null
  }
}
```

El campo `campo` se usa unicamente en errores de validacion para indicar que campo fallo. Nunca exponer stack traces, mensajes internos del ORM ni rutas de archivos en respuestas de error en produccion.

### Versionado de contrato publico

Todo endpoint consumido por un cliente externo (app movil, frontend desacoplado, integracion de terceros) lleva version explicita desde el primer release — agregarla despues rompe a todos los consumidores existentes.

| Estrategia | Formato | Cuando usar |
|---|---|---|
| Prefijo de ruta | `/v1/usuarios` | Default. Explicito, cacheable, facil de enrutar. |
| Header custom | `Api-Version: 2026-08-03` | APIs con muchos endpoints donde versionar por fecha de release es mas manejable que por numero. |
| Content negotiation | `Accept: application/vnd.empresa.v2+json` | APIs publicas con clientes de terceros que necesitan granularidad por recurso. |

Regla: nunca eliminar una version publicada sin periodo de deprecacion anunciado (minimo 90 dias u lo que el contrato con el cliente exija). El endpoint deprecado responde con header `Deprecation: true` y `Sunset: <fecha>` antes de retirarse.

### Idempotencia en operaciones de escritura

Toda operacion `POST` que crea un recurso con efecto economico o irreversible (pagos, envio de notificaciones, creacion de pedidos) acepta una clave de idempotencia del cliente:

```
POST /pedidos
Idempotency-Key: 7c9e6679-7425-40de-944b-e07fc1f90ae7
```

Patron de implementacion: la clave se guarda junto con la respuesta generada la primera vez. Si llega una segunda request con la misma clave, se devuelve la respuesta guardada sin re-ejecutar la operacion.

```sql
CREATE TABLE idempotency_keys (
  clave uuid PRIMARY KEY,
  respuesta_codigo integer NOT NULL,
  respuesta_cuerpo jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
```

Sin `Idempotency-Key`, un reintento de red del cliente (timeout, retry automatico) puede duplicar el efecto de la operacion. `GET`, `PUT` y `DELETE` ya son idempotentes por definicion del metodo HTTP — este patron aplica especificamente a `POST`.

### Paginacion

| Tipo | Formato | Cuando usar |
|---|---|---|
| Offset/limit | `?limit=20&offset=40` | Datasets pequenos-medianos, UI con numeros de pagina. Degrada en rendimiento con offsets altos (el motor escanea y descarta filas). |
| Cursor-based | `?limit=20&cursor=eyJpZCI6NDJ9` | Datasets grandes o de alto volumen de escritura — no se degrada con la profundidad, y es estable si se insertan filas nuevas durante la paginacion. |

Contrato de respuesta paginada:

```json
{
  "datos": [ ... ],
  "paginacion": {
    "siguiente_cursor": "eyJpZCI6NjJ9",
    "tiene_siguiente": true,
    "total": 384
  }
}
```

Regla de seleccion: cursor-based por defecto en cualquier listado que pueda superar 10.000 filas o que reciba escrituras concurrentes durante la lectura. Offset/limit solo en listados acotados y estables.

### GraphQL — cuando se elige sobre REST

GraphQL aplica cuando el cliente necesita componer datos de multiples recursos relacionados en una sola request (evitar over-fetching/under-fetching de REST) y el equipo puede mantener la complejidad adicional de resolvers y N+1 a nivel de campo.

- Resolver N+1 con `DataLoader` (o equivalente del stack) — cada campo resuelto individualmente sin batching genera una query por item de una lista.
- Limitar la profundidad de queries anidadas (`graphql-depth-limit` o equivalente) — sin limite, un cliente puede construir una query que fuerza un join exponencial.
- Paginacion en GraphQL sigue el patron Relay Cursor Connections (`edges`, `node`, `pageInfo.hasNextPage`) como estandar de facto, no offset/limit.
- El contrato de error universal (seccion anterior) no aplica igual en GraphQL: los errores van en el campo `errors` de la respuesta con `extensions.codigo`, no en el codigo de estado HTTP (que siempre es 200 salvo fallo de transporte).

Si el proyecto no tiene ya GraphQL en el stack y la necesidad es CRUD simple sin composicion compleja de recursos, REST sigue siendo el default — GraphQL no es "REST mejorado", es una herramienta distinta con su propio costo operativo.

## Migraciones de Esquema

### Reglas inamovibles

- Una migracion por cambio logico. No agrupar cambios no relacionados en el mismo archivo.
- El metodo de reversion (`down`) debe ser la inversion exacta del `up`. Si no es invertible, documentarlo explicitamente en el archivo.
- Las migraciones no contienen logica de negocio ni llamadas a servicios externos.
- Prohibido modificar una migracion ya ejecutada en cualquier ambiente. Si se necesita corregir, se crea una nueva migracion.
- Las migraciones de datos van en archivos separados de las migraciones de esquema.

### Nombre de archivo de migracion

El nombre sigue el patron `{timestamp}_{descripcion_en_snake_case}.{ext}`, donde el timestamp tiene precision de segundos para garantizar el orden de ejecucion:

```
20260322_143000_crear_tabla_usuarios.js
20260322_143100_agregar_indice_email_usuarios.js
20260322_150000_migrar_nombre_completo_a_campos_separados.js
```

## Consultas a Base de Datos

### Evitar N+1

La consulta N+1 ocurre cuando se ejecuta una query por cada elemento de una lista. La solucion es siempre un JOIN o carga por lotes (batch loading) en una sola operacion. La sintaxis exacta depende del ORM detectado en el anfitrion.

### Transacciones

Toda operacion que escribe en mas de una tabla debe usar una transaccion explicita. Si cualquier paso falla, se revierten todos los cambios anteriores de la misma operacion.

La sintaxis exacta depende del ORM detectado en el anfitrion. El principio es universal.

### Consultas parametrizadas

Prohibido interpolar valores de entrada del usuario directamente en una consulta. Siempre usar los mecanismos de binding del ORM o driver. Esto previene inyeccion SQL independientemente del motor de base de datos.

## Modelado de Datos

### Indices

Los indices se definen en la misma migracion que crea la tabla. No en un paso posterior. Los indices a crear por defecto:

- Clave primaria.
- Toda clave foranea usada en JOINs frecuentes.
- Columnas usadas en clausulas WHERE con cardinalidad alta.
- Columnas usadas en ORDER BY en consultas de alto volumen.

### Normalizacion

Disenar en tercera forma normal (3FN) por defecto. La desnormalizacion solo se acepta con justificacion documentada respaldada por medicion de rendimiento real.

### Claves primarias

Usar UUID generado por la aplicacion en tablas de dominio expuestas externamente o que se repliquen entre sistemas. Usar auto-incremento secuencial en tablas internas de alto volumen de insercion donde el rendimiento de escritura es critico.

## Arquitectura Event-Driven y Mensajeria

Aplica cuando dos o mas servicios necesitan comunicarse sin acoplamiento sincrono directo — el productor no espera respuesta del consumidor, y el consumidor puede caerse sin que el productor falle.

### Seleccion de tecnologia

| Necesidad | Herramienta | Cuando usar |
|---|---|---|
| Streaming de eventos de alto volumen, multiples consumidores del mismo evento | Kafka (o Redpanda como alternativa compatible) | Event sourcing, analitica en tiempo real, mas de 10k eventos/seg, se necesita replay del log |
| Cola de trabajo tradicional, un consumidor procesa cada mensaje una vez | RabbitMQ o SQS | Tareas en background (envio de emails, procesamiento de imagenes), volumen moderado, no se necesita replay |
| Cola gestionada sin operar infraestructura propia (stack AWS) | SQS + SNS (fan-out) | Equipo pequeno, ya esta en AWS, prioridad en cero mantenimiento sobre control fino |
| Pub/sub simple entre servicios ya en el mismo proceso o red interna | Redis Pub/Sub o Streams | Notificaciones de baja latencia, no se requiere persistencia garantizada tras la entrega |

No introducir una cola o broker si dos servicios pueden comunicarse via API sincrona sin que la latencia o el acoplamiento sean un problema real medido — mensajeria agrega complejidad operativa que solo se justifica cuando el acoplamiento sincrono ya es un problema.

### Patron Outbox — consistencia entre BD y evento publicado

Publicar un evento y escribir en la base de datos son dos operaciones que pueden fallar independientemente (el commit de BD triunfa pero el broker esta caido, o viceversa). El patron Outbox evita el estado inconsistente escribiendo el evento en la misma transaccion que el cambio de datos:

```sql
-- Misma transaccion: cambio de negocio + evento a publicar
BEGIN;
UPDATE pedidos SET estado = 'confirmado' WHERE id = $1;
INSERT INTO outbox_eventos (tipo, payload, publicado)
  VALUES ('pedido.confirmado', $2::jsonb, false);
COMMIT;
```

Un proceso separado (poller o CDC via Debezium) lee `outbox_eventos` donde `publicado = false`, publica al broker, y marca `publicado = true`. El broker nunca se llama dentro de la transaccion de negocio.

### Garantias de entrega y idempotencia del consumidor

- **At-least-once** es la garantia realista por defecto — el mensaje puede llegar duplicado. El consumidor debe ser idempotente (mismo patron de `Idempotency-Key` que en HTTP: guardar el ID del mensaje procesado antes de aplicar el efecto).
- **Dead Letter Queue (DLQ)** obligatoria en produccion: tras N reintentos fallidos, el mensaje se mueve a una cola separada para inspeccion manual, nunca se descarta silenciosamente ni bloquea la cola principal reintentando indefinidamente.
- **Particionamiento de topics** (Kafka): la clave de particion determina el orden garantizado — eventos de la misma entidad (ej. mismo `pedido_id`) deben ir a la misma particion para preservar orden relativo.

## Tiempo Real — WebSockets y Server-Sent Events

| Patron | Direccion | Cuando usar |
|---|---|---|
| SSE (Server-Sent Events) | Servidor → cliente unicamente | Notificaciones, feeds de progreso, streaming de texto (LLM). Mas simple que WebSocket, reconexion automatica nativa del navegador via `EventSource`. |
| WebSocket | Bidireccional | Chat, colaboracion en tiempo real, juegos, cualquier caso donde el cliente tambien emite eventos frecuentes al servidor. |
| Polling / long-polling | Cliente → servidor en intervalos | Solo si SSE/WebSocket no son viables (proxy corporativo que los bloquea) — es el fallback, no el default. |

### Escalado horizontal de WebSockets

Un servidor de WebSocket mantiene conexiones con estado (`stateful`) — el balanceador de carga no puede repartir mensajes de una conexion entre instancias distintas del servidor sin un mecanismo de coordinacion:

```
Cliente A → conectado a Instancia 1
Cliente B → conectado a Instancia 2
Instancia 1 necesita notificar a B → no tiene la conexion de B abierta
```

Patron de solucion: **Redis Pub/Sub como bus entre instancias**. Cada instancia se suscribe a los canales relevantes; cuando un evento debe llegar a un cliente conectado a otra instancia, se publica en Redis y la instancia que tiene esa conexion abierta lo reenvia por su socket.

```javascript
// Instancia del servidor WebSocket — reenvio via Redis Pub/Sub
redisSubscriber.subscribe('notificaciones');
redisSubscriber.on('message', (canal, mensajeJson) => {
  const { usuarioId, payload } = JSON.parse(mensajeJson);
  const socket = conexionesLocales.get(usuarioId); // solo si esta conectado a ESTA instancia
  if (socket) socket.send(JSON.stringify(payload));
});
```

### Reconexion y backpressure en el cliente

- El cliente implementa reconexion con backoff exponencial (nunca reintento inmediato en loop) y re-sincroniza estado tras reconectar (el servidor puede haber emitido eventos durante la desconexion).
- Si el servidor emite mensajes mas rapido de lo que el cliente puede procesar, aplicar backpressure: buffer con limite maximo, descartando los mensajes mas antiguos si se supera (para datos de estado, donde el ultimo valor es el que importa) o pausando el productor (para datos donde cada mensaje importa, ej. transacciones).
- Autenticacion de WebSocket: el token se valida en el handshake inicial (query param o header antes del upgrade), no despues de establecida la conexion.

## Seguridad en la Capa de Servidor

- Validar toda entrada en el limite del controlador antes de llegar al repositorio.
- Los secretos (credenciales de BD, claves de API) solo se leen desde variables de entorno. Nunca se pasan como argumentos de funcion ni se registran en logs.
- Los tokens de sesion o JWT no se almacenan en la base de datos en texto plano.
- Las rutas que requieren autenticacion verifican el token antes de ejecutar cualquier logica de negocio.
- El principio de minimo privilegio aplica a las credenciales de base de datos: el usuario de la aplicacion no tiene permisos DDL en produccion.

## Persistencia Vectorial

Las aplicaciones con features de IA requieren almacenar embeddings para busqueda semantica. La decision de motor vectorial determina la estrategia de indexacion, el costo operativo y la complejidad de integracion.

### Seleccion de motor vectorial

| Criterio | pgvector | Motor dedicado (Qdrant, Weaviate, Pinecone) |
|---|---|---|
| Volumen de vectores | Hasta ~5M vectores con latencia aceptable | Desde 5M vectores o cuando pgvector no cumple SLA |
| Infraestructura existente | PostgreSQL ya presente: usar pgvector, cero complejidad operativa adicional | Equipo con capacidad de operar un servicio adicional |
| Busqueda hibrida | BM25 via `pg_trgm` + coseno en la misma query | Soporte nativo de busqueda hibrida en Qdrant y Weaviate |
| Compliance | Datos en la misma BD transaccional: mismas politicas de backup y cifrado | Superficie adicional de compliance y gestores de secretos |

Decidir por pgvector si PostgreSQL ya esta en el stack y el volumen no supera 5M vectores. No agregar un servicio nuevo para un problema que pgvector resuelve dentro del SLA de latencia del proyecto.

### Patron de repositorio hibrido

Cuando una query combina filtros SQL con similitud vectorial, el repositorio ejecuta ambas partes en una sola query para evitar N+1:

```sql
-- Ejemplo: buscar documentos de un usuario ordenados por similitud semantica
SELECT d.id, d.titulo, d.contenido,
       1 - (d.embedding <=> $1::vector) AS similitud
FROM documentos d
WHERE d.usuario_id = $2
  AND d.estado = 'publicado'
ORDER BY d.embedding <=> $1::vector
LIMIT $3;
```

El repositorio recibe el vector de consulta ya calculado; no llama al modelo de embeddings. La generacion del embedding es responsabilidad del servicio de aplicacion, no del repositorio.

### Indices vectoriales

- `ivfflat`: mas rapido de construir, precision aproximada. Aceptable para colecciones que cambian frecuentemente o en desarrollo.
- `hnsw`: mayor precision a igual velocidad de consulta. Recomendado para produccion con colecciones estables.

Crear el indice despues de insertar el volumen inicial de datos, no antes. Un indice HNSW sobre una tabla vacia no tiene el grafo construido correctamente y su rendimiento inicial es suboptimo.

```sql
-- Crear indice HNSW en produccion (tras carga inicial)
CREATE INDEX CONCURRENTLY idx_documentos_embedding
  ON documentos USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

## Lista de Verificacion de Revision de Codigo Backend

Verificar en orden antes de aprobar un PR. Un PR con observacion en cualquier punto no se aprueba.

1. Correctitud: el endpoint devuelve los datos y codigos de estado correctos en todos sus casos (exito, validacion, no encontrado, error interno).
2. Seguridad: no hay inyeccion de consultas posible, no se exponen datos sensibles, la autorizacion esta verificada antes de la logica.
2b. Contrato publico: version explicita en el endpoint, `POST` con efecto irreversible acepta `Idempotency-Key`, listados de alto volumen usan paginacion cursor-based.
3. Migracion: si hay cambio de esquema, el metodo de reversion es correcto, la migracion es atomica y esta separada de la migracion de datos.
4. Rendimiento: no hay N+1, los indices necesarios existen, las transacciones estan bien delimitadas.
5. Consistencia: nomenclatura, estructura de error y convenios del proyecto anfitrion respetados.
6. Precision: cada hallazgo cita la ruta relativa del archivo y el numero de linea exacto. Sin esta referencia, el hallazgo no es accionable.

## Scaffolding de Proyecto Nuevo

Cuando la tarea es crear un servidor desde cero (sin manifiestos existentes), declarar el stack antes de emitir codigo. Si el usuario no lo especifica, preguntar antes de asumir:

- Runtime: Node.js/TypeScript (default), Python, Go, Rust, JVM.
- Base de datos: PostgreSQL (default), MySQL, MongoDB, SQLite.
- Autenticacion: JWT stateless (default), OAuth2, API Keys.

### Estructura base (Node.js + TypeScript + Express + Prisma)

```
src/
  config/           # env vars, constantes, configuracion de providers
  modules/
    auth/
      auth.controller.ts
      auth.service.ts
      auth.middleware.ts
    users/
      users.controller.ts
      users.service.ts
      users.repository.ts
  shared/
    errors/         # AppError, HttpException, codigos de error centralizados
    middleware/     # rate-limiting, cors, request-id, logger estructurado
    utils/          # pagination, fechas, validadores comunes
  database/
    client.ts       # instancia Prisma o pool de conexion
    migrations/     # archivos de migracion
  app.ts            # setup del framework, plugins, rutas
  server.ts         # entry point, manejo de senales SIGTERM/SIGINT
prisma/
  schema.prisma
docker-compose.yml
Dockerfile
.env.example
```

Para Python (FastAPI), Go, Rust o Java, la estructura equivalente se genera con los mismos principios de separacion por modulos y la misma jerarquia de capas — ver ejemplos de codigo real y estructura idiomatica por lenguaje en "Modulo — Backend en Go, Rust y Java/JVM".

### Orden de generacion para bootstrapping

1. `.env.example` — todas las variables requeridas, ninguna con valor real.
2. `docker-compose.yml` — motor de BD + app en red propia.
3. `Dockerfile` — multi-stage: etapa `build` con devDependencies, etapa `runtime` sin ellas.
4. Manifiesto de dependencias con versiones fijas.
5. Schema inicial del ORM con tabla `users` (id UUID, created_at, updated_at).
6. Middleware base: CORS, rate-limiting, request-id, logger JSON.
7. Modulo de autenticacion: registro, login, refresh, endpoint `/health`.
8. Primer modulo de dominio especifico del proyecto.

### Autenticacion JWT minima

- `access_token`: duracion corta (15 min), firmado con clave secreta de entorno.
- `refresh_token`: duracion larga (7 dias), almacenado en BD con hash bcrypt. Invalido al hacer logout.
- El middleware de autenticacion extrae el token de `Authorization: Bearer <token>`, verifica la firma y adjunta el payload a `req.user`. Rechaza con 401 si el token es invalido o expirado.
- No almacenar tokens en texto plano ni en logs.

### Escalamiento a OPUSPLAN en proyecto nuevo

Si el proyecto requiere multi-tenancy, sharding, event sourcing, o la autenticacion utiliza OAuth2/OIDC con providers externos, activar la directiva antes de emitir codigo:

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

---

## Modulo de Testing Backend — Unitarios e Integracion

### Principio fundamental

Todo modulo de backend que se entrega sin tests es deuda tecnica inmediata. Este modulo define que testear, como estructurarlo y que herramientas usar segun el stack detectado en el anfitrion.

### Piramide de tests para backend

```
         /\
        /e2e\        Flujos completos sobre la app desplegada en staging.
       /------\      Pocos. Costosos. Solo flujos criticos de negocio.
      /integra \
     / cion     \    Endpoint completo + BD real + servicios externos mockeados.
    /------------\   Moderados. Cubren el contrato de la API y las transacciones.
   /    unit      \
  /                \ Logica de negocio pura en aislamiento.
 /------------------\ Muchos. Rapidos. Sin BD ni red.
```

| Tipo | Proporcion | Lo que cubre |
|---|---|---|
| Unit | 70% | Servicios, validadores, transformaciones, logica de dominio |
| Integracion | 25% | Endpoints HTTP completos, queries a BD real, transacciones |
| E2E | 5% | Flujos criticos sobre staging. No en CI de PR. |

### Herramientas por stack

| Stack | Unit | Integracion | BD en tests |
|---|---|---|---|
| Node.js / TypeScript | Vitest o Jest | Supertest + Vitest | PostgreSQL en Docker via testcontainers |
| Python | Pytest | Pytest + httpx | SQLAlchemy + pytest-asyncio + testcontainers |
| Go | testing + testify | net/http/httptest | testcontainers-go |
| Java / Kotlin | JUnit 5 + Mockito | Spring Boot Test | Testcontainers |

La herramienta exacta se deduce del `package.json` / `pyproject.toml` / `go.mod` del anfitrion. Si no existe configuracion de testing, proponer la de la tabla anterior.

### Tests unitarios de backend

**Que testear:**
- Servicios con logica de negocio (calculos, validaciones, transformaciones).
- Funciones de dominio puras.
- Middleware custom.
- Funciones de utilidad (formateo, hashing, generacion de tokens).

**Que NO testear con unit tests:**
- Queries SQL directas.
- Controladores sin logica propia.

```typescript
// Vitest — test unitario de servicio
import { describe, it, expect, vi } from 'vitest';
import { PedidoService } from './PedidoService';

const mockRepo = { guardar: vi.fn(), buscarPorId: vi.fn() };
const servicio = new PedidoService(mockRepo);

describe('PedidoService', () => {
  it('calcula el total con descuento correctamente', () => {
    const resultado = servicio.calcularTotal(
      [{ precio: 100, cantidad: 2 }, { precio: 50, cantidad: 1 }],
      { porcentaje: 10 }
    );
    expect(resultado).toBe(225);
  });

  it('lanza error si el pedido esta vacio', () => {
    expect(() => servicio.calcularTotal([], null)).toThrow('El pedido no puede estar vacio');
  });

  it('llama al repositorio con el pedido correcto al crear', async () => {
    mockRepo.guardar.mockResolvedValue({ id: 'uuid-1' });
    await servicio.crear({ items: [{ precio: 100, cantidad: 1 }] });
    expect(mockRepo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ total: 100 })
    );
  });
});
```

```python
# Pytest — test unitario de servicio
import pytest
from unittest.mock import MagicMock
from services.pedido_service import PedidoService

@pytest.fixture
def servicio():
    return PedidoService(repositorio=MagicMock())

def test_calcula_total_con_descuento(servicio):
    items = [{"precio": 100, "cantidad": 2}, {"precio": 50, "cantidad": 1}]
    assert servicio.calcular_total(items, descuento=10) == 225

def test_lanza_error_pedido_vacio(servicio):
    with pytest.raises(ValueError, match="El pedido no puede estar vacio"):
        servicio.calcular_total([], descuento=0)
```

### Tests de integracion de backend

Los tests de integracion verifican el comportamiento completo: HTTP handler + servicio + repositorio + BD real. No se mockea la BD. Si el test usa mock de BD, es un test unitario del controlador, no de integracion.

```typescript
// Supertest + Vitest con BD real
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { db } from '../database';

beforeAll(async () => { await db.migrate.latest(); });
afterAll(async () => { await db.destroy(); });
beforeEach(async () => {
  await db('pedidos').truncate();
  await db('usuarios').truncate();
});

describe('POST /api/pedidos', () => {
  it('crea un pedido y devuelve 201 con id', async () => {
    const [usuario] = await db('usuarios').insert({ email: 'test@test.com' }).returning('*');
    const res = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${generarToken(usuario.id)}`)
      .send({ items: [{ productoId: 'prod-1', cantidad: 2 }] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: expect.any(String), total: expect.any(Number) });
    const enBD = await db('pedidos').where({ id: res.body.id }).first();
    expect(enBD).toBeDefined();
  });

  it('devuelve 400 si el cuerpo esta vacio', async () => {
    const res = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${generarToken('user-1')}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('devuelve 401 sin token', async () => {
    const res = await request(app).post('/api/pedidos').send({ items: [] });
    expect(res.status).toBe(401);
  });
});
```

```python
# Pytest + SQLAlchemy con rollback por test
@pytest.fixture
def db_session(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = sessionmaker(bind=connection)()
    yield session
    session.close()
    transaction.rollback()
    connection.close()

async def test_crear_pedido_devuelve_201(client, db_session):
    response = await client.post("/api/pedidos", json={"items": [{"producto_id": "p1", "cantidad": 1}]})
    assert response.status_code == 201
    assert "id" in response.json()
```

### Estrategia de datos en tests de integracion

- Cada test crea sus propios datos y los limpia al terminar (truncate en `beforeEach` o rollback de transaccion).
- Prohibido depender del orden de ejecucion.
- Prohibido depender de datos residuales de otros tests.
- Datos de referencia inmutables (catalogos, roles): seeders ejecutados una vez al inicio de la suite.

### Nomenclatura de tests backend

```
[unidad]_[condicion]_[resultado esperado]

crearPedido_conItemsValidos_devuelve201ConId
crearPedido_sinAutenticacion_devuelve401
calcularTotal_conDescuentoMayorAlPrecio_lanzaErrorDeValidacion
```

### Cobertura minima obligatoria para backend

Objetivo AAA especifico de esta capa — el piso minimo orientativo agnostico de stack esta en `qa-engineer`. Usar esta tabla como meta; si el proyecto no puede alcanzarla aun, el minimo de `qa-engineer` es aceptable como punto de partida documentado.

| Capa | Umbral |
|---|---|
| Servicios / Logica de dominio | 90% de ramas |
| Middleware de autenticacion | 95% de ramas |
| Funciones de utilidad | 95% de ramas |
| Controladores / Routers | 80% (via integracion) |
| Repositorios / Queries | 70% (via integracion) |

### Lista de verificacion de PR — Tests Backend

- [ ] Toda funcion publica de servicio tiene al menos 1 test de camino feliz y 1 de error esperado.
- [ ] Tests de integracion usan BD real, no mock de repositorio.
- [ ] Cada test limpia sus propios datos.
- [ ] Tests no dependen del orden de ejecucion.
- [ ] Endpoints de autenticacion tienen tests de 401/403.
- [ ] Cobertura del modulo no baja del umbral acordado.
- [ ] Nombres de tests describen comportamiento, no implementacion.
- [ ] Cada hallazgo cita ruta relativa + numero de linea exacto.

---

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables.
- Leer los manifiestos del anfitrion antes de recomendar ORM o query builder.
- En modo scaffolding, declarar el stack antes de emitir cualquier codigo.
- Confirmar explicitamente con el usuario antes de escribir en `BACKLOG.md`.
- Incluir los tests unitarios correspondientes en todo modulo nuevo entregado.
- Documentar la justificacion antes de aprobar un PR que reduzca cobertura.

---

## Modulo — Backend en Go, Rust y Java/JVM: Codigo Real por Lenguaje

### Principio fundamental

Este perfil se declara agnostico al lenguaje, pero declarar agnosticismo sin ejemplos ejecutables reales deja al usuario de cada stack con solo nombres en tablas de decision. Este modulo cierra esa brecha con API REST, concurrencia idiomatica y testing verificados contra fuente oficial de cada lenguaje — no interpolados desde el ejemplo de Node.js/TypeScript. Cubre Go, Rust, Java/JVM (mas abajo) y .NET, PHP, Ruby (modulo siguiente) — los 6 lenguajes de backend de mayor uso real.

### Go — net/http (stdlib) y Gin

Version verificada: Go 1.26.0 (fuente: `go.dev/doc/devel/release`). El router nativo `http.ServeMux` soporta patrones `"METODO /ruta"` y wildcards `{nombre}` desde Go 1.22 (fuente: `go.dev/doc/go1.22`) — no requiere un framework para casos simples.

```go
// main.go — net/http estandar, sin framework
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
)

type Pedido struct {
	ID     int     `json:"id"`
	Item   string  `json:"item"`
	Precio float64 `json:"precio"`
}

var ErrPedidoNoEncontrado = errors.New("pedido no encontrado")

type PedidoStore struct {
	mu      sync.RWMutex
	pedidos map[int]Pedido
	nextID  int
}

func NewPedidoStore() *PedidoStore {
	return &PedidoStore{pedidos: make(map[int]Pedido), nextID: 1}
}

func (s *PedidoStore) Crear(p Pedido) Pedido {
	s.mu.Lock()
	defer s.mu.Unlock()
	p.ID = s.nextID
	s.nextID++
	s.pedidos[p.ID] = p
	return p
}

func (s *PedidoStore) ObtenerPorID(id int) (Pedido, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, ok := s.pedidos[id]
	if !ok {
		return Pedido{}, ErrPedidoNoEncontrado
	}
	return p, nil
}

func responderJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("error codificando respuesta JSON: %v", err)
	}
}

func responderError(w http.ResponseWriter, status int, mensaje string) {
	responderJSON(w, status, map[string]string{"error": mensaje})
}

func handlerCrearPedido(store *PedidoStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var entrada Pedido
		defer r.Body.Close()

		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&entrada); err != nil {
			responderError(w, http.StatusBadRequest, fmt.Sprintf("cuerpo invalido: %v", err))
			return
		}
		if entrada.Item == "" || entrada.Precio <= 0 {
			responderError(w, http.StatusUnprocessableEntity, "item y precio son obligatorios")
			return
		}

		creado := store.Crear(entrada)
		responderJSON(w, http.StatusCreated, creado)
	}
}

func handlerObtenerPedido(store *PedidoStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(r.PathValue("id"))
		if err != nil {
			responderError(w, http.StatusBadRequest, "el 'id' debe ser numerico")
			return
		}

		pedido, err := store.ObtenerPorID(id)
		if err != nil {
			if errors.Is(err, ErrPedidoNoEncontrado) {
				responderError(w, http.StatusNotFound, err.Error())
				return
			}
			responderError(w, http.StatusInternalServerError, "error interno")
			return
		}
		responderJSON(w, http.StatusOK, pedido)
	}
}

func main() {
	store := NewPedidoStore()
	mux := http.NewServeMux()

	// Sintaxis "METODO /ruta" y wildcard {id} — Go 1.22+ (go.dev/doc/go1.22).
	mux.HandleFunc("POST /pedidos", handlerCrearPedido(store))
	mux.HandleFunc("GET /pedidos/{id}", handlerObtenerPedido(store))

	log.Println("escuchando en :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatalf("servidor detenido: %v", err)
	}
}
```

Con Gin (`go get github.com/gin-gonic/gin@v1.12.0`, version verificada en `github.com/gin-gonic/gin/releases`, `go.mod` minimo Go 1.25.0 — compatible con Go 1.26.0):

```go
r := gin.Default() // incluye middleware Logger() y Recovery()

r.POST("/pedidos", func(c *gin.Context) {
	var entrada Pedido
	if err := c.ShouldBindJSON(&entrada); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, store.Crear(entrada))
})

r.GET("/pedidos/:id", func(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "el 'id' debe ser numerico"})
		return
	}
	pedido, err := store.ObtenerPorID(id)
	if errors.Is(err, ErrPedidoNoEncontrado) {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, pedido)
})
```

**Concurrencia idiomatica** — worker pool con limite via semaforo de channel buffereado, usando `WaitGroup.Go` (metodo nativo desde Go 1.25, fuente `go.dev/doc/go1.25`, que reemplaza el trio manual `Add(1)`/`go func(){defer Done()}()` eliminando la clase de bug de conteo desincronizado):

```go
func ProcesarPedidosConcurrente(ctx context.Context, items []ItemPedido, maximoConcurrencia int) error {
	semaforo := make(chan struct{}, maximoConcurrencia)
	resultados := make(chan ResultadoItem, len(items))
	var wg sync.WaitGroup

	for _, item := range items {
		it := item
		wg.Go(func() { // Go 1.25+: reemplaza wg.Add(1) + go func(){defer wg.Done()}()
			semaforo <- struct{}{}
			defer func() { <-semaforo }()

			err := procesarItem(ctx, it)
			resultados <- ResultadoItem{ID: it.ID, Err: err}
		})
	}

	go func() { wg.Wait(); close(resultados) }()

	var errores []error
	for r := range resultados {
		if r.Err != nil {
			errores = append(errores, fmt.Errorf("item %d: %w", r.ID, r.Err))
		}
	}
	if len(errores) > 0 {
		return errors.Join(errores...) // stdlib desde Go 1.20
	}
	return nil
}
```

**Testing** — `testing` + `testify` (version del modulo `testify` no verificada contra fuente oficial en esta pasada; confirmar con `go list -m -versions github.com/stretchr/testify` antes de fijarla en `go.mod`):

```go
func TestPedidoStore_ObtenerPorID_ErrorSiNoExiste(t *testing.T) {
	store := NewPedidoStore()
	_, err := store.ObtenerPorID(999)
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrPedidoNoEncontrado)
}

func TestHandlerCrearPedido_Integracion(t *testing.T) {
	store := NewPedidoStore()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /pedidos", handlerCrearPedido(store))

	cuerpo, _ := json.Marshal(Pedido{Item: "silla", Precio: 120.0})
	req := httptest.NewRequest(http.MethodPost, "/pedidos", bytes.NewReader(cuerpo))
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusCreated, rec.Code)
}
```

**Estructura de proyecto** (patron de comunidad "Standard Go Project Layout" — no es una especificacion oficial de `go.dev`, declarado explicitamente como tal):

```
pedidos-api/
├── cmd/api/main.go       # solo wiring: config, DI, arranque
├── internal/pedido/      # internal/ impide import externo — enforcement del compilador
│   ├── handler.go
│   ├── service.go
│   ├── store.go
│   └── service_test.go
├── pkg/                  # solo si se publica codigo reusable por terceros
├── go.mod
└── go.sum
```

### Rust — Axum + Tokio

Version verificada: Rust 1.97.1 (fuente: `blog.rust-lang.org/2026/07/09/Rust-1.97.0`), edicion 2024 como default de `cargo new`. Axum 0.8.9 (fuente: `github.com/tokio-rs/axum/releases`). Axum 0.8 reemplazo la sintaxis de path params `:id`/`*rest` por `{id}`/`{*rest}` (fuente: `tokio.rs/blog/2025-01-01-announcing-axum-0-8-0`) — no usar la sintaxis de dos puntos en codigo nuevo.

```rust
// Cargo.toml: axum = "0.8", tokio = { version = "1", features = ["full"] },
// serde = { version = "1", features = ["derive"] }, serde_json = "1", uuid = { version = "1", features = ["v4", "serde"] }

use axum::{
    extract::{Path, State}, http::StatusCode, response::{IntoResponse, Response},
    routing::{get, post}, Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::{Arc, Mutex}};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
struct Pedido { id: Uuid, producto: String, cantidad: u32 }

#[derive(Deserialize)]
struct NuevoPedido { producto: String, cantidad: u32 }

type Db = Arc<Mutex<HashMap<Uuid, Pedido>>>;

// Error custom idiomatico: implementa IntoResponse, sin unwrap()/panic! en el camino feliz.
enum ApiError { NoEncontrado(Uuid), ValidacionInvalida(String), Interno(String) }

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, mensaje) = match self {
            ApiError::NoEncontrado(id) => (StatusCode::NOT_FOUND, format!("pedido {id} no encontrado")),
            ApiError::ValidacionInvalida(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::Interno(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };
        (status, Json(serde_json::json!({ "error": mensaje }))).into_response()
    }
}

async fn crear_pedido(
    State(db): State<Db>, Json(payload): Json<NuevoPedido>,
) -> Result<(StatusCode, Json<Pedido>), ApiError> {
    if payload.producto.trim().is_empty() || payload.cantidad == 0 {
        return Err(ApiError::ValidacionInvalida("producto y cantidad son obligatorios".into()));
    }
    let pedido = Pedido { id: Uuid::new_v4(), producto: payload.producto, cantidad: payload.cantidad };
    let mut guard = db.lock().map_err(|_| ApiError::Interno("lock envenenado".into()))?;
    guard.insert(pedido.id, pedido.clone());
    Ok((StatusCode::CREATED, Json(pedido)))
}

// Sintaxis {id} vigente en Axum 0.8.x — no ":id" (tokio.rs/blog/2025-01-01-announcing-axum-0-8-0).
async fn obtener_pedido(State(db): State<Db>, Path(id): Path<Uuid>) -> Result<Json<Pedido>, ApiError> {
    let guard = db.lock().map_err(|_| ApiError::Interno("lock envenenado".into()))?;
    guard.get(&id).cloned().map(Json).ok_or(ApiError::NoEncontrado(id))
}

fn app(db: Db) -> Router {
    Router::new()
        .route("/pedidos", post(crear_pedido))
        .route("/pedidos/{id}", get(obtener_pedido))
        .with_state(db)
}

#[tokio::main]
async fn main() {
    let db: Db = Arc::new(Mutex::new(HashMap::new()));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.expect("puerto 3000 ocupado");
    axum::serve(listener, app(db)).await.expect("servidor detenido");
}
```

**Concurrencia idiomatica** — `tokio::sync::Semaphore` para limitar tareas concurrentes reales. El permiso se adquiere **antes** de `tokio::spawn` (no dentro de la tarea) y se mueve con `async move` — invertir el orden anula el limite de concurrencia, porque entonces todas las tareas se spawnean sin limite y solo el trabajo interno espera (patron confirmado contra la doc-comment oficial de `docs.rs/tokio/latest/tokio/sync/struct.Semaphore.html`):

```rust
use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio::task::JoinError;

enum ProcesamientoError { Fallo(String), TareaAbortada(JoinError) }

impl From<JoinError> for ProcesamientoError {
    fn from(err: JoinError) -> Self { ProcesamientoError::TareaAbortada(err) }
}

async fn procesar_lote(ids: Vec<u32>) -> Result<Vec<u32>, ProcesamientoError> {
    let semaforo = Arc::new(Semaphore::new(4));
    let mut manejadores = Vec::with_capacity(ids.len());

    for id in ids {
        // acquire_owned() ANTES del spawn -- limita cuantas tareas corren a la vez, no solo su trabajo interno.
        let permiso = Arc::clone(&semaforo)
            .acquire_owned()
            .await
            .map_err(|_| ProcesamientoError::Fallo("semaforo cerrado".into()))?;

        manejadores.push(tokio::spawn(async move {
            let _permiso = permiso; // se dropea al terminar la tarea, liberando el slot
            procesar_pedido_externo(id).await
        }));
    }

    let mut resultados = Vec::with_capacity(manejadores.len());
    for manejador in manejadores {
        resultados.push(manejador.await?); // JoinError propagado con ?, luego el Result interno con ?
    }
    Ok(resultados)
}
```

**Testing** — `#[tokio::test]` para logica async y `tower::ServiceExt::oneshot` para tests de integracion del `Router` completo sin levantar un puerto TCP (patron confirmado en `tokio-rs/axum/tree/main/examples/testing`):

```rust
#[tokio::test]
async fn post_pedidos_devuelve_created_y_json_valido() {
    use tower::ServiceExt; // habilita .oneshot() sobre el Router

    let db: Db = Arc::new(Mutex::new(HashMap::new()));
    let router = app(db);

    let cuerpo = serde_json::json!({ "producto": "teclado", "cantidad": 2 }).to_string();
    let request = axum::http::Request::builder()
        .method("POST").uri("/pedidos").header("content-type", "application/json")
        .body(axum::body::Body::from(cuerpo)).unwrap();

    let response = router.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let cuerpo_json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(cuerpo_json["producto"], "teclado");
}
```

**Estructura de proyecto** (patron observado en los examples oficiales de `tokio-rs/axum`, no una convencion prescrita formalmente — declarado explicitamente):

```
pedidos-api/
├── src/
│   ├── main.rs        # arranque: config, Router, listener de tokio
│   ├── error.rs        # ApiError y su impl de IntoResponse
│   ├── routes/         # handlers por dominio
│   ├── models/         # structs de dominio + DTOs con serde
│   └── state.rs        # AppState compartido via State extractor
└── tests/
    └── pedidos_integration.rs   # tests via tower::ServiceExt::oneshot
```

### Java/JVM — Spring Boot

Version verificada: Spring Boot 4.1.0 (fuente: `spring.io/projects/spring-boot`), requiere Java 17 minimo y es compatible hasta Java 26 (cita textual de `docs.spring.io/spring-boot/system-requirements.html`). JDK 25 es la LTS mas reciente (GA 2025-09-16, soporte NFTC hasta 2028, fuente `oracle.com/java/technologies/java-se-support-roadmap.html`).

```java
@Entity
@Table(name = "pedidos")
public class Pedido {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @NotBlank(message = "el cliente es obligatorio")
    private String cliente;
    @Positive(message = "el monto debe ser mayor a cero")
    private BigDecimal monto;
    // getters/setters omitidos
}

public record PedidoRequest(
    @NotBlank(message = "el cliente es obligatorio") String cliente,
    @Positive(message = "el monto debe ser mayor a cero") BigDecimal monto
) {}

public interface PedidoRepository extends JpaRepository<Pedido, Long> {}

@Service
public class PedidoService {
    private final PedidoRepository repository;
    public PedidoService(PedidoRepository repository) { this.repository = repository; }

    public Pedido crear(PedidoRequest request) {
        Pedido pedido = new Pedido();
        pedido.setCliente(request.cliente());
        pedido.setMonto(request.monto());
        return repository.save(pedido);
    }

    public Pedido buscarPorId(Long id) {
        return repository.findById(id).orElseThrow(() -> new PedidoNoEncontradoException(id));
    }
}

public class PedidoNoEncontradoException extends RuntimeException {
    public PedidoNoEncontradoException(Long id) { super("pedido no encontrado: " + id); }
}

@RestController
@RequestMapping("/pedidos")
public class PedidoController {
    private final PedidoService service;
    public PedidoController(PedidoService service) { this.service = service; }

    @PostMapping
    public ResponseEntity<Pedido> crear(@Valid @RequestBody PedidoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.crear(request));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Pedido> obtener(@PathVariable Long id) {
        return ResponseEntity.ok(service.buscarPorId(id));
    }
}

// Contrato de error centralizado — mismo principio que la seccion "Contrato de error universal".
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidacion(MethodArgumentNotValidException ex) {
        String mensaje = ex.getBindingResult().getFieldErrors().stream()
            .map(FieldError::getDefaultMessage).collect(Collectors.joining(", "));
        return ResponseEntity.badRequest().body(new ErrorResponse(mensaje, 400, Instant.now()));
    }

    @ExceptionHandler(PedidoNoEncontradoException.class)
    public ResponseEntity<ErrorResponse> handleNoEncontrado(PedidoNoEncontradoException ex) {
        return ResponseEntity.status(404).body(new ErrorResponse(ex.getMessage(), 404, Instant.now()));
    }
}

public record ErrorResponse(String mensaje, int status, Instant timestamp) {}
```

**Concurrencia idiomatica** — virtual threads (Project Loom, estables desde JDK 21, JEP 444) para IO-bound concurrency, con manejo explicito de `ExecutionException`/`InterruptedException` en vez de un catch generico:

```java
@Service
public class NotificacionExternaService {
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private final RestClient clienteA, clienteB;

    public ResultadoNotificacion notificarEnParalelo(Long pedidoId) {
        CompletableFuture<String> respuestaA = CompletableFuture.supplyAsync(() -> clienteA.notificar(pedidoId), executor);
        CompletableFuture<String> respuestaB = CompletableFuture.supplyAsync(() -> clienteB.notificar(pedidoId), executor);

        try {
            CompletableFuture.allOf(respuestaA, respuestaB).join();
            return new ResultadoNotificacion(respuestaA.get(), respuestaB.get());
        } catch (CompletionException | ExecutionException ex) {
            Throwable causa = ex.getCause() != null ? ex.getCause() : ex;
            throw new NotificacionFallidaException("fallo al notificar pedido " + pedidoId, causa);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt(); // restaura el flag de interrupcion, nunca se ignora
            throw new NotificacionFallidaException("notificacion interrumpida para pedido " + pedidoId, ex);
        }
    }
}
```

**Testing** — JUnit 5 + Mockito para el `@Service`, `@WebMvcTest` + `MockMvc` para el controller. **`@MockBean` fue removido en Spring Boot 4.0** (deprecado en 3.4, remocion efectiva en 4.0 — fuente: `github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide`); usar `@MockitoBean` (`org.springframework.test.context.bean.override.mockito.MockitoBean`, fuente `docs.spring.io/spring-framework/reference/testing/annotations/integration-spring/annotation-mockitobean.html`):

```java
@ExtendWith(MockitoExtension.class)
class PedidoServiceTest {
    @Mock private PedidoRepository repository;
    @InjectMocks private PedidoService service;

    @Test
    void deberiaCrearPedidoCorrectamente() {
        PedidoRequest request = new PedidoRequest("cliente-1", new BigDecimal("100.00"));
        Pedido guardado = new Pedido();
        guardado.setId(1L);
        when(repository.save(any(Pedido.class))).thenReturn(guardado);

        assertThat(service.crear(request).getId()).isEqualTo(1L);
    }

    @Test
    void deberiaLanzarExcepcionSiPedidoNoExiste() {
        when(repository.findById(99L)).thenReturn(Optional.empty());
        assertThrows(PedidoNoEncontradoException.class, () -> service.buscarPorId(99L));
    }
}

@WebMvcTest(PedidoController.class)
class PedidoControllerTest {
    @Autowired private MockMvc mockMvc;

    @MockitoBean // no @MockBean -- removido en Spring Boot 4.0
    private PedidoService service;

    @Test
    void deberiaRetornar404SiPedidoNoExiste() throws Exception {
        when(service.buscarPorId(99L)).thenThrow(new PedidoNoEncontradoException(99L));
        mockMvc.perform(get("/pedidos/99")).andExpect(status().isNotFound());
    }
}
```

**Estructura de paquetes**: por capa (`controller/`, `service/`, `repository/`, `dto/`) para proyectos pequenos; por feature (`pedido/PedidoController.java`, `pedido/PedidoService.java` en el mismo paquete) para monolitos modulares con multiples equipos — ninguna de las dos esta prescrita por Spring, es criterio de diseno segun escala del equipo.

---

## Modulo — Backend en .NET, PHP y Ruby: Codigo Real por Lenguaje

### Principio fundamental

Continuacion del modulo de Go/Rust/Java: cierra la brecha de cobertura para los 3 lenguajes de backend restantes con mayor uso empresarial real. Mismo criterio: codigo verificado contra fuente oficial de cada framework, no interpolado desde el ejemplo de JS/TS.

### .NET/C# — ASP.NET Core Minimal APIs

Version verificada: .NET 10 es la LTS vigente (soportada hasta noviembre 2028, fuente `learn.microsoft.com/dotnet/core/releases-and-support`), lanzada junto con ASP.NET Core 10 el 22 de abril de 2026. `builder.Services.AddValidation()` agrega validacion nativa con DataAnnotations en Minimal APIs (reemplaza FluentValidation para casos simples), confirmado contra `learn.microsoft.com/aspnet/core/fundamentals/minimal-apis`.

```csharp
// Program.cs — ASP.NET Core 10, Minimal APIs, EF Core, validacion nativa y ProblemDetails
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<PedidosDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("PedidosDb")));

// Validacion nativa de Minimal APIs (ASP.NET Core 10) — reemplaza FluentValidation
// para casos simples de DataAnnotations.
builder.Services.AddValidation();
builder.Services.AddProblemDetails();

var app = builder.Build();
app.UseExceptionHandler();

app.MapPost("/pedidos", async (
    CrearPedidoRequest request, PedidosDbContext db, CancellationToken cancellationToken) =>
{
    var pedido = new Pedido { ClienteId = request.ClienteId, Total = request.Total, CreadoEn = DateTimeOffset.UtcNow };
    db.Pedidos.Add(pedido);
    await db.SaveChangesAsync(cancellationToken);
    return TypedResults.Created($"/pedidos/{pedido.Id}", PedidoResponse.DesdeEntidad(pedido));
});

app.MapGet("/pedidos/{id:guid}", async Task<Results<Ok<PedidoResponse>, ProblemHttpResult>> (
    Guid id, PedidosDbContext db, CancellationToken cancellationToken) =>
{
    var pedido = await db.Pedidos.FindAsync([id], cancellationToken);
    if (pedido is null)
    {
        return TypedResults.Problem(
            title: "Pedido no encontrado", detail: $"No existe un pedido con id {id}.",
            statusCode: StatusCodes.Status404NotFound, type: "https://errores.dominio/pedido-no-encontrado");
    }
    return TypedResults.Ok(PedidoResponse.DesdeEntidad(pedido));
});

app.Run();

// Contrato de request con validacion DataAnnotations — soporte para records confirmado en ASP.NET Core 10.
public record CrearPedidoRequest(
    [property: Required(ErrorMessage = "ClienteId es obligatorio")] Guid ClienteId,
    [property: Range(0.01, double.MaxValue, ErrorMessage = "Total debe ser mayor a 0")] decimal Total
);

public record PedidoResponse(Guid Id, Guid ClienteId, decimal Total, DateTimeOffset CreadoEn)
{
    public static PedidoResponse DesdeEntidad(Pedido pedido) => new(pedido.Id, pedido.ClienteId, pedido.Total, pedido.CreadoEn);
}

public class Pedido
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClienteId { get; set; }
    public decimal Total { get; set; }
    public DateTimeOffset CreadoEn { get; set; }
}

public class PedidosDbContext(DbContextOptions<PedidosDbContext> options) : DbContext(options)
{
    public DbSet<Pedido> Pedidos => Set<Pedido>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Pedido>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Total).HasPrecision(18, 2);
        });
    }
}
```

Nota de vigencia: `TypedResults.ServerSentEvents` (SSE nativo en Minimal APIs) es una capacidad real de .NET 10 ampliamente reportada, pero la URL puntual de esta verificacion no contenia esa seccion especifica — confirmar contra la subpagina oficial exacta antes de citarla como "confirmado" en documentacion de cara al cliente.

**Concurrencia idiomatica** — `async`/`await` con `SemaphoreSlim` + `Task.WhenAll` para limitar llamadas concurrentes a servicios externos (patron de lenguaje estable, no especifico de .NET 10):

```csharp
public class ConsultaProveedoresService(IHttpClientFactory httpClientFactory, ILogger<ConsultaProveedoresService> logger)
{
    private const int MaxLlamadasConcurrentes = 4;

    public async Task<IReadOnlyList<CotizacionProveedor>> ConsultarCotizacionesAsync(
        IReadOnlyList<string> proveedorIds, CancellationToken cancellationToken)
    {
        using var limitador = new SemaphoreSlim(MaxLlamadasConcurrentes);
        var tareas = proveedorIds.Select(async proveedorId =>
        {
            await limitador.WaitAsync(cancellationToken);
            try { return await ConsultarUnProveedorAsync(proveedorId, cancellationToken); }
            finally { limitador.Release(); }
        });

        var respuestas = await Task.WhenAll(tareas);
        return respuestas.Where(r => r is not null).ToList()!;
    }

    private async Task<CotizacionProveedor?> ConsultarUnProveedorAsync(string proveedorId, CancellationToken cancellationToken)
    {
        var cliente = httpClientFactory.CreateClient("proveedores");
        try
        {
            return await cliente.GetFromJsonAsync<CotizacionProveedor>($"/cotizaciones/{proveedorId}", cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Fallo de red consultando proveedor {ProveedorId}", proveedorId);
            return null;
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogError(ex, "Timeout consultando proveedor {ProveedorId}", proveedorId); // distinto de cancelacion explicita del caller
            return null;
        }
    }
}

public record CotizacionProveedor(string ProveedorId, decimal Precio, TimeSpan TiempoEntrega);
```

**Testing** — xUnit para unitario, `WebApplicationFactory<Program>` (paquete `Microsoft.AspNetCore.Mvc.Testing`) para integracion, confirmado vigente hasta ASP.NET Core 11:

```csharp
public class PedidosEndpointsTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory = factory.WithWebHostBuilder(builder =>
    {
        builder.ConfigureServices(services =>
        {
            var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<PedidosDbContext>));
            if (descriptor is not null) services.Remove(descriptor);
            services.AddDbContext<PedidosDbContext>(options => options.UseInMemoryDatabase("PedidosTestDb"));
        });
    });

    [Fact]
    public async Task PostPedidos_RetornaCreated_CuandoRequestEsValido()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/pedidos", new CrearPedidoRequest(Guid.NewGuid(), 250.00m));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task GetPedidoPorId_RetornaNotFound_CuandoNoExiste()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/pedidos/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
```

**Estructura de proyecto**: separacion por proyecto (`.Api`, `.Domain`, `.Infrastructure`) dentro de una solucion, con `tests/` propio para unitarios e integracion — patron confirmado en `learn.microsoft.com/aspnet/core/test/integration-tests`, requiere que `Program.cs` sea accesible desde el proyecto de tests.

### PHP — Laravel

Version verificada: PHP 8.4.24 en mantenimiento activo (fuente `php.net/releases`, no contrastada con segunda fuente por agotamiento de cupo de busqueda en esa sesion — reverificar antes de fijarla como referencia permanente). Laravel 13.x, PHP minimo 8.3 (cita textual de `laravel.com/docs/13.x/releases`). Cambio estructural real: **`routes/api.php` ya no existe por defecto desde Laravel 11** — se crea con `php artisan install:api` (que tambien instala Sanctum), y el manejo de excepciones se centraliza en `bootstrap/app.php` via `->withExceptions()`, no en `app/Exceptions/Handler.php` (patron pre-Laravel-11).

```php
// routes/api.php (requiere "php artisan install:api" primero)
Route::post('/pedidos', [PedidoController::class, 'store']);
Route::get('/pedidos/{pedido}', [PedidoController::class, 'show']);

// app/Http/Requests/StorePedidoRequest.php
class StorePedidoRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'cliente_id' => ['required', 'integer', 'exists:users,id'],
            'total' => ['required', 'numeric', 'min:0.01'],
        ];
    }

    protected function failedValidation(Validator $validator): void
    {
        throw new HttpResponseException(response()->json([
            'message' => 'Los datos enviados no son validos.',
            'errors' => $validator->errors(),
        ], 422));
    }
}

// app/Exceptions/PedidoNoEncontradoException.php
class PedidoNoEncontradoException extends Exception
{
    public function __construct(public readonly int $pedidoId) { parent::__construct("Pedido {$pedidoId} no encontrado."); }
}

// app/Http/Controllers/PedidoController.php
class PedidoController extends Controller
{
    public function store(StorePedidoRequest $request): JsonResponse
    {
        $pedido = Pedido::create($request->validated());
        return response()->json($pedido, 201);
    }

    public function show(int $id): JsonResponse
    {
        $pedido = Pedido::find($id);
        if (! $pedido) throw new PedidoNoEncontradoException($id);
        return response()->json($pedido);
    }
}

// bootstrap/app.php — contrato de error centralizado, patron real Laravel 11+/13.x.
// NO existe app/Exceptions/Handler.php en proyectos nuevos.
return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(web: __DIR__.'/../routes/web.php', api: __DIR__.'/../routes/api.php', commands: __DIR__.'/../routes/console.php', health: '/up')
    ->withMiddleware(function (Middleware $middleware) {})
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (PedidoNoEncontradoException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['error' => ['codigo' => 'PEDIDO_NO_ENCONTRADO', 'mensaje' => $e->getMessage()]], 404);
            }
        });
    })->create();
```

**Concurrencia idiomatica** — PHP es sincrono por request (sin threads nativos); el patron real para trabajo pesado en background es **Laravel Queues** (jobs asincronos), y para mantener la app en memoria entre requests, **Laravel Octane** (FrankenPHP/Swoole/RoadRunner) sobre un event loop:

```php
// app/Jobs/ProcesarPedidoJob.php
class ProcesarPedidoJob implements ShouldQueue
{
    use Queueable;
    public function __construct(public Pedido $pedido) {}

    public function handle(): void
    {
        $this->pedido->update(['estado' => 'procesado']);
    }
}

// Despacho desde el controller — el endpoint responde sin esperar el procesamiento:
ProcesarPedidoJob::dispatch($pedido)->onQueue('pedidos')->delay(now()->addMinutes(1));

// php artisan queue:work --tries=3 --timeout=30   (worker en proceso separado, paralelismo real de infra)
```

`Octane::concurrently()` (tareas concurrentes dentro de un mismo request) **requiere especificamente Swoole u Open Swoole** — no funciona con FrankenPHP ni RoadRunner, confirmado textualmente contra `laravel.com/docs/13.x/octane` ("This feature requires Swoole"). Advertencia de la doc oficial: con Octane la app se mantiene en memoria entre requests, asi que inyectar el contenedor o el `Request` en constructores de singletons produce fugas de memoria y estado corrompido entre requests distintos.

**Testing** — PHPUnit con `RefreshDatabase` (ejecuta cada test en una transaccion, no remigra si el esquema ya esta al dia — cita textual de `laravel.com/docs/13.x/database-testing`):

```php
// tests/Feature/PedidoApiTest.php
class PedidoApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_usuario_autenticado_puede_crear_un_pedido(): void
    {
        $user = User::factory()->create();
        $response = $this->actingAs($user)->postJson('/api/pedidos', ['cliente_id' => $user->id, 'total' => 250.50]);
        $response->assertStatus(201)->assertJsonFragment(['total' => '250.50']);
        $this->assertDatabaseHas('pedidos', ['cliente_id' => $user->id, 'total' => 250.50]);
    }

    public function test_devuelve_404_si_el_pedido_no_existe(): void
    {
        $user = User::factory()->create();
        $response = $this->actingAs($user)->getJson('/api/pedidos/9999');
        $response->assertStatus(404)->assertJsonPath('error.codigo', 'PEDIDO_NO_ENCONTRADO');
    }
}
```

**Estructura de proyecto** (verificada contra `laravel.com/docs/13.x/structure`, no interpolada — varios subdirectorios de `app/` no existen por defecto, se crean bajo demanda con Artisan):

```
app/
  Http/Controllers/, Http/Requests/    # Form Requests
  Models/                              # Eloquent models
  Jobs/                                # no existe por defecto, "php artisan make:job"
  Exceptions/                          # excepciones custom, "php artisan make:exception"
bootstrap/app.php                      # incluye ->withExceptions()
routes/
  api.php                              # opcional, "php artisan install:api" lo crea
tests/
  Feature/  Unit/
```

### Ruby — Ruby on Rails (modo API)

Version verificada: Ruby 4.0.6 es la version estable actual (`ruby-lang.org/en/downloads`), coexistiendo en mantenimiento activo con 3.4.10 y 3.3.12 — patron normal de Ruby de soportar varias series en paralelo. Rails 8.1 (build v8.1.3.1, cita textual de `guides.rubyonrails.org`). Desde Rails 8.0, **Solid Queue** (backend por base de datos, sin Redis) es el adapter por defecto de ActiveJob.

```ruby
# Generado con: rails new pedidos_api --api --database=postgresql
# El flag --api hace que ApplicationController herede de ActionController::API,
# omite vistas/helpers/assets y reduce el stack de middleware.

# app/controllers/application_controller.rb
class ApplicationController < ActionController::API
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, with: :render_unprocessable_entity

  private

  def render_not_found(exception)
    render json: { error: { code: "not_found", message: exception.message } }, status: :not_found
  end

  def render_unprocessable_entity(exception)
    render json: { error: { code: "unprocessable_entity", message: exception.record.errors.full_messages } }, status: :unprocessable_entity
  end
end

# app/models/pedido.rb
class Pedido < ApplicationRecord
  validates :cliente_nombre, presence: true
  validates :total, numericality: { greater_than: 0 }
end

# app/controllers/pedidos_controller.rb
class PedidosController < ApplicationController
  def create
    pedido = Pedido.new(pedido_params)
    pedido.save!
    render json: pedido, status: :created
  end

  def show
    render json: Pedido.find(params[:id]), status: :ok
  end

  private

  # params.expect confirmado como el patron actual de strong parameters en Rails 8.x
  def pedido_params
    params.expect(pedido: [:cliente_nombre, :total])
  end
end

# config/routes.rb
Rails.application.routes.draw do
  resources :pedidos, only: [:create, :show]
end
```

**Concurrencia idiomatica** — Puma (servidor por defecto) es threaded: cada request corre en su propio thread con su propia instancia de controller, compartiendo el espacio de proceso (confirmado contra `guides.rubyonrails.org/threading_and_code_execution.html`). Para trabajo pesado, el patron idiomatico es delegar a **ActiveJob**, no bloquear el request thread:

```ruby
# app/jobs/procesar_pedido_job.rb
class ProcesarPedidoJob < ApplicationJob
  queue_as :default
  retry_on ActiveRecord::Deadlocked, wait: 5.seconds, attempts: 3

  def perform(pedido_id)
    pedido = Pedido.find(pedido_id)
    pedido.update!(estado: "confirmado")
  end
end

# Uso desde el controller -- responde de inmediato, sin esperar el procesamiento:
ProcesarPedidoJob.perform_later(pedido.id)
```

Nota de vigencia: Ractor (paralelismo sin GVL compartido) no se verifico contra `ruby-lang.org` en esta pasada — la guia oficial de threading de Rails es agnostica a ese nivel de concurrencia de Ruby. No usar Ractor como recomendacion sin verificacion adicional; el patron dominante confirmado en Rails es Puma (I/O via threads) + ActiveJob (paralelismo de trabajo pesado via workers separados).

**Testing** — **Minitest es el framework oficial por defecto** (cita textual: "the default testing library used by Rails" de `guides.rubyonrails.org/testing.html`, la guia no menciona RSpec en ningun punto — su popularidad en la comunidad es conocimiento general, no verificado contra esta fuente):

```ruby
# test/integration/pedidos_api_test.rb (Minitest, ActionDispatch::IntegrationTest)
class PedidosApiTest < ActionDispatch::IntegrationTest
  test "POST /pedidos crea un pedido y responde 201" do
    post "/pedidos", params: { pedido: { cliente_nombre: "Ana", total: 100.50 } }
    assert_response :created
    body = JSON.parse(response.body)
    assert_equal "Ana", body["cliente_nombre"]
  end

  test "GET /pedidos/:id responde 404 si no existe" do
    get "/pedidos/999999"
    assert_response :not_found
  end
end
```

Equivalente en RSpec (patron de comunidad ampliamente adoptado, requiere la gema `rspec-rails`, no documentado en la guia oficial):

```ruby
RSpec.describe "POST /pedidos", type: :request do
  it "crea un pedido y responde 201" do
    post "/pedidos", params: { pedido: { cliente_nombre: "Ana", total: 100.50 } }
    expect(response).to have_http_status(:created)
  end
end
```

**Estructura de proyecto** generada por `rails new pedidos_api --api` (sin `app/views`, `app/helpers`, `app/assets` propios de una app web tradicional):

```
app/
  controllers/  jobs/  models/
config/
  queue.yml          # config de Solid Queue (Rails 8.0+)
test/                # Minitest por defecto
  integration/  models/
spec/                # solo si se agrega rspec-rails, no default
```

---

## Modulo — Vanguardia Backend: Contratos, Eventos y Tiempo Real

### Principio fundamental

Un backend que funciona pero se ve como el scaffold de un tutorial no cumple el objetivo. El listón es un sistema donde el contrato de API, el modelo de eventos y la estrategia de tiempo real fueron decididos deliberadamente para el dominio del proyecto — no los defaults de un generador CRUD. Si no se puede declarar en una frase por que este endpoint, este evento o esta conexion en tiempo real existen en la forma en que existen, no esta listo.

### Identidad de contrato — declarar antes de codear

Ningun endpoint, evento o canal en tiempo real se codea sin declarar primero:

```
IDENTIDAD DE CONTRATO:
  Consistencia: [fuerte/transaccional | eventual con reconciliacion | eventual sin reconciliacion — solo lectura best-effort]
  Forma del contrato: [REST con recursos anidados | REST plano con filtros | RPC/comandos explicitos | GraphQL federado]
  Topologia de eventos: [un productor, muchos consumidores desacoplados | saga coreografiada entre servicios pares | orquestador central con estado] 
  Canal en tiempo real: [SSE unidireccional de progreso | WebSocket bidireccional con estado de sesion | polling como fallback declarado, no como default]
  Referencia de dominio: [una sola linea — ej. "checkout de e-commerce con inventario reservado, no confirmado, hasta el pago"]
```

Si el proyecto anfitrion ya tiene convenciones de nomenclatura o estructura de error documentadas, la identidad de contrato es su extension — mismo vocabulario de dominio, mismo modelo de consistencia, no un sistema paralelo.

### Prohibido — patrones reconocibles de demo/plantilla

- CRUD genérico de `usuarios`/`productos`/`items` como unico ejemplo de arquitectura, sin adaptar nombres ni reglas al dominio real del proyecto.
- Cola de mensajes o Kafka introducidos porque "es lo que se usa en 2026", sin un caso real de desacoplamiento o de mas de un consumidor del mismo evento.
- Outbox declarado en la documentacion pero sin poller o proceso CDC real que lo drene — un `outbox_eventos` que nadie lee es peor que no tener el patron.
- WebSocket usado para un caso que es unidireccional servidor-a-cliente (notificaciones, progreso) cuando SSE ya resuelve el caso con menos complejidad de infraestructura.
- Endpoint de escritura irreversible (pago, envio, creacion con efecto externo) sin `Idempotency-Key` "porque en desarrollo nunca se duplica la request".
- Nombre de evento generico sin version ni dominio (`"update"`, `"event1"`, `"data_changed"`) en vez de un nombre calificado por dominio y version (`pedido.confirmado.v1`).

### Gate de calidad medible — no solo diseño limpio

Un contrato que no cumple estos umbrales se rechaza, sin importar que tan prolija sea la capa de servicio:

| Metrica | Umbral | Verificacion |
|---|---|---|
| Latencia p95 de endpoint bajo carga | < 300ms en el recurso mas consultado del dominio | Herramienta de carga (k6, autocannon) contra staging, no contra localhost sin trafico concurrente |
| Lag de consumidor de eventos | < 5s entre publicacion y procesamiento en el consumidor mas lento, bajo volumen esperado de produccion | Metrica de lag nativa del broker (`kafka-consumer-groups.sh --describe` o el panel equivalente de SQS/RabbitMQ) |
| Duplicados efectivos tras reintento de red | 0 — ninguna operacion de escritura irreversible se ejecuta dos veces ante el mismo `Idempotency-Key` | Test de integracion que reenvia la misma request N veces y verifica una sola fila resultante en BD |
| Reconexion de WebSocket tras caida | Estado de cliente resincronizado en < 1 request adicional tras reconectar, sin perdida de eventos emitidos durante la desconexion | Test que simula corte de socket y verifica que el cliente recibe el backlog perdido o un snapshot de reconciliacion |
| Cobertura de rutas de error en el contrato | 100% de los codigos de estado documentados en el contrato tienen al menos un test que los provoca | Comparar la tabla de codigos de estado del endpoint contra los tests de integracion existentes |

### Vigencia — estandar mas reciente del dominio

Verificar contra fuente oficial antes de escribir cualquier version o estado de especificacion en el contrato o la documentacion del proyecto — nunca asumir por analogia con una version anterior.

- **AsyncAPI** (especificacion para documentar contratos de eventos, equivalente a OpenAPI para mensajeria asincrona): version vigente **3.1.0**, verificado contra `asyncapi.com/docs/reference/specification/v3.1.0` en esta tarea. La version 3.0 (noviembre 2023) separo `operations` de `channels` respecto a la serie 2.x — no asumir que la sintaxis 2.x sigue siendo la forma recomendada.
- **Idempotency-Key como header HTTP estandarizado**: a la fecha de verificacion en esta tarea sigue siendo un **Internet-Draft del IETF** (`draft-ietf-httpapi-idempotency-key-header`, grupo de trabajo HTTPAPI, revision 07), **no un RFC publicado**. El patron de implementacion de este skill (tabla `idempotency_keys` propia) sigue siendo valido independientemente del estado del draft, pero no describir el header como "estandar RFC" en documentacion de cara al cliente hasta que el draft se publique como tal.
- Cualquier version de Kafka, RabbitMQ, motor de BD o SDK de cliente mencionada fuera de esta seccion en el resto del skill que no haya sido verificada en esta misma tarea: orientativo, verificar antes de uso contra la documentacion oficial del proveedor correspondiente.
