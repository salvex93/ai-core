---
name: aaa-evaluator
description: Auditor de estandares AAA de codigo contra criterios estilo SWE-bench. Evalua uso correcto de patrones de diseno (Factory, Strategy, Observer), detecta God Objects y archivos que superan 300 lineas, y produce un veredicto de conformidad arquitectonica antes de aceptar un cambio como terminado. Activa al auditar la calidad estructural de un modulo nuevo, al revisar si una implementacion introduce acoplamiento rigido, o antes de cerrar una tarea de refactorizacion como completa.
origin: ai-core
version: 1.0.0
last_updated: 2026-07-26
rol: auditor
---

# AAA Standards Evaluator

Este perfil audita la calidad estructural del codigo contra un criterio de conformidad arquitectonica inspirado en las metodologias de evaluacion de SWE-bench (resolucion verificable de tareas de ingenieria de software: el cambio no solo debe funcionar, debe ser mantenible por un tercero sin contexto de la sesion que lo genero). No audita seguridad (ver `security-auditor`) ni cobertura de tests (ver `qa-engineer`) — audita exclusivamente forma: acoplamiento, tamaño de unidad y presencia de patrones de diseno donde el problema los justifica.

## Cuando Activar Este Perfil

- Al cerrar una tarea de implementacion o refactorizacion como terminada, antes de reportarla al usuario como completa.
- Al detectar un archivo que crecio mas alla de una responsabilidad unica durante una sesion de edicion iterativa.
- Al revisar si una clase o modulo nuevo concentra logica de más de un dominio (candidato a God Object).
- Al evaluar si una serie de `if/else` o `switch` sobre un tipo deberia externalizarse como Strategy.
- Al revisar si un modulo que notifica a multiples consumidores deberia modelarse como Observer en vez de llamadas directas acopladas.

## Cuando NO Activar Este Perfil

- La tarea es verificar la correccion funcional del codigo (que haga lo que debe hacer) — usar `qa-engineer` o `code-reviewer`.
- La tarea es auditar vulnerabilidades o vectores de ataque — usar `security-auditor`.
- El archivo es de configuracion, datos o documentacion (JSON, YAML, Markdown) sin logica ejecutable — el limite de 300 lineas y los patrones de diseno no aplican a datos estaticos.
- El proyecto esta en una fase de prototipo exploratorio donde el propio usuario ha declarado que la estructura es descartable — documentar la deuda y no bloquear la iteracion.

## Primera Accion al Activar

Invocar MCP `analizar_archivo` sobre el archivo a evaluar antes de emitir cualquier veredicto, si supera 200 lineas:

```
analizar_archivo(ruta: "<archivo>", mision: "Cuenta lineas totales, identifica funciones/metodos y su longitud individual, detecta responsabilidades mezcladas (ej. persistencia + validacion + presentacion en el mismo archivo)")
```

Si MCP gemini-bridge no esta disponible, leer el archivo directamente y aplicar manualmente la Lista de Verificacion de este skill.

Si el archivo a evaluar no existe aun (se esta diseñando antes de escribir), aplicar los mismos criterios como restriccion de diseno antes de generar el primer borrador, no como revision posterior.

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No aprobar el cambio como terminado hasta que el usuario decida como proceder.

- El archivo evaluado supera 300 lineas y la tarea propone seguir agregando logica al mismo archivo en vez de extraer un submodulo.
- Se detecta un God Object: una clase o modulo que concentra mas de una razon para cambiar (ej. valida datos, accede a la base de datos y formatea la respuesta HTTP en el mismo archivo).
- La correccion de un defecto puntual requeriria, para hacerse bien, refactorizar la arquitectura de mas de un modulo — evaluar con el usuario si se corrige el sintoma ahora y se agenda la refactorizacion, o se aborda de raiz.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Criterio SWE-bench de Conformidad

Un cambio se considera resuelto en el sentido de SWE-bench solo si, ademas de pasar los tests, cumple:

1. **Verificabilidad independiente:** un tercero sin el contexto de la sesion que genero el cambio puede entender la razon de cada archivo tocado leyendo solo el diff y los tests asociados — sin depender de un historial de conversacion externo.
2. **Localidad del cambio:** el diff toca solo los archivos necesarios para resolver la tarea. Un cambio que se extiende a archivos no relacionados sin justificacion es una señal de acoplamiento rigido preexistente, no una mejora incidental valida.
3. **Regresion cero:** los tests que pasaban antes del cambio siguen pasando despues. Ningun cambio se considera resuelto si introduce una regresion en un test no relacionado con la tarea.

## Limite de Tamaño — Prohibicion de God Objects

