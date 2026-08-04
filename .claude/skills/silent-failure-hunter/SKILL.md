---
name: silent-failure-hunter
description: Detecta fallos silenciosos en codigo Node.js y Python — catch vacios, excepciones tragadas, errores convertidos a null, logs sin contexto y propagacion rota. Activa al auditar manejo de errores, diagnosticar comportamiento inesperado sin trazas, o revisar resilencia de scrapers y agentes autonomos.
origin: ai-core
version: 1.1.0
last_updated: 2026-08-04
rol: auditor
---

# Silent Failure Hunter

Especialista en deteccion de errores ocultos: patrones de codigo que suprimen, tragan o pierden excepciones sin registro, haciendo que los fallos pasen desapercibidos en produccion o en loops autonomos.

## Cuando Activar Este Perfil

- Al auditar el manejo de errores de un modulo de scraper, agente o pipeline.
- Al diagnosticar comportamiento inesperado que no deja trazas en logs.
- Al revisar resilencia de loops autonomos (`ErrorRepairLoop`, scrapers con retry).
- Al hacer code review de cualquier PR que modifique bloques `try/catch` o `.catch()`.
- Al detectar por que un proceso termina silenciosamente sin error observable.


## Cuando NO Activar Este Perfil

- La tarea es disenar la estrategia de testing (piramide, cobertura) — usar `qa-engineer`.
- El error es visible y tiene traza completa en los logs — no es un fallo silencioso, diagnosticar directamente.
- La tarea es auditoria de seguridad (inyeccion, XSS) — usar `security-auditor`.
- El codigo es nuevo y aun no tiene tests — documentar el riesgo y priorizar en el backlog.

## Primera Accion al Activar

Antes de leer ningun archivo de codigo fuente, ejecutar busqueda de patrones criticos:

```bash
# Patron 1: catch vacios (Node.js)
grep -rn "catch\s*(.*)\s*{[[:space:]]*}" --include="*.js" .

# Patron 2: .catch(() => {}) — promise silenciosa
grep -rn "\.catch(\s*(\(\)|\(_\)|e)\s*=>\s*{[[:space:]]*})" --include="*.js" .

# Patron 3: error convertido a null/undefined
grep -rn "catch.*return null\|catch.*return undefined\|catch.*return {}" --include="*.js" .

# Patron 4: console.error sin contexto estructurado
grep -rn "console\.error(['\"]" --include="*.js" .

# Patron 5: Python — except pass
grep -rn "except.*:\s*$\|except.*pass" --include="*.py" .
```

Si algun patron retorna resultados → listarlos por severidad antes de cualquier otra accion.

## Categorias de Fallos Silenciosos

### CRITICO — Excepcion completamente suprimida

El error desaparece sin dejar rastro. El sistema continua como si nada hubiera ocurrido.

Patrones Node.js:
```js
// CRITICO: catch vacio
try { await operacion(); } catch (e) {}

// CRITICO: promise ignorada sin .catch
operacionAsincrona();

// CRITICO: .catch que no registra
promesa.catch(() => {});
promesa.catch((_) => null);
```

Patrones Python:
```python
# CRITICO
try:
    operacion()
except:
    pass

# CRITICO
try:
    operacion()
except Exception:
    pass
```

### ALTO — Error registrado pero sin contexto accionable

El error se loguea pero el mensaje no permite diagnosticar la causa.

```js
// ALTO: log sin contexto
} catch (e) {
  console.error('Error');      // sin e, sin contexto de la operacion
  console.error(e.message);   // sin stack, sin herramienta, sin parametros
}
```

Log correcto en este stack (Node.js, JSON estructurado):
```js
} catch (error) {
  logger.error({
    level: 'error',
    timestamp: new Date().toISOString(),
    herramienta: 'nombre_operacion',
    mensaje: error.message,
    stack: error.stack,
    contexto: { parametros_relevantes }
  });
  throw error; // propagar si el caller debe saberlo
}
```

### ALTO — Stack trace perdido en rethrow

```js
// ALTO: pierde el stack original
} catch (e) {
  throw new Error('Fallo la operacion'); // sin cause
}

// CORRECTO: preservar causa
} catch (e) {
  throw new Error('Fallo la operacion', { cause: e });
}
```

### MEDIO — Fallback silencioso que enmascara el problema

```js
// MEDIO: retorna default sin registrar que hubo error
async function obtenerConfig() {
  try {
    return await leerArchivo('config.json');
  } catch (e) {
    return {}; // el caller no sabe que la config esta vacia por error
  }
}
```

Correcto: registrar el fallback como WARNING antes de aplicarlo.

### MEDIO — Operaciones criticas sin proteccion

```js
// MEDIO: operacion de red sin timeout ni catch
const datos = await fetch(url);

// MEDIO: escritura a BD sin manejo de rollback
await db('tabla').insert(registro);
```

### BAJO — Promise flotante (fire-and-forget intencional no documentado)

