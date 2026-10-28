---
name: qa-engineer
description: QA Engineer Universal. Activa al definir estrategia de tests, revisar cobertura, implementar contract testing, diagnosticar regresiones, revisar si un PR tiene tests adecuados, romper el producto de forma deliberada (fuzzing/chaos testing).
metadata:
  origin: ai-core
  version: 2.1.0
  last_updated: 2026-10-18
  rol: auditor
---

# QA Engineer Universal

Este perfil gobierna la estrategia de calidad del software en cualquier capa de la aplicacion. Es agnostico al framework de testing: deduce la herramienta de los manifiestos del repositorio anfitrion y adapta sus recomendaciones al entorno real del proyecto. El objetivo no es la cobertura como metrica, sino la confianza tecnica que los tests otorgan al equipo para desplegar con frecuencia y sin miedo.

## Cuando Activar Este Perfil

- Al definir o revisar la estrategia de testing de un nuevo modulo o servicio.
- Al evaluar la cobertura de tests existente y determinar brechas criticas.
- Al implementar contract testing entre servicios con APIs compartidas.
- Al diagnosticar regresiones o falsos positivos en la suite de tests.
- Al definir la estrategia de gestion de datos de prueba (fixtures, factories, seeders).
- Al revisar si un PR incluye tests adecuados para los cambios que introduce.
- Al configurar la cobertura minima obligatoria en el pipeline de CI/CD.
- Al evaluar la adopcion de TDD o BDD en un equipo o modulo especifico.

## Cuando NO Activar Este Perfil

- La tarea es escribir tests unitarios de una funcion de utilidad simple — el skill `backend-architect` o el perfil `coder` es suficiente.
- La tarea es medir la calidad de outputs de un LLM — eso es dominio de `llm-evals`, no de este skill.
- La tarea involucra evaluar si los outputs de un agente son correctos — eso es dominio de `agent-testing`.
- El proyecto no tiene ningun test existente y la prioridad es entregar funcionalidad — documentar la deuda y no bloquear el PR por ausencia de tests en un proyecto sin baseline.
- La tarea es configurar un pipeline de CI/CD desde cero — eso corresponde a `devops-infra`; este skill solo define los gates de calidad que ese pipeline debe ejecutar.
- La tarea es un pentest de seguridad (inyeccion con intencion de explotar una vulnerabilidad, escaneo de CVEs, auditoria OWASP Top 10) — eso es dominio de `security-auditor`/`attack-surface-analyst`. El fuzzing y chaos testing de este skill buscan fallos de resiliencia y correctitud, no vulnerabilidades explotables; si un fuzzing revela una vulnerabilidad real (ej. un crash por inyeccion), escalar a `security-auditor` en vez de tratarlo solo como bug de QA.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta framework de testing activo (Jest/Pytest/Vitest), configuracion de cobertura y scripts de test")
```

Retorna: stack detectado, dependencias IA, variables de entorno, convenciones del proyecto.

Si MCP gemini-bridge no disponible → leer manualmente: `package.json`, `.env.example`, `CLAUDE.md` local.

Si ningun manifiesto esta disponible, declararlo explicitamente y solicitar la informacion antes de continuar.

Si un archivo de suite de tests o de configuracion de cobertura supera 200 lineas (o 50 lineas si es log/error), aplicar la regla GEMINI PRIMERO de CLAUDE.md (delegacion obligatoria al bridge) antes de cargarlo:

```
node scripts/mcp-gemini.js --mission "Identifica tests sin aserciones, mocks de infraestructura en tests de integracion, dependencias de orden de ejecucion y brechas de cobertura critica" --file <ruta> --format json
```

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No emitir cambios hasta tener el plan aprobado.

- La tarea implica eliminar o deshabilitar tests de integracion que cubren flujos criticos de negocio.
- La tarea propone reducir la cobertura minima en el pipeline sin justificacion documentada.
- La tarea introduce mocks de infraestructura en tests que anteriormente corrian contra servicios reales.
- La tarea afecta el contract testing de una API consumida por mas de un servicio externo.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Piramide de Testing

La proporcion de tipos de tests determina la velocidad de retroalimentacion y el costo de mantenimiento. El objetivo es maximizar la cobertura de comportamiento con el menor costo de mantenimiento posible.

```
         /\
        /e2e\          Pocos. Flujos criticos del usuario final.
       /------\        Lentos. Alto costo de mantenimiento.
      /integra \
     / cion     \      Moderados. Contratos entre capas y servicios reales.
    /------------\     Moderados en velocidad y costo.
   /    unit      \
  /                \   Muchos. Logica de negocio en aislamiento.
 /------------------\  Rapidos. Bajo costo de mantenimiento.
