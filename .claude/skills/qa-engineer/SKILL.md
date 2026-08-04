---
name: qa-engineer
description: QA Engineer Universal. Estrategia de testing, piramide de calidad, contract testing, cobertura en CI/CD, y QA destructivo (fuzzing, chaos testing, historial de fallos BUGS_HISTORY.json). Agnostico al framework: deduce la herramienta del repositorio anfitrion antes de emitir recomendaciones. Activa al definir estrategia de tests, revisar cobertura, implementar contract testing, diagnosticar regresiones, revisar si un PR tiene tests adecuados, romper el producto de forma deliberada (fuzzing/chaos testing), o registrar/consultar el historial de bugs del proyecto.
origin: ai-core
version: 2.1.0
last_updated: 2026-08-04
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

Esta tabla es el piso minimo orientativo, valido para cualquier stack. `backend-architect` y `tech-lead-frontend` definen umbrales mas altos para sus capas especificas (objetivo AAA) — no son valores en competencia: si el proyecto no declara un objetivo propio, el umbral de `qa-engineer` es el minimo aceptable y el de la especialidad correspondiente es la meta a perseguir.

## Testing de Features con LLM Integrado

Las features que usan un LLM como parte de su logica requieren una estrategia de testing en tres capas. Cada capa tiene responsabilidades distintas e inamovibles: no se solapan y no se sustituyen entre si.

Capa 1 — Tests unitarios de construccion de prompts (sin llamadas al LLM):

El objetivo es verificar que la logica determinista que construye el prompt es correcta: seleccion de contexto, truncado de historial, interpolacion de variables. Estos tests son rapidos, baratos y no requieren credenciales de API.

```typescript
describe('construirPromptResumen', () => {
  it('trunca el historial cuando supera el 60% del context window', () => {
    const historialLargo = generarMensajes(200);
    const prompt = construirPrompt({ historial: historialLargo, documento: 'contrato.pdf' });
    expect(calcularTokens(prompt.messages)).toBeLessThanOrEqual(MAX_CONTEXT * 0.6);
  });

  it('incluye el documento en el bloque delimitado correcto', () => {
    const prompt = construirPrompt({ historial: [], documento: 'contrato.pdf' });
    expect(prompt.system).toContain('<retrieved_context>');
    expect(prompt.system).toContain('</retrieved_context>');
  });
});
```

Capa 2 — Tests de integracion con grabacion HTTP (VCR/snapshot):

El objetivo es verificar que la llamada al LLM se ejecuta correctamente con el input construido y que el output se parsea y procesa sin errores. Se intercepta el trafico HTTP y se graba la primera ejecucion como snapshot. Las ejecuciones siguientes reproducen el snapshot sin llamadas reales al proveedor.

Herramientas por stack:
- Node.js: `nock` o `msw` (Mock Service Worker) con modo de grabacion.
- Python: `pytest-recording` (wrapper de `vcrpy`) o `respx` para clientes `httpx`.

Al cambiar el prompt o el modelo, borrar el snapshot existente y grabarlo de nuevo con una llamada real. Conservar el snapshot en el repositorio como artefacto de prueba versionado.

Capa 3 — Evaluacion de calidad (delegada al skill `llm-evals`):

El objetivo es medir si los outputs del LLM cumplen los criterios de calidad del sistema: faithfulness, relevancia, ausencia de alucinaciones. Esta capa no es responsabilidad del QA engineer en solitario: requiere la colaboracion del skill `llm-evals`.

El rol del QA engineer en esta capa es:
- Verificar que el golden dataset cubre los escenarios criticos de la feature.
- Confirmar que el gate de calidad `evals:llm` esta integrado en el pipeline de CI/CD (ver skill `release-manager`).
- Asegurar que existe un umbral numerico definido por metrica antes de aprobar el PR.

No corresponde al QA engineer disenar metricas LLM-as-judge ni mantener el golden dataset. Eso pertenece al skill `llm-evals`.

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

## Modulo — Estrategia de Testing de Vanguardia y Contract Testing Verificable

### Principio fundamental

Una suite de tests que pasa en verde pero no detecta una regresion real de contrato entre servicios no cumple el objetivo. El liston es que la piramide de testing sea una decision deliberada por capa de riesgo — no una plantilla de `it('deberia funcionar')` copiada del scaffold del framework. Si no se puede declarar en una frase que riesgo de negocio especifico cubre cada capa de la piramide, la estrategia no esta lista.

