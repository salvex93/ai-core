---
name: product-lifecycle-orchestrator
description: Orquesta el ciclo de vida COMPLETO de un producto o feature, desde la definicion de historias de usuario hasta el hypercare post-golive, delegando cada etapa al skill especializado correspondiente en vez de duplicar su contenido. Cubre 5 marcos agnosticos de herramienta -- User Story Mapping (Jeff Patton), criterio INVEST (Bill Wake), priorizacion MoSCoW (DSDM), BDD/Gherkin (Dan North, Gojko Adzic) y Domain-Driven Design estrategico (Eric Evans, Martin Fowler). Activa al pedir generar historias de usuario, epicas o backlog de producto, al priorizar alcance de una release, al escribir criterios de aceptacion antes de codificar, o al planificar un go-live con soporte post-lanzamiento.
origin: ai-core
version: 1.0.0
last_updated: 2026-08-14
rol: architect
---

# Product Lifecycle Orchestrator

Gobierna la fase de DEFINICION DE PRODUCTO que hoy no cubre ningun skill de ai-core, y actua como punto de entrada que conecta esa definicion con el resto del ciclo tecnico ya existente. No reemplaza a `dev-loop` (ciclo de gates de UNA tarea tecnica puntual: Spec->Design->Plan->Build->Review) ni a `saas-product-architect` (estrategia de negocio B2B: billing, multi-tenancy, RBAC) -- se activa ANTES de ambos, cuando todavia no existe una tarea tecnica delimitada, solo una necesidad de negocio o una idea de feature.

Complementos por etapa (ver "Mapa de Delegacion" mas abajo): `dev-loop`, `saas-product-architect`, `backend-architect`/`tech-lead-frontend`, `qa-engineer`, `release-manager`, `llm-observability`, `devops-infra`.

---

## Cuando Activar Este Perfil

- Al pedir generar historias de usuario, epicas, o un backlog de producto desde cero.
- Al priorizar el alcance de una release o sprint (que entra, que no).
- Al necesitar criterios de aceptacion verificables antes de que exista codigo.
- Al planificar un producto/feature que involucra mas de un dominio de negocio (ej. catalogo + facturacion) y hay riesgo de acoplarlos por error.
- Al preparar un go-live real y su periodo de soporte post-lanzamiento.
- Al retomar un backlog o mapa de historias entre sesiones.

## Cuando NO Activar Este Perfil

- Ya existe una historia de usuario o tarea tecnica bien delimitada y aprobada -> ir directo a `dev-loop`.
- La tarea es puramente de arquitectura de negocio SaaS (billing, tenancy, entitlements) sin necesidad de generar historias nuevas -> `saas-product-architect`.
- El cambio es trivial (una linea, scope claro, sin ambiguedad de alcance) -> no requiere este nivel de definicion.
- La tarea es solo escribir tests para codigo que ya existe -> `qa-engineer`.

---

## Primera Accion al Activar

Antes de generar cualquier historia o backlog, identificar en que punto del ciclo esta la conversacion:

1. ¿El usuario ya trajo una lista de features/ideas sin estructurar? -> comenzar en la etapa 1 (Definicion), aplicando la jerarquia de Patton para agruparlas.
2. ¿Ya existen Activities/User Tasks pero sin priorizar? -> saltar a la etapa 2 (Priorizacion, MoSCoW).
3. ¿Ya hay Stories priorizadas pero sin criterios de aceptacion? -> saltar a la etapa 3 (Especificacion, Gherkin).
4. ¿Se esta preparando un go-live de algo ya implementado? -> saltar directo a la seccion de Hypercare.

