# OPUSPLAN: Integracion de Files API en el LLM Routing Bridge

Fecha: 2026-03-28
Estado: PENDIENTE DE APROBACION — no implementar hasta confirmacion explicita por fase.
Autorizacion: salvex93 — resolucion A7 de auditoria AIOps 2026-03-28.

---

## Problema

El LLM Routing Bridge (`scripts/gemini-bridge.js`) lee el archivo local en cada invocacion e inyecta su contenido completo como texto en el mensaje del usuario. Esto implica que cada llamada al bridge que referencia el mismo archivo paga el costo completo de tokens de entrada del contenido del archivo, sin importar cuantas veces se haya procesado antes en la misma sesion de trabajo.

Ejemplo de costo actual para un archivo de 100 KB procesado tres veces en la misma sesion con Haiku (Nivel 1):
- 3 llamadas x ~25,000 tokens de entrada = ~75,000 tokens de entrada facturables.
- Con Prompt Caching activo, los tokens de cache hit cuestan ~10% del precio base. Pero el cache TTL de Anthropic es de 5 minutos; si las llamadas superan ese intervalo, el cache expira y se factura el costo completo de nuevo.

La Files API de Anthropic resuelve este problema con un patron distinto: subir el archivo una vez, obtener un `file_id`, y referenciar ese `file_id` en llamadas posteriores. El archivo vive en la infraestructura de Anthropic durante hasta 30 dias. El costo de tokens del contenido del archivo se paga una sola vez en la primera llamada que lo referencia; las llamadas siguientes con el mismo `file_id` no repagan el contenido.

Ahorro estimado para el patron de uso actual del bridge: 50% o mas en sesiones donde el mismo archivo se analiza con dos o mas llamadas distintas (caso comun al analizar un modulo de codigo con misiones distintas).

---

## Alcance

Este plan cubre exclusivamente la integracion de la Files API en el nivel Haiku del bridge (Nivel 1). No cubre el nivel Gemini (Nivel 2): la Files API es una capacidad de Anthropic; los modelos de Google no tienen acceso a archivos subidos via `client.files`. El nivel Gemini continuara con el patron actual de inyeccion de texto.

No cubre cambios en la interfaz de invocacion del bridge (`--mission`, `--file`, `--format`, `--model`, `--batch`). La integracion es interna al bridge; el agente principal no cambia como lo invoca.

---

## Arquitectura Propuesta

### Estructura de la cache de archivos

Se introduce un Map en memoria con ciclo de vida identico al proceso del bridge. La cache no es persistente entre invocaciones del proceso; es una optimizacion dentro de una unica ejecucion del bridge (incluyendo modo `--batch`, donde multiples archivos se procesan en el mismo proceso).

```typescript
interface FileCacheEntry {
  fileId: string;       // ID devuelto por client.files.upload
  filePath: string;     // Ruta local del archivo (clave de busqueda)
  contentHash: string;  // SHA-256 del contenido del archivo al momento de la subida
  uploadedAt: number;   // Timestamp de la subida (ms desde epoch)
  expiresAt: number;    // uploadedAt + 30 dias en ms (TTL maximo de la Files API)
}

const fileCache = new Map<string, FileCacheEntry>();
// Clave: ruta absoluta del archivo.
```

### Logica de resolucion de file_id

Al construir el mensaje del usuario para Haiku, el bridge ejecuta este algoritmo antes de inyectar el contenido del archivo:

```
1. Calcular SHA-256 del contenido del archivo local.
2. Buscar en fileCache por filePath.
3a. Si existe entrada en cache Y contentHash coincide Y expiresAt > Date.now():
    -> Usar el fileId de la entrada. No subir el archivo de nuevo.
3b. Si no existe entrada, o el hash no coincide (archivo modificado), o la entrada expiro:
    -> Subir el archivo con client.files.upload.
    -> Crear nueva FileCacheEntry con fileId, contentHash, uploadedAt = Date.now(), expiresAt = uploadedAt + 30 dias.
    -> Guardar en fileCache.
    -> Usar el nuevo fileId.
4. Construir el bloque de contenido del mensaje usando { type: "document", source: { type: "file", file_id: fileId } }
   en lugar de inyectar el texto completo.
```

### Firma refactorizada de buildUserMessage

La funcion que construye el contenido del mensaje del usuario cambia de firma para acomodar el patron file_id vs texto:

```typescript
// Antes
async function buildUserMessage(mission: string, fileContent: string): Promise<string>

// Despues
async function buildUserMessage(
  mission: string,
  fileSource: { type: 'file_id'; fileId: string } | { type: 'text'; content: string }
): Promise<Anthropic.MessageParam>
```

Cuando `fileSource.type === 'file_id'`, el mensaje se construye como array de bloques de contenido:

```typescript
{
  role: 'user',
  content: [
    {
      type: 'document',
      source: { type: 'file', file_id: fileSource.fileId },
    },
    {
      type: 'text',
      text: mission,
    },
  ],
}
```

Cuando `fileSource.type === 'text'` (fallback para el nivel Gemini o cuando la Files API no esta disponible), el mensaje se construye como texto concatenado, igual que hoy.

---

## Decisiones de Diseno

D1 — Compatibilidad con niveles de enrutamiento:
La Files API solo se activa en el Nivel 1 (Haiku). El Nivel 2 (Gemini) usa el patron de texto actual sin cambios. El enrutador del bridge ya separa ambos caminos de ejecucion; la integracion se injerta en el camino de Haiku sin tocar el de Gemini.