### Identidad de testing — declarar antes de escribir la suite

Igual que otros perfiles de este ecosistema exigen declarar una identidad antes de producir output, ninguna estrategia de testing se implementa sin declarar primero:

```
IDENTIDAD DE TESTING:
  Perfil de riesgo: [transaccional/financiero — cero tolerancia a regresion | contenido/CRUD estandar | interno/herramienta de bajo impacto]
  Contrato critico: [endpoint(s) o evento(s) consumidos por servicios externos, o "ninguno" si es monolito cerrado]
  Punto de fallo historico: [una linea — que parte del sistema ya rompio produccion antes, o "sin incidente registrado"]
  Gate de bloqueo de PR: [cobertura minima + contract test + que mas bloquea merge]
```

Si el proyecto no tiene un punto de fallo historico documentado, no inventar uno — declarar "sin incidente registrado" y proponer la primera capa de contract testing sobre el contrato de mayor riesgo detectado en el manifiesto del anfitrion.

### Prohibido — patrones reconocibles de suite de plantilla

- Tests que llaman la funcion pero no hacen ninguna asercion sobre el resultado (`expect(true).toBe(true)` o ausencia total de `expect`/`assert`), inflando cobertura sin verificar comportamiento.
- Mock de la propia base de datos en un test etiquetado como "integracion" — el nombre promete lo que el mock no cumple.
- Snapshot testing usado como sustituto de aserciones especificas (`expect(resultado).toMatchSnapshot()` sobre un objeto completo, sin que nadie revise el diff en cada PR).
- Suite E2E que reconstruye toda la logica de negocio con datos hardcodeados en vez de usar factories, duplicando el acoplamiento que el contract testing deberia evitar.
- Test de contrato que solo verifica el codigo de estado HTTP (`expect(res.status).toBe(200)`) sin validar el schema real del payload — no detecta un campo removido o renombrado.
- `describe.skip` o `it.skip` acumulados sin ticket de seguimiento, tratados como "temporalmente desactivado" durante meses.

### Gate de calidad medible

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Cobertura de ramas en logica de negocio | >= 85% (ver tabla de umbrales por capa de este skill) | Reporte de cobertura del framework detectado (`--coverage` en Jest/Vitest, `pytest --cov`) sobre el directorio de dominio, no el proyecto completo |
| Mutation score en modulos criticos de negocio | >= 60% de mutantes eliminados | Stryker (JS/TS) o `mutmut`/`cosmic-ray` (Python) ejecutado sobre el modulo, no sustituye a la cobertura de lineas — la complementa |
| Tests de contrato desactualizados respecto al productor | 0 contratos con mas de 1 release de diferencia sin re-verificar | Pact Broker `can-i-deploy` en el pipeline de CI/CD, o verificacion manual de version de schema OpenAPI si no hay broker |
| Flakiness de la suite | < 1% de reintentos exitosos sobre 20 ejecuciones consecutivas en CI | Ejecutar la suite completa 20 veces en el runner de CI y contar tests que fallan intermitentemente sin cambio de codigo |
| Tiempo total de la suite unitaria | < 2 minutos en CI para dar feedback rapido al PR | Tiempo reportado por el job de CI (GitHub Actions, GitLab CI) para el step de tests unitarios |

Ningun umbral de esta tabla sustituye los umbrales de cobertura por capa ya definidos en este skill — el mutation score y el flakiness son gates adicionales, no reemplazos.

### Vigencia — estandar mas reciente del dominio

Verificado contra fuente oficial en esta sesion: la especificacion OpenAPI vigente es la version 3.2.0, publicada el 2025-09-23 segun el blog oficial de la OpenAPI Initiative (`openapis.org/blog`) y el documento normativo en `spec.openapis.org/oas/v3.2.0.html`. Es una release menor sin cambios que rompan compatibilidad respecto a 3.1 — cualquier contract testing basado en validacion de schema OpenAPI puede seguir usando specs 3.1 existentes sin migracion obligatoria. Antes de fijar una version de spec como requisito de un contrato nuevo, confirmar contra ese dominio oficial si aplica una version mas reciente al momento de la implementacion.