Si MCP gemini-bridge esta disponible y el contexto del negocio/producto no fue analizado en esta sesion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta si existe backlog, historias de usuario, roadmap o documentacion de producto previa en el repositorio")
```

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No avanzar sin confirmacion:

- Una Activity/Epic propuesta cruza 2+ Bounded Contexts sin que el usuario haya declarado cual relacion de Context Mapping (Shared Kernel, Customer-Supplier, Anticorruption Layer) aplica.
- El backlog resultante de MoSCoW supera 60% de esfuerzo en "Must have" -- señalar el desbalance antes de continuar a especificacion.
- Se va a planificar un go-live sin que exista un Runbook probado ni plan de rollback declarado.
- El usuario pide saltarse el filtro INVEST "para ir mas rapido" en una Story que va a consumir mas de una semana-persona.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

Insertar este marcador cuando una Activity/Epic requiere decisiones de Bounded Context que afectan arquitectura tecnica existente (ej. dividir un modulo ya en produccion en dos contextos separados) -- esa decision escala a `backend-architect`/`tech-lead-frontend` con el nivel de razonamiento de diseño de sistema, no se resuelve dentro de este skill.

---

## Los 5 Marcos (fuente primaria verificada, no interpretacion de terceros)

### 1. Jerarquia de Historias -- Jeff Patton, User Story Mapping

Correccion de terminologia frecuente: Patton **rechaza explicitamente el termino "Epic"** ("I hate that word 'epic'", jpattonassociates.com/the-new-backlog/). Su jerarquia real de tres niveles es:

```
ACTIVITY   -> "algo grande que la gente hace, con muchos pasos, sin flujo preciso"
                (ej. "gestionar correo")
  USER TASK  -> historia intermedia que descompone la actividad
                (ej. "enviar mensaje", "leer mensaje", "marcar como spam")
    USER STORY -> unidad construible en una iteracion
                (ej. "Como consultor quiero gestionar mi correo para
                mantenerme al dia con clientes, colegas y amigos")
```

Si el proyecto anfitrion o el cliente ya usa la terminologia "Theme/Epic/Feature/Story" (comun en Jira/Azure DevOps), no corregir por pedanteria -- usar el vocabulario del anfitrion, pero mantener internamente la logica de 3 niveles reales de Patton (agrupacion amplia -> flujo intermedio -> unidad de valor) para no perder la estructura.

### 2. Criterio INVEST -- Bill Wake (xp123.com/articles/invest-in-good-stories-and-smart-tasks/)

Filtro de calidad obligatorio para CADA User Story generada, antes de entregarla:

| Letra | Criterio | Pregunta de verificacion |
|---|---|---|
| I | Independent | ¿Se puede implementar y programar en cualquier orden respecto a otras historias? |
| N | Negotiable | ¿Es una promesa de conversacion, no un contrato cerrado de features? |
| V | Valuable | ¿Es valiosa especificamente para el cliente/usuario, no solo para el equipo tecnico? |
| E | Estimable | ¿El equipo puede darle un tamaño aproximado, aunque no exacto? |
| S | Small | ¿Cabe en como maximo unas pocas semanas-persona? |
| T | Testable | ¿Se podria escribir un test para ella hoy mismo? |

Una historia que falla 2+ criterios no esta lista -- dividirla o reescribirla antes de pasarla a MoSCoW o a `dev-loop`.

### 3. Priorizacion MoSCoW -- DSDM / Agile Business Consortium (agilebusiness.org/dsdm-project-framework/moscow-prioritisation.html)

| Categoria | Definicion oficial | Regla de esfuerzo |
|---|---|---|
| Must have | "Minimum Usable SubseT" -- sin esto, no tiene sentido entregar la solucion | Maximo 60% del esfuerzo total |
| Should have | Importante pero no vital -- la solucion sigue siendo viable sin ello, posible workaround | -- |
| Could have | Deseado pero de menor impacto si se deja fuera -- reserva de contingencia | Recomendado ~20% del esfuerzo |
| Won't have (this time) | Acordado explicitamente fuera de este periodo -- se registra para evitar reintroduccion accidental | -- |

Anti-patron a evitar activamente: si mas del 60% del backlog termina en "Must have", el ejercicio de priorizacion fallo -- señalarlo al usuario en vez de aceptar el backlog tal cual.

### 4. BDD y Gherkin -- Dan North (dannorth.net/blog/introducing-bdd/), Gojko Adzic (Specification by Example), cucumber.io/docs/gherkin/reference

Cada User Story que pase el filtro INVEST y quede priorizada (Must/Should have) recibe sus criterios de aceptacion en Gherkin antes de pasar a `dev-loop`:

```gherkin
Feature: <descripcion de la Feature/User Task>
  Scenario: <nombre concreto del caso>
    Given <contexto inicial, con VALORES CONCRETOS, no genericos>
    And <contexto adicional si aplica>
    When <accion o evento, una sola accion por escenario>
    Then <resultado esperado, verificable sin ambiguedad>
    But <negacion del resultado, si aplica>
```

Ejemplo bien escrito (automatizable):
```gherkin
Scenario: Retiro rechazado por saldo insuficiente
  Given la cuenta 4021 tiene un saldo de 50 USD
  When el titular solicita un retiro de 200 USD
  Then el sistema rechaza la operacion
  And el saldo de la cuenta permanece en 50 USD
```

Anti-patron a rechazar activamente: escenarios sin valores concretos ("el usuario tiene dinero"), o con resultado no verificable ("deberia fallar si corresponde") -- esto genera pasos no automatizables en Cucumber/SpecFlow/behave, el objetivo real de escribir Gherkin.

### 5. DDD Strategic Design -- Eric Evans, Martin Fowler (martinfowler.com/bliki/BoundedContext.html)

Antes de agrupar User Tasks en una Activity/Epic, verificar que no cruce mas de un Bounded Context. Un Bounded Context es un limite donde un modelo de dominio es internamente consistente y usa su propio Lenguaje Ubicuo -- fuera de ese limite, el mismo termino puede significar algo distinto (ej. "Producto" en Catalogo != "Producto" en Facturacion).

Relaciones documentadas entre Bounded Contexts (Context Mapping, Eric Evans):
- **Shared Kernel**: submodelo compartido explicitamente, cambios coordinados entre equipos.
- **Customer-Supplier**: un BC upstream provee, el downstream depende y negocia prioridades.
- **Anticorruption Layer**: el BC consumidor traduce el modelo externo al propio, evitando que lo corrompa.

Anti-patron a detectar activamente: una Activity/Epic que cruza 2+ Bounded Contexts sin declarar cual relacion de Context Mapping aplica -- señalarlo antes de que llegue a `dev-loop`, porque ahi ya es un problema de arquitectura, no de definicion de producto.

---

## Flujo del Ciclo Completo

```
1. DEFINICION    -> Activity/User Task/User Story (Patton) + filtro INVEST (Wake)
2. PRIORIZACION  -> MoSCoW (DSDM) sobre las Stories que pasaron INVEST
3. ESPECIFICACION -> Gherkin (North/Adzic) para cada Story Must/Should have
4. DELIMITACION  -> Bounded Context (Evans/Fowler) por Activity/Epic antes de asignar a arquitectura
5. IMPLEMENTACION -> delega a dev-loop (por cada Story) + backend-architect/tech-lead-frontend (Design)
6. TESTING       -> delega a qa-engineer (estrategia de tests) usando los escenarios Gherkin como base
7. RELEASE       -> delega a release-manager (versionado, branching, plan de rollback)
8. HYPERCARE     -> ver seccion dedicada abajo
```

## Mapa de Delegacion (no duplicar, co-activar)

| Etapa | Skill al que delega | Que NO hace este skill ahi |
|---|---|---|
| Arquitectura tecnica de la Feature | `backend-architect` / `tech-lead-frontend` | No decide contratos de API ni modelos de datos -- solo delimita el Bounded Context que los acota |
| Estrategia de negocio SaaS (billing, tenancy, entitlements) | `saas-product-architect` | No decide modelo de pricing ni RBAC de producto -- si una Story menciona "plan pagado", remite ahi |
| Ciclo tecnico de UNA Story ya definida | `dev-loop` | No genera Spec/Design/Plan/Build/Review -- entrega la Story + Gherkin como INPUT de la Fase 1 de dev-loop |
| Estrategia de testing y cobertura | `qa-engineer` | No define la piramide de tests ni umbrales de cobertura -- entrega los escenarios Gherkin como contrato de aceptacion |
| Versionado, branching, CI/CD, rollback | `release-manager` | No decide estrategia de branching ni plan de rollback -- entrega que Stories/Features van en la release segun MoSCoW |
| Observabilidad de sistemas con LLM en produccion | `llm-observability` | Si la Feature integra un LLM, remite ahi para instrumentacion -- no la duplica |
| Infraestructura y despliegue | `devops-infra` / `cloud-deployment-specialist` | No decide la infraestructura -- solo aporta el criterio de "Definition of Done" a nivel release que la infraestructura debe soportar |

---

## Hypercare / Soporte Post-Golive

Fuente: terminologia ITIL equivalente "Early Life Support" (Microsoft Learn, learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/transition-to-support-operations); Google SRE Production Readiness Review (sre.google/sre-book/launch-checklist/).

**Antes del go-live**, exigir que exista (Definition of Done extendido a nivel release, Atlassian atlassian.com/agile/project-management/definition-of-done):
- Runbook probado con pasos de recuperacion ante incidentes (no solo "los tests pasan").
- Plan de release con cronograma de corte y plan de rollback -> delegar a `release-manager`.
- Observabilidad minima (logs, metricas, alertas) configurada ANTES de exponer a produccion real -> delegar a `llm-observability` si el sistema usa LLM, o `devops-infra` si no.

**Durante hypercare** (duracion tipica 1-4 semanas; hasta 4-12 semanas en sistemas enterprise complejos, fuente Panorama Consulting):
- Monitoreo intensivo de metricas operacionales -- no es el monitoreo regular, es reforzado y con umbrales de alerta mas sensibles temporalmente.
- SLAs temporales mas estrictos que el soporte regular.
- Triage acelerado: cualquier incidente detectado en esta ventana se prioriza sobre trabajo nuevo.

**Criterios de salida de hypercare hacia soporte regular** (declarar explicitamente antes de iniciar, no improvisar al final):
- Incidentes operacionales bajan a niveles de soporte normal.
- Metricas de performance alcanzan el benchmark esperado definido en el Runbook.
- Adopcion de usuarios se estabiliza (si aplica).

Nota de honestidad de fuente: no existe una metodologia formal unica publicada con URL verificable de consultoras (Deloitte "Extended Go-Live Support", Accenture "PGLS") -- son terminos de practica documentados solo en foros profesionales, no en fuente primaria citable. Tratar como practica de industria informal, no como estandar formal.

---

## Evaluacion: ¿Requiere AGENT.md complementario?

No. Segun el criterio de 3 puntos de CLAUDE.md para crear un agente autonomo (autonomia real end-to-end sin interaccion por turno, salida estructurada verificable, uso recurrente), este skill falla el primer criterio por diseño: cada etapa (definicion, priorizacion, especificacion, delimitacion) requiere negociacion conversacional con el usuario o el cliente -- User Story Mapping es explicitamente colaborativo segun la fuente primaria de Patton, no un proceso que deba o pueda correr sin intervencion humana por turno. Es un skill puramente conversacional, correcto tal como esta.

---

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables.

Restricciones adicionales:
- No generar una User Story sin pasarla por el filtro INVEST explicitamente -- listar que criterios cumple y cuales no, no solo entregar el resultado final.
- No asignar MoSCoW sin mostrar el porcentaje de esfuerzo estimado por categoria -- si Must have supera 60%, señalarlo antes de continuar.
- No escribir Gherkin con valores geenricos ("el usuario", "algo pasa") -- exigir valores concretos o preguntar al usuario por ellos.
- No agrupar Stories en una Activity/Epic sin verificar Bounded Context -- si cruza contextos, declarar la relacion de Context Mapping aplicable o dividir la Activity.
- No inventar terminologia de Patton ("Theme", "Epic") como si fuera su modelo oficial -- aclarar la correccion la primera vez que se use el skill en una sesion, luego usar el vocabulario que el proyecto/cliente ya tenga instalado.
