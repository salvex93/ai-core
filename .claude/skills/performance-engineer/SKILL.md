---
name: performance-engineer
description: Especialista en performance de aplicacion bajo carga real. Cubre estrategia de cache (in-memory vs Redis), distribucion de assets estaticos via CDN, y pruebas de carga que simulan usuarios concurrentes antes de que lleguen en produccion. Diferenciado de database-ops (pooling de conexiones e indices de BD) y devops-infra (observabilidad e infraestructura). Agnostico al framework y proveedor. Activa al disenar una capa de cache, evaluar si un recurso necesita CDN, definir o ejecutar pruebas de carga, o diagnosticar degradacion bajo trafico concurrente.
origin: ai-core
version: 1.0.0
last_updated: 2026-07-22
rol: architect
---

# Performance Engineer — Cache, CDN y Pruebas de Carga

Responsabilidad unica: que la aplicacion responda rapido y no se caiga cuando el trafico sube. No gestiona pooling de conexiones ni indices de base de datos (eso es `database-ops`), ni observabilidad de infraestructura o Kubernetes (eso es `devops-infra`). Este perfil decide que se cachea, que se sirve desde un CDN, y verifica con datos — no con intuicion — que el sistema soporta la carga esperada antes de que la sufran usuarios reales.

## Cuando Activar Este Perfil

- Al detectar que un endpoint o pagina repite la misma consulta costosa en cada request.
- Al disenar la estrategia de cache de una aplicacion nueva (que se cachea, con que TTL, como se invalida).
- Al evaluar si assets estaticos (imagenes, JS, CSS, fuentes) deberian servirse desde CDN en vez de saturar el servidor de origen.
- Al necesitar simular multiples usuarios concurrentes antes de un lanzamiento, campana o pico de trafico esperado.
- Al diagnosticar degradacion de latencia bajo carga (timeouts, colas, errores 5xx que solo aparecen con trafico real).
- Al revisar si el codigo actual escala horizontalmente sin estado compartido en memoria de proceso.

## Cuando NO Activar Este Perfil

- La tarea es connection pooling, indices, vacuum o migraciones de base de datos — usar `database-ops`.
- La tarea es observabilidad de infraestructura, Kubernetes, IaC o costos de nube — usar `devops-infra`.
- La tarea es definir la estrategia general de testing o cobertura de tests unitarios/integracion — usar `qa-engineer`; este perfil solo cubre pruebas de carga/performance, no la piramide de testing completa.
- La aplicacion es un prototipo local sin trafico real ni fecha de lanzamiento — la inversion en cache/CDN/carga es prematura.

## Primera Accion al Activar

Inferir el stack del repositorio anfitrion antes de emitir recomendaciones:

```bash
# Detectar si ya existe alguna capa de cache o cliente Redis
grep -r "redis\|ioredis\|node-cache\|memcached" package.json 2>/dev/null | head -5
# Detectar configuracion de CDN o assets estaticos
grep -r "cloudflare\|cloudfront\|CDN_URL\|ASSETS_URL" .env.example .env 2>/dev/null | head -3
# Detectar si ya hay algun script o config de pruebas de carga
grep -r "autocannon\|k6\|artillery" package.json 2>/dev/null | head -3
```

Si no hay señal de ninguno de los tres, tratarlos como brechas a evaluar, no como ausencias a resolver de inmediato — priorizar segun el riesgo real declarado por el usuario (fecha de lanzamiento, trafico esperado, incidentes previos).

## Capa de Cache

### Decision: in-memory vs Redis

| Escenario | Opcion | Razon |
|---|---|---|
| Proceso unico (single-instance), datos no criticos si se pierden en restart | `node-cache` (in-memory, cero dependencias) | Sin infraestructura adicional, latencia minima, suficiente para el volumen de un proyecto pequeño o mediano |
| Multiples instancias/procesos que deben compartir el mismo cache | Redis | El cache in-memory no se comparte entre procesos — cada instancia tendria su propia copia desincronizada |
| Necesidad de persistencia del cache entre reinicios del proceso | Redis (con `appendonly` o RDB) | El cache in-memory se pierde en cada restart del proceso |
| Necesidad de invalidacion cross-servicio (ej: microservicios) | Redis pub/sub o streams | Un cache in-memory no puede notificar a otros procesos que un dato cambio |

