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
