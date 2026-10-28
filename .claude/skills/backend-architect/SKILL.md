---
name: backend-architect
description: Backend Architect Universal. Experto en SOLID, Clean Architecture, gestion de persistencia, arquitectura event-driven (Kafka/RabbitMQ/SQS, patron Outbox, DLQ), WebSockets/Server-Sent Events y scaffolding de proyectos desde cero. Con codigo real verificado en Node.js/TypeScript, Python, Go (net/http y Gin), Rust (Axum), Java/JVM (Spring Boot), .NET (ASP.NET Core), PHP (Laravel) y Ruby (Rails) ademas de las convenciones agnosticas de stack. Deduce el ORM, lenguaje y base de datos del repositorio anfitrion antes de emitir recomendaciones. Activa al disenar APIs, modelar esquemas, escribir migraciones, revisar queries, implementar mensajeria asincrona o tiempo real, o arrancar un servidor nuevo de cero.
metadata:
  origin: ai-core
  version: 1.7.2
  last_updated: 2026-10-18
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

- La tarea es un cambio de UI/UX, routing del cliente o estado del frontend — usar `frontend-design`.
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

## Referencias bajo demanda

Contenido expansivo movido a `references/` (divulgacion progresiva) para mantener este SKILL.md nucleo liviano. Cargar el archivo correspondiente cuando la tarea lo requiera:

- `references/backend-api-rest.md` — Convenciones de API REST.
- `references/backend-eventos-tiempo-real.md` — Arquitectura event-driven, mensajeria, WebSockets y SSE.
- `references/backend-vectorial.md` — Persistencia vectorial.
- `references/backend-scaffolding.md` — Scaffolding de proyecto nuevo.

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

## Seguridad en la Capa de Servidor

- Validar toda entrada en el limite del controlador antes de llegar al repositorio.
- Los secretos (credenciales de BD, claves de API) solo se leen desde variables de entorno. Nunca se pasan como argumentos de funcion ni se registran en logs.
- Los tokens de sesion o JWT no se almacenan en la base de datos en texto plano.
- Las rutas que requieren autenticacion verifican el token antes de ejecutar cualquier logica de negocio.
- El principio de minimo privilegio aplica a las credenciales de base de datos: el usuario de la aplicacion no tiene permisos DDL en produccion.

## Lista de Verificacion de Revision de Codigo Backend

Verificar en orden antes de aprobar un PR. Un PR con observacion en cualquier punto no se aprueba.

1. Correctitud: el endpoint devuelve los datos y codigos de estado correctos en todos sus casos (exito, validacion, no encontrado, error interno).
2. Seguridad: no hay inyeccion de consultas posible, no se exponen datos sensibles, la autorizacion esta verificada antes de la logica.
2b. Contrato publico: version explicita en el endpoint, `POST` con efecto irreversible acepta `Idempotency-Key`, listados de alto volumen usan paginacion cursor-based.
3. Migracion: si hay cambio de esquema, el metodo de reversion es correcto, la migracion es atomica y esta separada de la migracion de datos.
4. Rendimiento: no hay N+1, los indices necesarios existen, las transacciones estan bien delimitadas.
5. Consistencia: nomenclatura, estructura de error y convenios del proyecto anfitrion respetados.
6. Precision: cada hallazgo cita la ruta relativa del archivo y el numero de linea exacto. Sin esta referencia, el hallazgo no es accionable.
7. Contratos/eventos/tiempo real: si el cambio toca un endpoint con efecto irreversible, un consumidor de eventos, o un canal WebSocket/SSE, aplicar ademas el "Gate de calidad medible" de la seccion "Vanguardia Backend: Contratos, Eventos y Tiempo Real" (umbrales de latencia p95, lag de consumidor, duplicados de idempotencia, reconexion de WebSocket, cobertura de codigos de error) -- no aprobar el PR solo con los puntos 1-6 si el cambio cae en ese alcance (gap de scaffolding cerrado 2026-08-15: el gate vivia solo al final del archivo sin referencia desde esta checklist).

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables.
- Leer los manifiestos del anfitrion antes de recomendar ORM o query builder.
- En modo scaffolding, declarar el stack antes de emitir cualquier codigo.
- Confirmar explicitamente con el usuario antes de registrar hallazgos en `memory/` o `EVENTS_QUEUE.json` (fuente de estado de sesion desde v3.9, reemplaza a `BACKLOG.md`).
- Incluir los tests unitarios correspondientes en todo modulo nuevo entregado.
- Documentar la justificacion antes de aprobar un PR que reduzca cobertura.

---

## Modulos de Referencia (Codigo Real por Lenguaje y Vanguardia)

Contenido expansivo movido a `references/` (divulgacion progresiva, agentskills.io) para mantener este SKILL.md nucleo por debajo del limite recomendado. Cargar el archivo correspondiente cuando la tarea lo requiera:

- `references/backend-go-rust-java.md` — Codigo real por lenguaje: Go, Rust, Java/JVM.
- `references/backend-dotnet-php-ruby.md` — Codigo real por lenguaje: .NET, PHP, Ruby.
- `references/backend-vanguardia-contratos.md` — Contratos de API, modelo de eventos y estrategia de tiempo real deliberados (no defaults de generador CRUD).
- `references/backend-testing.md` — Modulo de testing backend: piramide de tests, herramientas por stack, unitarios e integracion, estrategia de datos, nomenclatura y cobertura minima.