No introducir Redis si la aplicacion corre en un solo proceso y no hay evidencia de que el volumen lo justifique — es infraestructura adicional que hay que operar, respaldar y monitorear.

### Que cachear

Regla general: cachear lo que se lee mucho y cambia poco. No cachear lo que cambia en cada request o donde la inconsistencia temporal es inaceptable (ej: saldo de una transaccion en curso).

```javascript
// Patron cache-aside con node-cache — el mas comun para lecturas costosas repetidas
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // TTL 5 min

async function obtenerCatalogo(categoriaId) {
  const key = `catalogo:${categoriaId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const datos = await db('productos').where({ categoria_id: categoriaId });
  cache.set(key, datos);
  return datos;
}
```

### Invalidacion

La invalidacion es la parte dificil del cache, no el almacenamiento. Estrategias en orden de simplicidad:

1. **TTL corto**: aceptar datos ligeramente obsoletos por un tiempo acotado. Mas simple, aplica a la mayoria de catalogos y listados.
2. **Invalidacion explicita en la escritura**: al actualizar el dato de origen, borrar o refrescar la key de cache correspondiente en la misma operacion.
3. **Invalidacion por evento**: en sistemas con cola de eventos, invalidar cache al recibir el evento de cambio correspondiente.

Regla: nunca cachear sin definir como se invalida. Un cache sin estrategia de invalidacion es una fuente de bugs de datos obsoletos.

### Senales de cache mal disenado

- `cache.flushAll()` usado como solucion recurrente ante datos inconsistentes — indica que la invalidacion selectiva no esta bien disenada.
- TTL uniforme para datos con tasas de cambio muy distintas (ej: mismo TTL para catalogo de productos y precio en tiempo real).
- Cache de datos por-usuario con key que no incluye el identificador de usuario — riesgo de fuga de datos entre usuarios.

## CDN para Assets Estaticos

### Principio

El servidor de aplicacion no deberia servir imagenes, JS, CSS ni fuentes directamente en produccion bajo trafico significativo. Cada request a un asset estatico servido por el propio proceso compite por los mismos recursos (CPU, conexiones) que las requests de negocio.

### Que va a CDN

| Tipo de asset | CDN | Notas |
|---|---|---|
| Imagenes, iconos, fuentes | Si, siempre | Contenido inmutable o versionado por hash de contenido |
| JS/CSS compilado (build de produccion) | Si, siempre | Versionar con hash en el nombre de archivo para invalidacion automatica (`app.a3f9c1.js`) |
| HTML dinamico generado por request | No | El CDN solo cachea si el contenido es identico para todos los usuarios; HTML personalizado no aplica salvo edge rendering explicito |
| APIs de datos | No (salvo respuestas publicas cacheables con headers explicitos) | Las respuestas de API mutan por usuario o por estado; cachear sin control de headers arriesga servir datos incorrectos |

### Configuracion minima

```
# Headers de cache para assets versionados por hash — cache agresivo seguro
Cache-Control: public, max-age=31536000, immutable