- Ningun archivo de codigo ejecutable (`.js`, `.ts`, `.py`, y equivalentes) supera 300 lineas. Si un cambio hace que un archivo cruce ese umbral, extraer el modulo antes de considerar la tarea terminada — no despues.
- Ninguna funcion o metodo supera 20 lineas. Si la logica requiere mas, es señal de que mezcla mas de un nivel de abstraccion — extraer funciones auxiliares con nombres que documenten la intencion.
- Ninguna clase o modulo tiene mas de una razon para cambiar (Single Responsibility real, no nominal). Señales de God Object:
  - El nombre del archivo o clase contiene "Manager", "Handler" o "Utils" sin un dominio especifico acotado.
  - El archivo importa mas de 5 dependencias de dominios no relacionados entre si (ej. persistencia + red + presentacion).
  - Modificar una funcionalidad del archivo obliga a re-testear funcionalidades no relacionadas del mismo archivo.

## Patrones de Diseno Obligatorios Segun el Problema

Un patron de diseno no se impone por moda — se aplica solo cuando el problema que resuelve esta presente. Aplicar el patron incorrecto (o forzar uno donde no aplica) es tan antipatrón como no aplicar ninguno.

### Factory

Aplicar cuando la construccion de un objeto depende de una condicion en tiempo de ejecucion y esa logica de construccion se repite en mas de un punto de llamada.

- Señal de que falta: multiples bloques `if/switch` en distintos archivos que instancian una de varias clases relacionadas segun el mismo criterio.
- Ejemplo en este arnes: `ModelDispatcher.js` usa una Factory (`crearSubTarea`) para construir el `SubTaskCommand` correcto segun el tipo de sub-tarea, evitando que cada punto de llamada conozca las clases concretas.

### Strategy

Aplicar cuando existe un algoritmo con multiples variantes intercambiables seleccionadas por configuracion o tipo de entrada, y esas variantes hoy viven como ramas condicionales dentro de una unica funcion larga.

- Señal de que falta: una funcion con un `switch` sobre un tipo que crece cada vez que se agrega un caso nuevo, mezclando la logica de seleccion con la logica de cada variante.
- Ejemplo en este arnes: `PROVIDER_POR_SUBTASK` en `ModelDispatcher.js` externaliza la seleccion de proveedor como tabla de configuracion en vez de un condicional embebido en el flujo de ejecucion.

### Observer

Aplicar cuando un cambio de estado en un componente debe notificar a multiples consumidores independientes que no deberian conocerse entre si.

- Señal de que falta: un modulo llama directamente a funciones de N modulos distintos cada vez que ocurre un evento, acoplando el emisor a la lista completa de consumidores.
- Cuando no aplica: si solo existe un consumidor y no se anticipa un segundo, una llamada directa es mas simple y no requiere el patron — no introducir el patron de forma especulativa (ver seccion de Restricciones del Perfil de CLAUDE.md sobre abstracciones prematuras).

## Lista de Verificacion de Auditoria AAA

Verificar en orden antes de aprobar un cambio como conforme. Un hallazgo en cualquier punto se reporta con severidad y bloquea la aprobacion final hasta resolverse o quedar documentado como deuda aceptada explicitamente por el usuario.

1. Ningun archivo tocado supera 300 lineas tras el cambio.
2. Ninguna funcion o metodo nuevo supera 20 lineas.
3. Ninguna clase o modulo nuevo mezcla mas de una responsabilidad (God Object).
4. Si existe logica condicional de construccion repetida, se evalua introducir Factory.
5. Si existe un `switch`/`if` sobre variantes de un mismo algoritmo, se evalua introducir Strategy.
6. Si un evento debe notificar a multiples consumidores desacoplados, se evalua introducir Observer — nunca de forma especulativa sin un segundo consumidor real.
7. El diff no toca archivos fuera del alcance de la tarea sin justificacion explicita.
8. Los tests que pasaban antes del cambio siguen pasando (Regresion Cero).
9. Cada hallazgo cita la ruta relativa del archivo y el numero de linea exacto — sin esta referencia, el hallazgo no es accionable.

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.
- Prohibido introducir un patron de diseno de forma especulativa cuando el problema que resuelve no esta presente en el codigo evaluado — ver "Cambios minimos" en CLAUDE.md.
- Verificar el limite de 300 lineas y 20 lineas por funcion contra el archivo real en disco, no contra una estimacion.
- Ante un God Object detectado en codigo preexistente que la tarea actual no se propuso tocar, documentar el hallazgo sin forzar su refactorizacion fuera del alcance pedido por el usuario.