Sobre la version exacta de Pact/Pact Specification vigente para cada lenguaje (Pact JS, pact-python, Pact JVM) y el detalle de PactFlow como servicio de broker gestionado: orientativo, no verificado contra fuente oficial en esta sesion — confirmar version exacta en `docs.pact.io` antes de fijarla como dependencia en un `package.json` o manifiesto equivalente, en vez de asumir la version mencionada en blogs de terceros.

## Modulo — QA Destructivo: Fuzzing, Chaos Testing y Historial de Fallos

### Principio fundamental

Un producto que solo pasa el camino feliz de sus propios tests demuestra que hace lo que su desarrollador imagino que haria — nada mas. La suite de tests unitarios y de contrato (ver Modulo — Vanguardia arriba) verifica que el sistema cumple su especificacion; el QA destructivo verifica algo distinto: que el sistema resiste el input, la carga o el fallo de infraestructura que nadie especifico porque nadie lo penso. La diferencia entre "pasa los tests" y "es resiliente" es exactamente el conjunto de casos que el desarrollador no imagino al escribir la funcion. QA destructivo busca activamente ese conjunto: fuzzing ataca la superficie de inputs de la aplicacion, chaos testing ataca la infraestructura que la sostiene, y el historial de fallos asegura que cada hallazgo se convierte en conocimiento permanente en vez de repetirse.

### Fuzzing de Inputs

Tecnica agnostica al framework — deducir del stack detectado en el proyecto anfitrion cual aplica:

- **API REST/GraphQL con schema (OpenAPI/Swagger/SDL):** fuzzing guiado por schema. La herramienta infiere el dominio valido de cada campo (tipos, formatos, enums) directamente de la especificacion y genera casos que la violan deliberadamente, incluyendo secuencias de requests con estado cuando el schema declara dependencias productor-consumidor entre endpoints.
- **Funciones puras / logica de negocio con invariante declarable:** property-based testing. El desarrollador declara una propiedad ("para todo input X, la funcion Y debe cumplir Z") y la herramienta genera casos masivos intentando refutarla, con shrinking automatico al caso minimo reproducible si falla.
- **Codigo Go nativo:** `go test -fuzz`, estable en el toolchain estandar desde Go 1.18 (GA, coverage-guided). Usa corpus semilla (`f.Add()` o `testdata/fuzz/`) mas mutador nativo; fallo = panic, `t.Fail()/t.Error()/t.Fatal()`, error no recuperable, o timeout > 1s (indicativo de deadlock).

| Stack detectado | Herramienta | Tipo |
|---|---|---|
| API con OpenAPI/Swagger | Schemathesis | Generacion guiada por schema (motor Hypothesis) |
| API REST con estado (secuencias de requests) | RESTler | Generacion guiada por schema, infiere dependencias entre endpoints |
| Python (funciones/logica de negocio) | Hypothesis | Property-based (`st.lists()`, `st.integers()`, etc.) |
| JavaScript/TypeScript (funciones/logica de negocio) | fast-check | Property-based (arbitraries + shrinking) |
| Python (fuzzing puro, sin gramatica) | Atheris | Coverage-guided mutation-based (libFuzzer), Python 3.11-3.14 |
| JVM | Jazzer | Coverage-guided in-process (libFuzzer), integra JUnit 5.9.0+ via `@FuzzTest`, sanitizers para SSRF/path traversal/command injection |
| Go nativo | `go test -fuzz` | Coverage-guided, GA desde Go 1.18 |

Criterio de fallo relevante (no ruido): crash/panic del proceso, excepcion no manejada que se propaga fuera del contrato, timeout/hang, violacion de una propiedad declarada (PBT), o violacion de schema/respuesta inconsistente con el contrato propio (ej. 500 en vez de 400 documentado). Un input malformado rechazado correctamente con el codigo de error que el schema prevé NO es un hallazgo — es el comportamiento esperado ante fuzzing.

Herramientas mencionadas pero no verificadas contra fuente oficial en esta pasada — orientativo, no verificado: AFL++ (fork mantenido de AFL, que esta archivado desde 2024-03-22), wfuzz, jsfuzz. No citar version ni comando especifico de estas sin verificacion adicional.

### Chaos Testing de Infraestructura