D2 — Tipos MIME soportados:
La Files API de Anthropic soporta `text/plain` y `application/pdf` para el bloque `document`. Archivos con otras extensiones (`.js`, `.ts`, `.py`, `.json`) se suben como `text/plain`. El bridge infiere el MIME type por extension; si la extension no es reconocida, usa `text/plain` como fallback. No se sube ningun archivo como tipo binario no soportado.

D3 — Limpieza de archivos subidos:
La Files API mantiene los archivos durante 30 dias. No se implementa limpieza activa en este plan: el bridge es un proceso de corta duracion y la expiresAt en la FileCacheEntry garantiza que el bridge no intenta referenciar un archivo expirado. La limpieza manual via `client.files.delete` se documenta como operacion opcional para proyectos que manejan datos sensibles y no desean que los archivos permanezcan en la infraestructura de Anthropic. Se envuelve en un bloque try/finally para no bloquear el flujo si la eliminacion falla.

D4 — Mitigacion parcial de HA-01 (datos sensibles en infraestructura externa):
El hallazgo HA-01 del informe de seguridad aplica directamente aqui: subir archivos a la Files API de Anthropic implica transmitir contenido del archivo a un servicio externo. La mitigacion en este plan es declarativa: el bridge emite un aviso en stderr cuando sube un archivo indicando el fileId generado, para que el operador tenga trazabilidad. La decision de si el contenido es apto para ser subido a la infraestructura de Anthropic corresponde al operador, no al bridge. No se implementa filtrado de contenido sensible en el bridge.

D5 — Compatibilidad con modo batch:
El modo `--batch` procesa multiples archivos en el mismo proceso. El fileCache en memoria es compartido entre todas las misiones del batch. Si dos misiones del batch referencian el mismo archivo, la segunda mision reutiliza el fileId de la primera sin subir el archivo de nuevo. Esta es la optimizacion de mayor impacto en el modo batch.

---

## Fases de Implementacion

Cada fase requiere confirmacion individual antes de ejecutarse. La aprobacion de este OPUSPLAN no autoriza la implementacion de ninguna fase.

Fase 1 — Extraccion de buildUserMessage a funcion pura testeable:
Refactorizar la construccion del contenido del mensaje a una funcion independiente sin efectos secundarios. Preparar el terreno para la firma refactorizada sin cambiar el comportamiento actual. Sin cambios observables desde el exterior.

Fase 2 — Implementacion de FileCacheEntry y fileCache:
Agregar la interfaz y el Map en memoria. Implementar la funcion `resolveFileSource(filePath: string): Promise<FileSource>` con la logica de hash + upload + cache. Tests unitarios para los tres caminos: cache hit, cache miss por hash distinto, cache miss por expiracion.

Fase 3 — Integracion en el camino de Haiku (Nivel 1):
Conectar `resolveFileSource` en el camino de ejecucion de Haiku. Actualizar `buildUserMessage` a la nueva firma. Verificar que el modo de texto (fallback) sigue funcionando correctamente cuando `ANTHROPIC_API_KEY` no tiene permisos de Files API.

Fase 4 — Compatibilidad con modo batch:
Verificar que el fileCache compartido funciona correctamente en el modo `--batch`. Agregar log de deduplicacion en stderr cuando una mision reutiliza un fileId de una mision anterior del mismo batch.

Fase 5 — Documentacion y actualizacion de README:
Actualizar `README.md` del bridge con el nuevo comportamiento: cuando se usa, que ahorra, como verificar que esta activo (campo `metadatos.fileId` en el output), y la nota sobre D4 (datos en infraestructura externa).

---

## Criterios de Aceptacion

Antes de considerar la implementacion completa, verificar todos los siguientes puntos:

- El bridge procesa el mismo archivo dos veces en la misma invocacion y el log de metadatos muestra el mismo `fileId` en ambas llamadas.
- El bridge detecta que el archivo fue modificado entre dos llamadas (hash distinto) y sube el archivo de nuevo.
- El bridge en modo `--batch` con dos misiones sobre el mismo archivo registra exactamente una subida y una reutilizacion.
- El bridge funciona correctamente cuando la Files API devuelve un error (fallback a inyeccion de texto, sin interrupcion del proceso).
- El nivel Gemini (Nivel 2) no se ve afectado por los cambios: continua inyectando texto directamente.
- No hay cambios en la interfaz de invocacion del bridge desde el agente principal.

---

## Riesgos

R1 — Fallo silencioso de la Files API:
Si `client.files.upload` falla con un error de red o de permisos, el bridge debe caer en el fallback de inyeccion de texto sin interrumpir la ejecucion. Si el fallback no esta implementado correctamente, el bridge devuelve error al agente principal con el mensaje de la Files API, que puede ser confuso. Mitigacion: implementar try/catch explicito alrededor de la subida y documentar el comportamiento de fallback en los tests.

R2 — Archivos sensibles en infraestructura de Anthropic (HA-01):
Cualquier archivo procesado por el bridge en Nivel 1 se transmitira a los servidores de Anthropic y permanecera almacenado durante hasta 30 dias. Para proyectos con requisitos de compliance que prohiben transmitir ciertos tipos de datos a servicios externos, la Files API no puede usarse. Mitigacion declarativa en D4: aviso en stderr y documentacion en README. Mitigacion tecnica opcional: flag `--no-files-api` para deshabilitar la integracion por invocacion.

R3 — Incremento de latencia en la primera llamada:
La primera llamada a un archivo nuevo pagara la latencia de subida a la Files API mas la latencia de la llamada a Haiku. Para archivos grandes, la latencia de subida puede ser perceptible. Las llamadas siguientes seran mas rapidas (sin costo de tokens del contenido). Este es un trade-off aceptable para el patron de uso del bridge (multiples misiones sobre el mismo archivo en la misma sesion).
