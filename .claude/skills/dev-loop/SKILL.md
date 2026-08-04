---
name: dev-loop
description: Ciclo de desarrollo con validacion por fases. Impone 5 gates obligatorios antes de generar codigo — Spec, Design, Plan, Build, Review — eliminando el patron de 500 lineas sin validar. Basado en Superpowers (Jesse Vincent/obra) y agent-skills (Addy Osmani). Activa al iniciar cualquier tarea de implementacion nueva, al detectar que se va a generar codigo sin especificacion previa, o al retomar una tarea incompleta.
origin: ai-core
version: 1.0.0
last_updated: 2026-08-04
rol: coder
---

# Dev-Loop — Ciclo de Validacion por Fases

Resuelve el problema de "genera 500 lineas sin validar": ninguna fase produce codigo hasta que la anterior tiene un artefacto verificable aprobado. Los subagentes que se lanzan en fase Build arrancan con contexto cero — el artefacto del Plan es su unico input.

Complementos: `code-reviewer` (fase Review), `qa-engineer` (estrategia de tests en fase Build), `backend-architect` / `tech-lead-frontend` (decisiones de arquitectura en fase Design).

---

## Cuando Activar Este Perfil

- Al iniciar cualquier tarea de implementacion que requiera crear o modificar mas de un archivo.
- Cuando el usuario describe una feature, bug fix o refactor sin especificar el diseño.
- Al detectar que se va a generar codigo antes de tener un contrato de interfaces definido.
- Al retomar una tarea que quedo incompleta entre sesiones.
- Al evaluar si una solucion propuesta resuelve el problema correcto.

## Cuando NO Activar Este Perfil

- La tarea es un cambio de una sola linea con impacto trivial y scope claro.
- La tarea es documentacion, comentarios o renombrado sin logica nueva.
- La tarea es ejecutar un comando de diagnostico o lectura de estado del sistema.
- Ya existe un artefacto de Plan aprobado para esta tarea — ir directamente a Build.
- La tarea es una pregunta o consulta, no una implementacion.

---

## Primera Accion al Activar

Antes de emitir cualquier artefacto, identificar el estado actual del ciclo:

1. ¿Existe un artefacto de Spec aprobado para esta tarea? Si no → comenzar por Fase 1.
2. ¿Existe un Plan con pasos sin completar? Si si → mostrar estado y continuar desde la fase correspondiente.
3. Emitir: `[DEV-LOOP] Iniciando desde Fase N — [nombre de fase]`

Si MCP gemini-bridge esta disponible y el contexto del repositorio no fue analizado en esta sesion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta estructura de modulos, convenciones de nomenclatura, framework de tests y archivos relacionados con la tarea a implementar")
```

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No avanzar sin confirmacion:

- El diseño en Fase 2 afecta mas de 3 archivos existentes en produccion.
- La tarea implica cambiar contratos de API publica consumida por otros servicios.
- El Plan requiere modificar la estructura de base de datos o esquemas de migracion.
- Se detecta en Review una falla de diseño (no de implementacion) — regresar a Fase 2.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

---

## Las 5 Fases y sus Artefactos

Cada fase produce un artefacto obligatorio. Sin el artefacto de la fase anterior, la siguiente no comienza.

```
FASE 1 — SPEC      → Artefacto: definicion del problema (≤ 5 lineas)
FASE 2 — DESIGN    → Artefacto: interfaces/contratos + diagrama ASCII
FASE 3 — PLAN      → Artefacto: checklist de cambios con rutas de archivo
FASE 4 — BUILD     → Artefacto: codigo implementado segun el Plan
FASE 5 — REVIEW    → Artefacto: hallazgos clasificados por severidad
```

El flujo es lineal con una excepcion: si Review detecta una falla de diseño (no de implementacion), regresa a Fase 2 — no a Fase 4.

---

## Fase 1 — SPEC: Entender el problema, no la solucion

**Objetivo:** Definir con precision que debe cambiar y por que, sin hablar de como.

**Formato obligatorio del artefacto:**

```
SPEC:
Problema: [una oracion — que falla o que falta]
Contexto: [donde ocurre — modulo, archivo, flujo de usuario]
Criterio de exito: [como sabremos que esta resuelto — medible y especifico]
Fuera de scope: [que NO se va a cambiar en esta tarea]
Riesgo: [que puede salir mal al hacer este cambio]
```

**Reglas:**
- Si el problema no cabe en una oracion, es mas de una tarea. Dividir.
- El criterio de exito debe ser verificable sin interpretacion subjetiva.
- "Fuera de scope" es obligatorio — previene el scope creep en Build.
- No continuar a Design hasta que el Spec este aprobado (explicito o por silencio del usuario en 1 turno).

---

## Fase 2 — DESIGN: Contratos antes de implementacion

**Objetivo:** Definir las interfaces, tipos y arquitectura antes de escribir logica.

**Formato obligatorio del artefacto:**

```
DESIGN:
Interfaces / Tipos:
  [definicion de funciones publicas, tipos, contratos de API]

Dependencias afectadas:
  [archivos que cambian, modulos que se importan, servicios externos]