Distincion explicita con fuzzing: fuzzing ataca la superficie de **input de una aplicacion** (una funcion, un endpoint, un parser) buscando crashes; chaos testing ataca la **infraestructura de un sistema distribuido en runtime** (nodos, red, recursos) buscando si el sistema completo sostiene su comportamiento normal bajo fallo. Hay solapamiento de motivacion (ambos buscan resiliencia ante lo inesperado) pero no de capa — no tratar un test de carga de servicio como si fuera fuzzing de inputs, y no tratar fuzzing de un parser como si fuera chaos testing.

Principios formales (ciclo de cuatro pasos):
1. **Steady-state:** definir un output medible que indique comportamiento normal — throughput, tasa de error, percentiles de latencia. El foco es el output observable del sistema, no atributos internos.
2. **Hipotesis:** postular que el steady-state se mantendra tanto en el grupo de control como en el experimental sometido a la perturbacion.
3. **Variar eventos del mundo real:** introducir fallos de hardware, fallos de software, particiones de red, o eventos que no son fallos (picos de trafico, eventos de escalado).
4. **Blast radius acotado:** minimizar y contener el impacto de cada experimento, con responsabilidad explicita si se ejecuta contra produccion.

| Herramienta | Estado | Alcance |
|---|---|---|
| Chaos Mesh | CNCF Incubating (no Graduated, verificado contra cncf.io/projects) | Kubernetes-nativo, CRDs (PodChaos, NetworkChaos, StressChaos, IOChaos, TimeChaos), soporta scope por namespace/labels/selectors para acotar blast radius, y `Schedule` para chaos continuo en CI |
| LitmusChaos | CNCF Incubating (no Graduated, verificado contra cncf.io/projects) | Plataforma end-to-end con ChaosHub de experimentos declarativos reutilizables |
| Gremlin | SaaS comercial, no CNCF | Ataques de recurso (CPU/memoria/disco/IO), red (blackhole/latencia/packet loss/DNS), estado (shutdown/process killer/time travel); incluye coordinacion de equipos (game days) como feature de producto |

Cuando aplica vs cuando es over-engineering: chaos testing tiene sentido cuando existe una arquitectura distribuida real con multiples servicios, dependencias de red entre procesos, o infraestructura orquestada (Kubernetes, colas, servicios externos) cuya falla parcial debe tolerarse. Un monolito sin dependencias distribuidas no necesita Chaos Mesh ni LitmusChaos — instalar un orquestador de chaos sobre un solo proceso sin topologia de red que perturbar es gasto de complejidad sin hipotesis que verificar. Empezar siempre con blast radius minimo en staging antes de escalar, nunca directo a produccion.

### Adversarial Testing de UI/API

Boundary Value Analysis (BVA) y Equivalence Partitioning (EP) — origen formal ISTQB — como checklist sistematico por campo, no exploracion ad-hoc:

- **Nulos y vacios:** ausencia del campo, string vacio, `null` explicito.
- **Valores limite (BVA):** min-1, min, min+1, max-1, max, max+1 en campos numericos y de longitud.
- **Cadenas extremadamente largas:** para detectar overflow o fallos de manejo de buffer.
- **Tipos incorrectos:** string donde se espera numero, array donde se espera objeto, boolean donde se espera string.
- **Unicode / emoji:** caracteres multibyte, RTL override, normalizacion NFC/NFD inconsistente.
- **Inyeccion basica (para detectar fallo de resiliencia, no para explotar — escalar a `security-auditor` si revela vulnerabilidad real):** comillas simples/dobles, `OR 1=1`, `<script>`, path traversal (`../../`) — vectores documentados en el OWASP WSTG (SQL/LDAP/XML/Command Injection, XSS, HTTP Parameter Pollution, Mass Assignment).

Herramientas de fuzzing manual/dirigido sobre estos vectores: Burp Suite Intruder (marcar posiciones con `§...§`; modos Sniper para fuzzear un parametro a la vez, Battering ram para repetir el mismo payload en varias posiciones, Pitchfork para payloads relacionados en paralelo, Cluster bomb para todas las combinaciones), o ffuf como equivalente open source (`ffuf -w wordlist -u http://target/FUZZ`).

Pruebas de carga como forma de romper el sistema bajo estres — nota de capa: esto opera a nivel de infraestructura/servicio, la misma categoria que describe la seccion de Chaos Testing arriba, no fuzzing de input puro; se incluye aqui porque el objetivo practico de sesion (encontrar el limite de ruptura) es compartido con el resto de este modulo. Taxonomia de tipos de test (k6/Grafana): smoke, load (carga promedio), stress (degradacion sobre el promedio), soak (carga sostenida por horas — mecanismo especifico para detectar memory leaks progresivos), spike (aumento subito), breakpoint (carga creciente hasta forzar la falla del sistema deliberadamente).

