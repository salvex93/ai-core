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
| SSE (Server-Sent Events) | Servidor → cliente unicamente | Notificaciones, feeds de progreso, streaming de texto (LLM). Mas simple que WebSocket, reconexion automatica nativa del navegador via `EventSource` (confirmado 2026-09-15 contra `developer.mozilla.org/docs/Web/API/Server-sent_events`). Limitacion real bajo HTTP/1.1: el navegador limita 6-8 conexiones concurrentes por dominio, y cada `EventSource` abierto cuenta contra ese limite — si la pagina abre varias pestañas o multiples streams SSE al mismo dominio puede agotarlo; HTTP/2 elimina esta limitacion al multiplexar streams sobre una sola conexion. |
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