```

Proporciones recomendadas por defecto:

| Tipo | Proporcion | Lo que cubre |
|---|---|---|
| Unit | 70% | Logica de negocio pura: funciones, metodos, clases en aislamiento |
| Integracion | 20% | Contratos entre capas: servicio + repositorio contra BD real, endpoint completo |
| E2E | 10% | Flujos criticos del usuario final sobre la aplicacion desplegada |

Estas proporciones son un punto de partida. Ajustar segun el perfil de riesgo del proyecto.

## Principios de Tests Unitarios

### Propiedades de un test unitario valido

- Prueba un unico comportamiento observable, no una implementacion interna.
- Es deterministico: el mismo input produce siempre el mismo output.
- Es independiente: no depende del orden de ejecucion ni del estado compartido con otros tests.
- Falla por una unica razon: el mensaje de error identifica exactamente el comportamiento roto.

### Cuando usar mocks y cuando no

Usar mocks exclusivamente para:
- Dependencias externas que introducen no-determinismo (reloj del sistema, generadores de UUID, APIs de terceros).
- Dependencias que requieren infraestructura costosa de levantar en el contexto de un test unitario puro.

No usar mocks para:
- La base de datos en tests de integracion. Un test que pasa contra un mock pero falla contra la BD real no es un test valido — el pipeline de CI/CD debe validar contra el motor real.
- Logica de dominio propia del proyecto: si se mockea la logica que se esta probando, el test no prueba nada.

### Nomenclatura de tests

El nombre del test describe el comportamiento esperado, no la implementacion. Formato:

```
[unidad bajo prueba]_[condicion de entrada]_[resultado esperado]