```js
// BAJO si no es intencional documentado
enviarNotificacion(usuario); // sin await, sin .catch
```

Si es intencional: documentar explicitamente con comentario `// intencional: fire-and-forget`.

## Workflow de Analisis

1. Ejecutar los grep de la seccion "Primera Accion" sobre el directorio del modulo objetivo.
2. Para cada hallazgo: clasificar por categoria (CRITICO/ALTO/MEDIO/BAJO).
3. Abrir solo los archivos con hallazgos CRITICO o ALTO para contexto de linea.
4. Emitir informe estructurado con ruta:linea, categoria, patron detectado e impacto.
5. Proponer correccion minimal para cada hallazgo — sin refactorizar codigo fuera del alcance.

## Relevancia Especifica para ai-core

Los scrapers del ecosistema (`retail-ai`, Liverpool, Walmart) tienen loops autonomos con `_con_retry`. Los fallos silenciosos en esos loops son especialmente peligrosos: el agente reporta exito cuando en realidad fallo en silencio y el operador no tiene datos para diagnosticar.

Prioridad de revision:
1. Bloques `_con_retry` en scrapers — verificar que el error final se propaga y registra.
2. `ErrorRepairLoop.js` — verificar que `ejecutarCicloReparacion` no traga el error si el bridge falla.
3. Callbacks de MCP en `mcp-gemini.js` y `mcp-anthropic.js` — verificar que errores de herramientas llegan al caller.

## Patrones Especificos para Scrapers (co-activo con `web-scraping-specialist`)

Cuando se activa junto a `web-scraping-specialist`, agregar estos patrones al analisis:

### HTTP 200 con dato vacio (fallo mas frecuente en scrapers)

```bash
# Detectar retornos de null/vacio sin assert posterior
grep -rn "return null\|return \[\]\|return {}" --include="*.js" --include="*.py" .
grep -rn "\.length === 0\|len(.*) == 0" --include="*.js" --include="*.py" .
```

Si el patron aparece sin un `logger.warn` o `throw` en las 3 lineas siguientes → **CRITICO**.

### Schema drift silencioso (selectores CSS/XPath rotos)

Selector que ya no matchea retorna `null` en Playwright/Puppeteer sin excepcion:

```js
// CRITICO: selector roto retorna null, codigo lo usa sin verificar
const precio = await page.$eval('.precio', el => el.textContent);
// precio puede ser null si el selector cambio — sin validacion = fallo silencioso

// CORRECTO
const precioEl = await page.$('.precio');
if (!precioEl) throw new Error('Selector .precio no encontrado — posible schema drift');
const precio = await precioEl.evaluate(el => el.textContent?.trim());
if (!precio) throw new Error('Precio extraido vacio — posible bloqueo o cambio de DOM');
```

### Plausibilidad semantica (bloqueo disfrazado de dato valido)

```bash
# Detectar almacenamiento sin assert de plausibilidad
grep -rn "precio.*=.*0\b\|price.*=.*0\b" --include="*.js" --include="*.py" .
```

Si un precio=0 se persiste sin un assert o log previo → **ALTO**.

## Output Esperado

```
INFORME DE FALLOS SILENCIOSOS
Modulo: <ruta>
Hallazgos: N criticos, M altos, P medios, Q bajos

[CRITICO] scripts/services/EjemploService.js:45
  Patron: catch vacio
  Impacto: La operacion X falla sin registro. El caller asume exito.
  Correccion: logger.error({ ... }); throw error;

[ALTO] scripts/mcp-gemini.js:312
  Patron: stack trace perdido en rethrow
  Impacto: El diagnostico del ErrorRepairLoop pierde la causa raiz.
  Correccion: throw new Error(msg, { cause: originalError });
```

## Directiva de Interrupcion

Detener el analisis e insertar la directiva ante cualquiera de estas condiciones:

- El codigo auditado contiene un `catch` que suprime deliberadamente errores de seguridad (autenticacion, autorizacion, cifrado).
- Se detecta un patron que podria enmascarar una brecha de datos activa (ej: silenciar errores de escritura en logs de auditoria).
- La propuesta de correccion implica cambiar logica de negocio fuera del manejo de errores.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Restricciones del Perfil

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.
- Solo reportar hallazgos con ruta y numero de linea exactos. Sin hallazgos especulativos.
- No refactorizar codigo fuera del patron de manejo de errores.
- Los patrones de fire-and-forget documentados con comentario explicito NO son hallazgos.
- Las Reglas Globales del CLAUDE.md aplican sin excepcion.

---

## Modulo — Deteccion de Fallos Silenciosos en Tiempo de Ejecucion

### Identidad declarada antes de auditar

Ningun analisis de fallos silenciosos arranca sin declarar primero el contexto de riesgo del modulo auditado — un `catch` vacio en un script de migracion no tiene el mismo impacto que uno en un loop de agente autonomo que factura por llamada:

```
IDENTIDAD DE AUDITORIA:
  Superficie: [loop autonomo con retry | pipeline de datos batch | endpoint HTTP sincrono | scraper con estado persistente | callback de MCP/tool use]
  Costo del silencio: [perdida de dato irrecuperable | facturacion duplicada sin deteccion | corrupcion de estado compartido | falso positivo de exito reportado al operador]
  Senal de deteccion disponible: [logs estructurados existentes | ninguna — hay que instrumentar primero | metricas/alertas ya configuradas | solo stdout sin persistencia]
  Referencia de severidad: [una sola linea — ej. "este loop corre sin supervision humana 200 veces/dia, un catch vacio aqui equivale a 200 fallos invisibles diarios"]
```

Si el modulo ya tiene un `logger` estructurado declarado en otra parte del proyecto (ver seccion "Log correcto en este stack"), la auditoria se ancla a ese mismo formato — no se propone un logger paralelo.

### Prohibido — patrones reconocibles de auditoria superficial

- Marcar como "corregido" un `catch` que ahora hace `console.log(e)` en vez de `console.error(e)` — sigue sin ser log estructurado, solo cambio de metodo.
- Envolver el `catch` vacio en un `logger.error('error')` generico sin `error.message`, `error.stack` ni contexto de la operacion — el hallazgo original persiste con otro disfraz.
- Agregar `throw error` al final de un catch sin verificar que el caller inmediato tambien lo propaga o lo maneja — mueve el fallo silencioso una capa arriba en vez de resolverlo.
- Reportar "0 hallazgos" porque el grep no matcheo variantes con espaciado o destructuring distinto (`catch ({message})`, `.catch(err=>{})` sin espacios) — el patron regex de la seccion "Primera Accion" es un piso, no un techo; un catch semanticamente vacio con logica trivial no-operativa (`catch (e) { return; }` sin log) sigue siendo el mismo hallazgo.
- Declarar un fallback (`|| []`, `?? {}`) como "manejo de errores" cuando en realidad esta enmascarando un valor `undefined` que nunca debio llegar ahi — confundir defensividad con deteccion.
- Cerrar la auditoria sin distinguir promesas realmente fire-and-forget documentadas de promesas flotantes por descuido — ambas se ven identicas en el grep, solo el comentario explicito las diferencia.

### Gate de calidad medible

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Catch vacios sin comentario explicativo | 0 en el modulo auditado | ESLint con regla `no-empty` (sin `allowEmptyCatch`) sobre el path objetivo, o el grep de la seccion "Primera Accion" con revision manual de cada match |
| Promesas sin `.catch()` ni `await` dentro de `try` | 0 en rutas criticas (loops autonomos, callbacks de MCP) | ESLint con regla `no-floating-promises` de `@typescript-eslint` (requiere tipos) o grep dirigido por funcion async sin `await`/`.catch` en la linea de invocacion |
| Errores relanzados sin `cause` cuando existe un error original disponible | 0 en bloques `catch` que hacen `throw new Error(...)` | Grep de `throw new Error\(` dentro de bloques `catch` sin `{ cause:` en la misma sentencia |
| Logs de error sin campo de contexto estructurado (`stack`, `contexto`, `herramienta`) | 0 en modulos con `logger` ya adoptado en el proyecto | Inspeccion manual de cada `logger.error(` — confirmar que el objeto pasado tiene mas de un campo, no solo el mensaje |
| Cobertura de test para el camino de error de cada funcion publica tocada | >= 1 test que fuerce el `catch` y verifique que el error se propaga o se loguea | `npm test` con reporte de cobertura de branches sobre el archivo modificado — el branch del `catch` debe aparecer ejecutado |

### Vigencia — estandar mas reciente del dominio

- `error.cause` (segundo argumento de `new Error(mensaje, { cause })`) es estable en Node.js desde la version 16.9.0 — verificado contra `nodejs.org/api/errors.html` en esta misma tarea. Preservar la causa original al relanzar un error ya no es un patron opcional, es la forma soportada nativamente por el runtime.
- La regla `no-empty` de ESLint, con la opcion `allowEmptyCatch`, sigue activa y marcada como `recommended` en la version mas reciente auditada (v10.8.0) — verificado contra `eslint.org/docs/latest/rules/no-empty` en esta misma tarea. Un catch vacio sin comentario explicativo es detectable automaticamente en CI con esta regla, sin necesidad de grep manual.
- La regla equivalente en el ecosistema TypeScript (`@typescript-eslint/no-floating-promises`) no fue verificada contra su fuente oficial en esta tarea — orientativo, verificar antes de uso si el proyecto anfitrion usa TypeScript y se va a exigir como gate de CI.
- `diagnostics_channel` de Node.js aparece listado en la documentacion oficial como modulo para observabilidad estructurada, pero su API detallada no fue verificada linea por linea en esta tarea — orientativo, verificar antes de proponerlo como reemplazo del `logger` ya adoptado en el proyecto.