Diagrama de flujo (ASCII):
  [representacion visual del flujo de datos o componentes]

Decisiones de diseño:
  [por que esta arquitectura y no otra — max 2 alternativas descartadas]
```

**Reglas:**
- Las interfaces se definen antes que la implementacion. Ningun `function foo() { // TODO }` cuenta como interfaz.
- Si el diseño afecta mas de 3 archivos existentes → insertar `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]` y esperar confirmacion.
- Las decisiones de diseño se documentan con la razon, no solo la eleccion. Esto es lo que permite a Review evaluar si la implementacion cumple la intencion.

---

## Fase 3 — PLAN: Checklist atomico de cambios

**Objetivo:** Descomponer el diseño en pasos atomicos, ordenados y verificables.

**Formato obligatorio del artefacto:**

```
PLAN:
[ ] 1. [accion concreta] en [ruta/archivo.js] — [razon o dependencia]
[ ] 2. [accion concreta] en [ruta/archivo.js] — [razon o dependencia]
[ ] 3. Agregar test: [descripcion del caso] en [tests/archivo.test.js]
...
[ ] N. Verificar: npm test pasa sin regresiones
```

**Reglas:**
- Cada paso tiene exactamente un archivo destino. Si un paso toca dos archivos, dividirlo.
- Los tests van en el Plan como pasos explícitos — no son opcionales ni post-hoc.
- El ultimo paso siempre es `npm test` o el comando de verificacion del proyecto.
- No comenzar Build hasta que el Plan tenga todos los pasos numerados y el usuario lo apruebe.

---

## Fase 4 — BUILD: Implementar siguiendo el Plan

**Objetivo:** Ejecutar el Plan paso a paso. Sin desviaciones, sin features extras.

**Reglas de Build:**
- Seguir el Plan en orden. Si un paso revela que el Plan es incorrecto, pausar y actualizar el Plan antes de continuar — no improvisar.
- Aplicar la escalera Ponytail antes de escribir cada bloque: ¿necesita existir? ¿ya existe? ¿stdlib lo hace?
- Maximo 150 lineas por archivo nuevo. Si el Plan requiere mas, el Design tenia demasiada responsabilidad en un modulo — regresar a Fase 2.
- TDD cuando aplica: el test se escribe antes de la implementacion para los casos especificados en el Plan.
- Al terminar cada paso del Plan, marcarlo como completado `[x]` en el artefacto.

**Anti-patrones de Build que detienen el ciclo:**
- Agregar logica no especificada en el Plan (`// tambien aproveche para...`).
- Cambiar el diseño de interfaces durante la implementacion sin actualizar el artefacto de Design.
- Saltarse la escritura de tests "para despues".
- Generar un bloque de codigo de mas de 200 lineas sin dividirlo en pasos del Plan.

---

## Fase 5 — REVIEW: Validacion adversarial

**Objetivo:** Verificar que la implementacion cumple el Spec, el Design y el Plan — y que no introduce nuevos problemas.

**Formato obligatorio del artefacto:**

```
REVIEW:
Spec cumplido: [si/no] — [evidencia]
Design respetado: [si/no] — [evidencia o desviacion detectada]
Plan completado: [si/no] — pasos pendientes: [lista]

Hallazgos:
  [CRITICO]  ruta/archivo.js:L42 — [descripcion + fix recomendado]
  [ALTO]     ruta/archivo.js:L18 — [descripcion + fix recomendado]
  [MEDIO]    ruta/archivo.js:L5  — [descripcion]
  [BAJO]     ruta/archivo.js:L91 — [descripcion]

Tests: [N passing / M failing — comando ejecutado]
```

**Reglas:**
- Co-activar `code-reviewer` para la revision de codigo.
- Si hay hallazgos CRITICO o ALTO: volver a Fase 4 con el fix especifico. No entregar.
- Si el Spec no esta cumplido: volver a Fase 1. El problema cambio durante Build.
- Si el Design no fue respetado: volver a Fase 2 o documentar la desviacion con justificacion.
- BAJO y MEDIO se documentan pero no bloquean la entrega — van al backlog.

---

## Protocolo de Retoma (sesion nueva, tarea incompleta)

Si la tarea tiene artefactos de fases anteriores en el contexto o en memoria:

1. Identificar la ultima fase completada con artefacto valido.
2. Mostrar el estado: `[DEV-LOOP] Retomando desde Fase N — artefacto: [resumen de 1 linea]`
3. Continuar desde esa fase sin re-ejecutar las anteriores.
4. Si los artefactos son de una sesion anterior (> 24h), verificar que el contexto del codigo no cambio antes de continuar.

---

## Telemetria del Ciclo

Al completar cada fase, emitir una linea de estado:

```
[DEV-LOOP F1/SPEC]    ok — criterio: "X"
[DEV-LOOP F2/DESIGN]  ok — interfaces: N definidas, archivos afectados: M
[DEV-LOOP F3/PLAN]    ok — pasos: N, tests incluidos: M
[DEV-LOOP F4/BUILD]   ok — pasos completados: N/N, lineas escritas: ~M
[DEV-LOOP F5/REVIEW]  ok|bloqueado — hallazgos: C criticos, A altos, M medios, B bajos
```

---

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables.

Restricciones adicionales:
- No generar codigo en Fase 1, 2 o 3. Solo artefactos de texto.
- No avanzar a la siguiente fase sin artefacto valido de la actual.
- No modificar archivos fuera del scope definido en el Plan.
- No saltarse fases por presion de tiempo — si el tiempo es critico, reducir el scope en Fase 1, no eliminar fases.
- Si el usuario pide saltarse fases explicitamente, documentar la decision y sus riesgos antes de proceder.

---

## Modulo — Gates de Vanguardia por Fase

### Identidad del ciclo — declarar antes de abrir Fase 1

Ningun ciclo arranca sin declarar el contrato de rigor que va a regir las cinco fases. Llenar en una linea antes de emitir el primer artefacto de Spec:

```
IDENTIDAD DE CICLO:
  Criticidad de la tarea: [hotfix de produccion | feature de usuario | cambio de infraestructura/esquema | experimento/spike]
  Nivel de evidencia exigido en Review: [smoke test manual | suite automatizada existente | suite + cobertura nueva | suite + verificacion en vivo con datos reales]
  Quien aprueba cada gate: [silencio del usuario en 1 turno | confirmacion explicita | code-reviewer automatizado | ambos]
  Tolerancia a rollback: [una linea — ej. "revertible con git revert sin downtime" o "requiere migracion irreversible, exige doble confirmacion"]
```

Si el proyecto anfitrion ya tiene un criterio de aprobacion documentado (CONTRIBUTING.md, plantilla de PR), la Identidad de Ciclo hereda ese criterio en vez de inventar uno paralelo.

### Prohibido — patrones reconocibles de gate de plantilla

- Artefacto de Spec que repite el pedido del usuario casi palabra por palabra sin extraer "Fuera de scope" ni "Riesgo" — el gate existe para forzar analisis, no para transcribir.
- Design que solo enumera archivos a tocar sin declarar el contrato de interfaces — "voy a modificar X, Y, Z" no es una interfaz, es una lista de tareas disfrazada de diseño.
- Plan con pasos del tipo "implementar la logica" o "hacer los cambios necesarios" sin ruta de archivo ni accion verificable — el paso no se puede marcar `[x]` con evidencia real.
- Fase de Build que termina y pasa directo a "listo" sin que el artefacto de Review exista — saltarse Fase 5 porque "el codigo compila" es el mismo antipatron de 500 lineas sin validar que este skill existe para eliminar.
- Marcar un hallazgo `[CRITICO]` o `[ALTO]` en Review y entregar de todos modos "porque no da tiempo" — el gate de severidad no es una sugerencia editorial.
- Reabrir Fase 4 para un hallazgo que en realidad es de diseño (Design), solo para evitar el retroceso formal a Fase 2 — encubre la falla en vez de corregir la causa.

### Gate de calidad medible por fase

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Cobertura de pasos del Plan marcados con evidencia | 100% de los pasos `[x]` tienen referencia a archivo + linea o output de comando, no solo el checkbox marcado | Inspeccion del artefacto de Plan final contra el diff real (`git diff --stat`) |
| Tests declarados en Plan vs tests ejecutados en Review | Igual numero — cero tests "prometidos" en Plan que no aparecen en el output de `npm test` de Review | Comparar el conteo de pasos `Agregar test:` del Plan contra el resultado de `npm test` citado en Review |
| Hallazgos CRITICO/ALTO sin resolver al momento de entrega | 0 | Conteo explicito en la linea `Hallazgos:` del artefacto de Review — cualquier valor > 0 bloquea el cierre del ciclo |
| Desviacion entre Design y Build | 0 cambios de interfaz sin actualizar el artefacto de Design | Diff textual entre la seccion `Interfaces / Tipos:` del Design y las firmas de funcion realmente implementadas |
| Tiempo entre fases sin artefacto valido | 0 — ninguna fase produce codigo o el artefacto de la siguiente fase sin que la anterior tenga su artefacto completo en el historial de la sesion | Revision manual del orden de artefactos emitidos en la conversacion antes de declarar el ciclo cerrado |

### Vigencia — estandar mas reciente del dominio

Verificado en esta tarea contra fuente oficial primaria (`agentskills.io/specification`, especificacion abierta que gobierna el formato `SKILL.md` que usa este mismo arnes): la especificacion recomienda mantener el body completo de un `SKILL.md` bajo 5000 tokens al activarse y el archivo completo bajo 500 lineas, moviendo detalle a `references/` — esto es un limite de diseño del formato de skills, no de la metodologia de gates en si. No se encontro, contra fuente oficial verificable en el tiempo disponible de esta pasada, un estandar formal unico de la industria para "gates de validacion por fase" equivalente al usado aqui (el propio skill ya cita su origen en Superpowers de Jesse Vincent y agent-skills de Addy Osmani, ninguno de los dos un spec versionado con numero de release). Cualquier afirmacion futura sobre una version numerada o certificacion formal de una metodologia de gates de este tipo debe tratarse como orientativo, no verificado contra fuente oficial, hasta confirmarla independientemente.