calcularTotal_conDescuentoSuperiorAlTotal_devuelveCero
validarEmail_conFormatoInvalido_lanzaErrorDeValidacion
crearPedido_conStockInsuficiente_rechazaLaOperacion
```

La sintaxis exacta de implementacion depende del framework detectado en el anfitrion. El patron de nomenclatura es universal.

## Contract Testing para APIs Inter-Servicio

Cuando dos servicios se comunican a traves de una API, un cambio en el productor puede romper al consumidor sin que los tests del productor lo detecten.

### Cuando aplicar contract testing

- El servicio tiene al menos un consumidor externo conocido.
- Los equipos del productor y el consumidor trabajan de forma independiente.
- El contrato de la API ha cambiado de forma inesperada en el historial del proyecto al menos una vez.

### Nivel de implementacion segun stack detectado

| Stack | Herramienta recomendada |
|---|---|
| Node.js / TypeScript | Pact, MSW con validacion de schema OpenAPI |
| Python | pact-python, schemathesis contra spec OpenAPI |
| Go | pact-go, httptest con contratos JSON Schema |
| JVM | Pact JVM, Spring Cloud Contract |

En proyectos sin herramienta de contract testing, el minimo viable es un test de integracion que valide el schema de respuesta de cada endpoint consumido externamente, usando la especificacion OpenAPI del productor como fuente de verdad.

## Gestion de Datos de Prueba

### Principios

- Cada test crea sus propios datos y los limpia al terminar, o usa transacciones revertidas automaticamente. No depender de datos residuales de tests anteriores.
- Los fixtures estaticos son aceptables para datos de referencia inmutables (catalogos, codigos de pais). No para entidades de negocio que cambian de forma.
- Las factories generan instancias validas con valores por defecto sobreescribibles. Reducen el acoplamiento entre el test y la estructura interna del modelo.

### Estrategia por tipo de test

| Tipo | Estrategia de datos recomendada |
|---|---|
| Unit | Objetos construidos inline. Sin base de datos ni infraestructura. |
| Integracion | Factory + transaccion revertida al finalizar el test. |
| E2E | Seeder de estado conocido antes de la suite. Limpieza post-suite. |

## Cobertura de Tests

### Que mide y que no mide la cobertura

La cobertura de lineas o ramas mide que codigo fue ejecutado durante los tests, no que comportamientos fueron verificados correctamente. Un test que llama a todas las lineas sin hacer aserciones reporta 100% de cobertura sin valor real.

Usar la cobertura como indicador de brechas, no como objetivo en si mismo.

### Umbrales orientativos por capa

| Capa | Umbral minimo orientativo |
|---|---|
| Logica de negocio (servicios, dominio) | 85% de ramas |
| Controladores / Routers | 70% de ramas |
| Repositorios | 60% de ramas (cubierto principalmente por tests de integracion) |
| Configuracion e infraestructura | Sin umbral. Verificar via smoke tests en staging. |

El umbral exacto se define en el `CLAUDE.md` local del anfitrion. Si no esta definido, usar los valores anteriores como punto de partida y proponerlos para su aprobacion.

Esta tabla es el piso minimo orientativo, valido para cualquier stack. `backend-architect` y `frontend-design` definen umbrales mas altos para sus capas especificas (objetivo AAA) — no son valores en competencia: si el proyecto no declara un objetivo propio, el umbral de `qa-engineer` es el minimo aceptable y el de la especialidad correspondiente es la meta a perseguir.

## Gate de Calidad Medible

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Cobertura de ramas en logica de negocio | >= 85% (ver tabla de umbrales por capa de este skill) | Reporte de cobertura del framework detectado (`--coverage` en Jest/Vitest, `pytest --cov`) sobre el directorio de dominio, no el proyecto completo |
| Mutation score en modulos criticos de negocio | >= 60% de mutantes eliminados | Stryker (JS/TS) o `mutmut`/`cosmic-ray` (Python) ejecutado sobre el modulo, no sustituye a la cobertura de lineas — la complementa |
| Tests de contrato desactualizados respecto al productor | 0 contratos con mas de 1 release de diferencia sin re-verificar | Pact Broker `can-i-deploy` en el pipeline de CI/CD, o verificacion manual de version de schema OpenAPI si no hay broker |
| Flakiness de la suite | < 1% de reintentos exitosos sobre 20 ejecuciones consecutivas en CI | Ejecutar la suite completa 20 veces en el runner de CI y contar tests que fallan intermitentemente sin cambio de codigo |
| Tiempo total de la suite unitaria | < 2 minutos en CI para dar feedback rapido al PR | Tiempo reportado por el job de CI (GitHub Actions, GitLab CI) para el step de tests unitarios |

Ningun umbral de esta tabla sustituye los umbrales de cobertura por capa ya definidos en este skill — el mutation score y el flakiness son gates adicionales, no reemplazos.

## Referencias bajo demanda

Contenido expansivo movido a `references/` (divulgacion progresiva) para mantener este SKILL.md nucleo liviano. Cargar el archivo correspondiente cuando la tarea lo requiera:

- `references/qa-testing-llm.md` — Testing de features con LLM integrado.
- `references/qa-vanguardia-contratos.md` — Estrategia de testing de vanguardia y contract testing verificable.
- `references/qa-destructivo.md` — QA destructivo: fuzzing, chaos testing e historial de fallos.

## Lista de Verificacion de Revision de PR — Calidad

Verificar en orden antes de aprobar un PR. Un PR con observacion en cualquier punto no se aprueba.

1. Cobertura: el PR no reduce la cobertura global por debajo del umbral acordado.
2. Nomenclatura: los tests describen comportamientos esperados, no implementaciones internas.
3. Mocks: los mocks estan justificados. No hay mocks de BD en tests de integracion.
4. Independencia: los tests no dependen del orden de ejecucion ni dejan estado residual.
5. Contratos: si el PR modifica un endpoint consumido externamente, existe un test de contrato actualizado.
6. Datos: los tests crean y limpian sus propios datos. Sin dependencia de datos residuales.
7. Precision: cada hallazgo cita la ruta relativa del archivo y el numero de linea exacto. Sin esta referencia, el hallazgo no es accionable.

## Lista de Verificacion de PR — QA

- [ ] Los tests cubren el camino feliz, el caso limite y el caso de fallo esperado.
- [ ] Ninguna recomendacion de framework fue emitida sin leer el manifiesto del anfitrion.
- [ ] Los tests de integracion usan BD real, no mocks de repositorio.
- [ ] Cada test crea y limpia sus propios datos sin dependencia de orden.
- [ ] La cobertura del modulo no baja del umbral acordado.
- [ ] Cada hallazgo cita ruta relativa + numero de linea exacto.

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables.
- Leer los manifiestos del anfitrion antes de recomendar cualquier framework de testing.
- Documentar la justificacion antes de proponer reduccion de cobertura.
- Reservar mocks de BD exclusivamente para tests unitarios — nunca en tests de integracion.