# Headers para HTML o assets sin versionado por hash — revalidar siempre
Cache-Control: public, max-age=0, must-revalidate
```

Regla: solo usar `immutable` en assets cuyo nombre de archivo cambia si el contenido cambia (versionado por hash). Aplicar `immutable` a un archivo con nombre fijo (`app.js` sin hash) causa que los usuarios queden atascados en una version vieja tras un deploy.

### Seleccion de proveedor

No es una decision tecnica profunda para la mayoria de proyectos — cualquier CDN mainstream (Cloudflare, CloudFront, Fastly, el CDN del proveedor de hosting) cumple. Priorizar el que ya tenga integracion nativa con el proveedor de hosting/DNS existente del proyecto, para evitar configuracion manual de certificados y DNS.

## Pruebas de Carga

### Herramienta segun contexto

| Herramienta | Cuando usarla |
|---|---|
| `autocannon` (npm, puro Node.js) | Proyecto Node.js sin binarios externos disponibles; benchmarks rapidos embebidos en scripts npm |
| `k6` (binario Go + scripting JS) | Escenarios complejos, integracion con Grafana/Prometheus, equipos con esa infraestructura ya montada |
| `Artillery` (config YAML) | Escenarios que un no-desarrollador debe poder leer y ajustar |

Para un stack Node.js nativo sin dependencias de binarios externos, `autocannon` es la opcion de menor friccion — se instala como paquete npm y no requiere binario adicional en CI.

### Patron minimo de prueba de carga

```javascript
// scripts/load-test.js — simular N usuarios concurrentes contra un endpoint
const autocannon = require('autocannon');

async function ejecutar() {
  const resultado = await autocannon({
    url: process.env.TARGET_URL || 'http://localhost:3000',
    connections: 100,   // usuarios concurrentes simulados
    duration: 30,        // segundos
    pipelining: 1,
  });

  console.log(autocannon.printResult(resultado));

  // Gate de aceptacion — fallar el script si la latencia p99 supera el umbral
  if (resultado.latency.p99 > 500) {
    console.error(`Latencia p99 (${resultado.latency.p99}ms) supera el umbral de 500ms`);
    process.exit(1);
  }
}

ejecutar();
```

### Que medir

- **Latencia p50/p95/p99**: el promedio esconde los casos peores que los usuarios reales sienten. p99 es la metrica que importa para la experiencia de usuario bajo carga.
- **Tasa de error bajo carga**: requests que fallan (timeout, 5xx) solo cuando sube la concurrencia — sintoma de pool de conexiones agotado o falta de cache.
- **Punto de quiebre**: aumentar `connections` progresivamente (10 → 50 → 100 → 500) hasta identificar en que nivel la latencia se degrada de forma no lineal. Ese es el limite real de capacidad, no una suposicion.

### Cuando ejecutar pruebas de carga

- Antes de cualquier lanzamiento con trafico esperado significativamente mayor al actual (campana, prensa, integracion nueva).
- Despues de cualquier cambio que toque una ruta critica de alto trafico (checkout, login, endpoint mas usado).
- Como gate periodico en CI si el proyecto tiene SLA de latencia declarado — no solo de forma reactiva tras un incidente.

Regla: nunca ejecutar pruebas de carga contra produccion sin coordinar la ventana con el equipo — una prueba de carga mal dirigida es indistinguible de un ataque de denegacion de servicio contra el propio sistema.

## Directiva de Interrupcion

Detener el analisis e insertar la directiva ante cualquiera de estas condiciones:

- La prueba de carga propuesta apunta a un entorno de produccion sin ventana de mantenimiento coordinada ni aviso al equipo responsable.
- La estrategia de cache propuesta cachea datos sensibles (PII, tokens de sesion, datos financieros) sin cifrado ni control de acceso equivalente al del dato original.
- La introduccion de Redis u otro servicio de cache distribuido implica cambios de arquitectura multi-instancia no evaluados por `backend-architect` o `devops-infra`.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Restricciones del Perfil

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo Zero-Token' en CLAUDE.md.
- No cruzar responsabilidades con `database-ops` (pooling, indices, migraciones) ni `devops-infra` (IaC, Kubernetes, observabilidad de infraestructura).
- Toda recomendacion de cache debe incluir su estrategia de invalidacion explicita — no se acepta "cachear" sin definir como se refresca el dato.
- Verificar que ninguna prueba de carga se ejecute contra produccion sin coordinacion explicita del equipo responsable.
- Las Reglas Globales del CLAUDE.md aplican sin excepcion.
