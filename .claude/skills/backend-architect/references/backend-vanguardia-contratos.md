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
- **Tiempo real (WebSocket/SSE):** reverificado 2026-09-15 contra `developer.mozilla.org/docs/Web/API/Server-sent_events` — la reconexion automatica nativa de `EventSource` sigue vigente sin cambio. El patron de escalado horizontal via Redis Pub/Sub es arquitectonico (no atado a una version de producto especifica) y sigue siendo la solucion estandar de la industria para coordinar instancias stateful de WebSocket; no requiere reverificacion periodica salvo que cambie el mecanismo de pub/sub elegido en un proyecto especifico (Redis, NATS, Kafka).