Metricas concretas de "esto se rompio":
- `http_req_duration` — disparo sostenido de p99 es la senal clasica de saturacion.
- `http_req_failed` — tasa de error de las peticiones HTTP.
- `iteration_duration` — aumento anomalo indica cuellos de botella.
- Memory leak progresivo — no es una metrica nativa de la herramienta de carga, se observa correlacionando RAM del proceso bajo prueba contra la duracion del soak test.
- Umbral (`threshold`) con exit code de falla — permite que el pipeline de CI detenga el build sin lectura humana de graficas.

### Historial de Fallos — BUGS_HISTORY.json

Vive en la raiz del proyecto anfitrion (no en ai-core, no en `.claude/`) porque es conocimiento del producto, no del arnes. Se consulta ANTES de cada sesion nueva de QA destructivo por dos razones: (a) no reintroducir un bug ya reparado, (b) priorizar fuzzing y chaos testing hacia los componentes con mayor densidad historica de bugs.

```json
{
  "id": "BUG-2026-0142",
  "fecha_deteccion": "2026-08-04",
  "severidad": "critica|alta|media|baja",
  "componente": "scripts/services/ModelRouter.js",
  "causa_raiz": "descripcion tecnica breve de la causa, no del sintoma",
  "reproduccion": "pasos o input concreto que dispara el fallo",
  "test_regresion_asociado": "tests/harness/modelrouter-fallback-provider.test.js",
  "estado": "abierto|reparado|regresion"
}
```

Patron obligatorio: **bug encontrado -> se escribe el test de regresion ANTES del fix -> el test queda permanentemente en la suite.** El test debe fallar primero (rojo), confirmando que el bug es real y esta bien entendido; solo despues se corrige el codigo hasta que el test pasa. Ningun bug se considera reparado sin ese test de regresion automatizado acompanandolo — el test no se retira despues del fix, permanece indefinidamente para que ningun cambio futuro reintroduzca el mismo fallo. Estado `regresion` marca explicitamente el caso en que un bug ya cerrado volvio a aparecer, senal de que el test de regresion asociado fallo en cubrir el caso real o fue removido indebidamente.

### Checklist de Sesion de QA Destructivo

- [ ] Se consulto `BUGS_HISTORY.json` del proyecto anfitrion antes de iniciar la sesion.
- [ ] Se identificaron los componentes con mayor densidad historica de bugs y se priorizo fuzzing/chaos hacia ellos.
- [ ] Se selecciono la tecnica de fuzzing segun la superficie real detectada (schema, funcion pura, Go nativo) — no aplicada por defecto sin justificar.
- [ ] Se evaluo si el proyecto tiene arquitectura distribuida real antes de introducir chaos testing — descartado explicitamente si es un monolito sin dependencias distribuidas.
- [ ] Si aplica chaos testing: blast radius acotado por namespace/labels/selectors, ejecutado primero en staging, nunca directo a produccion.
- [ ] Se aplico el checklist de BVA/EP (nulos, limites, cadenas largas, tipos incorrectos, unicode, inyeccion basica) sobre cada campo de input expuesto.
- [ ] Si se ejecuto prueba de carga: se definieron metricas concretas de ruptura (p99, error rate, memory leak) antes de correr el test, no despues.
- [ ] Todo hallazgo nuevo se registro en `BUGS_HISTORY.json` con causa raiz y reproduccion, no solo el sintoma.
- [ ] Todo bug confirmado tiene su test de regresion escrito ANTES del fix, y ese test permanece en la suite tras el fix.
- [ ] Se verifico que ningun bug marcado `reparado` en el historial fue reintroducido por el cambio actual.

### Nota de alcance

El 'Modulo — Estrategia de Testing de Vanguardia y Contract Testing Verificable' (identidad, prohibidos, gate y vigencia) definido mas arriba en este mismo archivo sigue aplicando integramente a este modulo — fuzzing, chaos testing e historial de fallos son una capa adicional de QA destructivo, no un reemplazo ni una duplicacion de esas reglas de identidad/gate/vigencia ya establecidas.
