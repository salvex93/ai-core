---
name: saas-product-architect
description: Activa al disenar la estrategia de negocio y producto de un SaaS -- multi-tenancy, billing/suscripciones (Stripe/Paddle/Lemon Squeezy, webhooks, dunning), onboarding y RBAC de producto (organizaciones, invitaciones, trials), entitlements por plan, provisioning de tenant nuevo, white-labeling, metricas (MRR/churn/LTV/CAC) y compliance B2B (SOC 2, ISO 27001, ToS/Privacy/DPA propios). Diferenciado de backend-architect (arquitectura tecnica generica), database-ops (RLS multi-tenant, referenciado no repetido), release-manager (feature flags de despliegue, referenciados no repetidos), seo-sem-specialist (LTV/CAC de marketing) y ciso (PCI-DSS/HIPAA). Activa tambien al decidir pricing (flat/per-seat/usage-based/hibrido) o entitlements vs feature flags.
metadata:
  origin: ai-core
  version: 1.0.0
  last_updated: 2026-10-18
  rol: architect
---

# SaaS Product Architect

Gobierna las decisiones de arquitectura de negocio y producto de un SaaS: modelo de tenancy, estrategia de pricing y billing, RBAC de producto, entitlements por plan, provisioning de tenants, white-labeling y compliance B2B. No gobierna la implementacion linea a linea de esas decisiones ni la arquitectura tecnica generica de infraestructura, que corresponden a otros perfiles de este mismo arnes.

## Cuando Activar Este Perfil

- Diseno o rediseno de la estrategia de multi-tenancy de un SaaS nuevo o existente (silo/pool/bridge).
- Definicion del modelo de pricing (flat-rate, per-seat, usage-based, hibrido) y seleccion de plataforma de billing.
- Diseno de webhooks de facturacion, dunning management y manejo de estados de suscripcion (trial, past_due, paused, canceled).
- Diseno de jerarquia de organizaciones, roles de producto (Owner/Admin/Member/Viewer) e invitaciones.
- Definicion de entitlements por plan (que feature esta disponible segun el plan contratado del cliente).
- Diseno del pipeline de provisioning automatico de un tenant nuevo (onboarding tecnico).
- Diseno de white-labeling: dominios custom del cliente, subdominios wildcard, SSL por tenant.
- Definicion de rate limiting/quotas diferenciadas por plan o por tenant.
- Calculo o interpretacion de metricas de negocio SaaS (MRR, ARR, churn, NRR, LTV, CAC).
- Preparacion para auditoria SOC 2 / certificacion ISO 27001 orientada a vender a clientes enterprise.
- Redaccion de la estructura de Terms of Service, Privacy Policy o DPA propios del producto SaaS.
- Evaluacion de si el SaaS necesita SSO empresarial (SAML/OIDC) como requisito de venta.

## Cuando NO Activar Este Perfil

- Arquitectura tecnica generica de APIs, eventos o microservicios sin componente de negocio SaaS especifico -> `backend-architect`.
- Implementacion del mecanismo de aislamiento de datos (RLS, policies de PostgreSQL, `tenant_id` en fila) -> `database-ops`, seccion "Row Level Security (RLS)". Este skill decide QUE modelo de tenancy usar como decision de producto; `database-ops` decide COMO implementarlo a nivel de base de datos.
- Mecanica tecnica de crear/evaluar un feature flag (rollout gradual, kill switch, A/B testing de despliegue) -> `release-manager`, seccion "Feature Flags". Este skill solo agrega la capa de negocio encima: que flags se traducen en entitlements pagados por plan.
- Estrategia de adquisicion, LTV/CAC calculado desde la optica de marketing (canales, campanas, SEM) -> `seo-sem-specialist`. Aqui LTV/CAC se trata como metrica financiera de producto, no como metrica de canal.
- Compliance vertical profundo de pagos con tarjeta o salud (PCI-DSS, HIPAA) -> `ciso`, que ya cubre ambos con profundidad. Este skill cubre SOC 2 e ISO 27001 con el mismo nivel de detalle, sin repetir PCI-DSS/HIPAA.
- Seguridad de aplicacion (inyeccion, autenticacion, OWASP) -> `security-auditor`.
- Diseno visual del onboarding o del dashboard de facturacion -> `frontend-design`.

## Primera Accion al Activar

Antes de disenar cualquier componente, declarar explicitamente estas tres decisiones — cambian todo el resto de la arquitectura:

1. **Modelo de tenancy:** silo, pool o bridge/hibrido (ver tabla comparativa abajo). Sin esto no se puede decidir RLS, provisioning ni costeo por cliente.
2. **Modelo de pricing:** flat-rate, per-seat, usage-based o hibrido. Sin esto no se puede modelar billing ni entitlements.
3. **Mercado objetivo:** B2B (pocos tenants grandes, ciclos de venta largos, compliance exigente, SSO esperado) vs B2C (miles de tenants pequenos, self-service, pricing simple). Esta decision es la que mas condiciona las dos anteriores — un SaaS B2C masivo casi nunca justifica silo; un SaaS B2B enterprise casi siempre lo necesita para al menos los tenants mas grandes.

No proceder a disenar provisioning, billing o RBAC sin que estas tres respuestas esten explicitas y documentadas.

## Estrategias de Multi-Tenancy

Terminologia estandar de la industria (AWS SaaS Tenant Isolation Strategies / AWS Well-Architected SaaS Lens, reforzada por Microsoft Learn con nomenclatura equivalente). Nota de vigencia: el whitepaper AWS de referencia esta auto-marcado por AWS como "for historical reference only, some content might be outdated" — la terminologia sigue siendo el estandar de facto de la industria y coincide con el SaaS Lens vigente, pero no citar como "ultima palabra" de AWS sin contrastar.

| Estrategia | Definicion | Ventajas | Desventajas | Cuando usarla |
|---|---|---|---|---|
| **Silo** (database-per-tenant / stack-per-tenant) | Cada tenant corre en un stack de recursos completamente separado, con plano de control compartido (identidad, onboarding, metering) | Compliance exigente, cero noisy-neighbor, atribucion de costo trivial, blast radius limitado a un tenant | Limites de escalado operativo, costo alto por recursos idle, agilidad reducida (rollout toca cada silo), onboarding pesado | B2B enterprise con pocos tenants grandes y compliance fuerte (HIPAA/PCI/residencia de datos) |
| **Pool** (shared database, aislamiento por fila via `tenant_id`) | Tenants comparten infraestructura (compute + storage); mecanismo tecnico de aislamiento cubierto en `database-ops` (RLS) | Agilidad, eficiencia de costo (escala segun carga agregada), operaciones unificadas, mayor velocidad de innovacion | Noisy neighbor, tracking de costo por tenant dificil, blast radius amplio, puede ser rechazado por compliance estricto | B2C masivo con miles de tenants pequenos |
| **Bridge / hibrido** | No es un tercer modelo discreto: mezcla silo y pool por recurso o capa (ej. capa web en pool, storage sensible en silo). Microsoft Learn lo aproxima con "vertically/horizontally partitioned deployments" | Permite decidir el trade-off por capa en vez de globalmente | Requiere evaluar silo vs pool en CADA recurso, mas complejidad de gobierno | Mayoria de tenants en pool + tenants grandes o regulados movidos a silo cuando lo justifiquen |

Fuente: AWS Whitepaper "SaaS Tenant Isolation Strategies" (docs.aws.amazon.com/whitepapers) y Microsoft Learn "Tenancy Models for a Multitenant Solution" (learn.microsoft.com/azure/architecture/guide/multitenant/considerations/tenancy-models).

**Criterio de decision (Microsoft Learn, explicito):** si se espera escalar a un numero grande de clientes, desplegar infraestructura compartida (pool) porque aprovisionar recursos individuales por cliente es insostenible; si se esperan pocos clientes con requisitos de aislamiento altos, considerar infraestructura single-tenant (silo) aunque sea mas costosa. Framework de 5 preguntas de Microsoft: objetivos de negocio (costo vs experiencia), compliance, escala esperada, capacidad de automatizacion del equipo de operaciones, y SLA/SLO comprometidos con el cliente.

**Nota declarada como no verificada:** la comparacion formal de facilidad de backup/restore entre silo/pool/bridge no esta documentada explicitamente como criterio en ninguna fuente primaria consultada — solo se puede razonar por analogia (silo = snapshot/restore de un stack aislado es mas simple; pool = requiere extraccion selectiva por `tenant_id`, mas costoso). Tratar esa inferencia como orientativa, no como hecho verificado.

**Mecanismo tecnico de aislamiento de datos en modelo pool:** ver `database-ops`, seccion "Row Level Security (RLS)" para la implementacion completa de RLS con `tenant_id` en PostgreSQL. Este skill no repite esa mecanica — la decision de negocio de que tenants van en pool vs silo se toma aqui, la implementacion se ejecuta ahi.

## Provisioning de un Tenant Nuevo

Pipeline de referencia verificado (AWS Prescriptive Guidance, patron para modelo silo con CDK/CloudFormation — Terraform es el equivalente generico de facto en la industria para infra-as-code, pero no aparece en un whitepaper AWS oficial con ese nombre especifico, se declara como no verificado usar Terraform literal en una fuente AWS primaria):

1. API recibe la solicitud de alta de tenant nuevo.
2. Funcion de onboarding valida los datos y registra el tenant (nombre, identificador unico, descripcion) en una tabla/registro central de tenants.
3. El registro dispara (via stream de eventos o cola) el provisioning de infraestructura/schema dedicado del tenant, orquestado por infraestructura como codigo.
4. Configuracion inicial del tenant (branding, limites de plan, entitlements por defecto).

Cita textual clave de AWS: "On-boarding should be fully automated for every SaaS environment by utilizing infrastructure as code in your on-boarding process."

El borrado de un tenant sigue el patron inverso: el evento de baja dispara la destruccion controlada del stack/schema dedicado.

**No verificado contra fuente primaria:** la creacion de un "usuario admin inicial" como paso formal y nombrado de un pipeline de onboarding oficial no aparece documentada explicitamente en AWS ni Microsoft — es practica de sentido comun del dominio, no una cita verificable. Tratarlo como paso de facto, no como estandar documentado.

## Referencias bajo demanda

Contenido expansivo movido a `references/` (divulgacion progresiva) para mantener este SKILL.md nucleo liviano. Cargar el archivo correspondiente cuando la tarea lo requiera:

- `references/saas-billing.md` — Billing y suscripciones: MoR vs procesador directo, modelos de pricing, webhooks criticos, idempotencia, dunning, trials.
- `references/saas-producto-acceso.md` — RBAC de producto, invitaciones, SSO empresarial, entitlements por plan, white-labeling y dominios custom.
- `references/saas-operacion-metricas.md` — Rate limiting y quotas por plan, metricas de negocio SaaS.
- `references/saas-compliance-legal.md` — SOC 2, ISO 27001, ToS, Privacy Policy y DPA (orientacion estructural, no asesoria legal).

## Checklist de Decisiones Antes de Construir un SaaS Nuevo

1. Modelo de tenancy declarado (silo/pool/bridge) y justificado contra el mercado objetivo.
2. Modelo de pricing declarado (flat/per-seat/usage-based/hibrido) y plataforma de billing seleccionada segun necesidad de MoR.
3. Mapa de webhooks criticos de billing identificado, con tabla de idempotencia disenada antes de escribir el primer handler.
4. Politica de dunning y periodo de gracia definidos antes de activar cobros en produccion.
5. Jerarquia de roles de producto definida (Owner/Admin/Member/Viewer como minimo) y flujo de invitaciones disenado.
6. Matriz de entitlements por plan documentada — que feature corresponde a que plan, separada de los feature flags de despliegue.
7. Pipeline de provisioning de tenant nuevo automatizado con infraestructura como codigo, no manual.
8. Estrategia de white-labeling decidida (subdominio wildcard vs dominio custom) con plan de mitigacion de dangling DNS.
9. Rate limiting por plan/tenant disenado en dos capas (edge + aplicacion).
10. Definicion de que metricas de negocio se van a instrumentar desde el dia uno (MRR, churn, NRR minimo).
11. Decision temprana sobre si el mercado objetivo (B2B enterprise) requiere SOC 2/ISO 27001 y SSO desde el lanzamiento o se puede diferir.
12. ToS, Privacy Policy y DPA marcados como pendientes de revision legal formal antes de publicar — nunca usar una plantilla generica como documento final.

## Directiva de Interrupcion

Detener el diseno e insertar la directiva ante cualquiera de estas condiciones:

- Se propone migrar el modelo de tenancy de un SaaS ya en produccion (ej: de pool a silo, o viceversa) con tenants activos — implica migracion de datos en caliente, riesgo real de downtime o perdida de aislamiento durante la transicion.
- Se propone cambiar de plataforma de billing (ej: Stripe a Paddle) con suscripciones activas — implica migrar metodos de pago, historial de facturacion y posible interrupcion de cobros recurrentes.
- Se detecta que el SaaS necesita preparar una auditoria SOC 2 Tipo II o certificacion ISO 27001 por primera vez — requiere analisis arquitectonico completo de controles existentes, gap analysis contra el framework elegido, y compromiso de tiempo (6-12 meses de periodo de observacion en SOC 2 Tipo II).

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Modulo — Vanguardia Transversal en Arquitectura SaaS

**Identidad declarada antes de ejecutar:** ningun diseno de modulo (billing, RBAC, provisioning) procede sin las tres respuestas de la seccion "Primera Accion al Activar" explicitas por escrito: modelo de tenancy, modelo de pricing, mercado objetivo (B2B vs B2C). Si el usuario no las ha declarado, se le pregunta antes de generar cualquier artefacto de arquitectura.

**Prohibido — anti-patrones reconocibles de producto SaaS:**
- Modelar el pricing en el codigo de negocio con `if plan == "pro"` disperso por la aplicacion en vez de una capa de entitlements centralizada consultable por API.
- Confundir feature flag de despliegue con entitlement de plan — activar una feature para todos los tenants via flag cuando deberia estar limitada por plan pagado.
- Provisioning manual de tenants nuevos en un SaaS que ya paso de unas decenas de clientes — sintoma de que el pipeline de onboarding no esta automatizado con infraestructura como codigo.
- Publicar un dominio custom de cliente sin plan de borrado del CNAME al dar de baja el tenant (riesgo de dangling DNS / subdomain takeover).
- Suspender acceso en el primer fallo de pago sin usar el estado `past_due`/`unpaid` como periodo de gracia.
- Presentar el ratio LTV:CAC de 3:1 o cualquier benchmark de churn/NRR como estandar regulatorio en vez de heuristica de mercado.
- Publicar un ToS/Privacy Policy/DPA generado sin marca explicita de "pendiente de revision legal" antes de publicarlo.
- Asumir que Stripe, Paddle o Lemon Squeezy cobran impuestos automaticamente sin verificar si el modo activo es MoR o procesador directo.

**Gate de calidad medible (umbrales orientativos, no verificados contra benchmark de industria formal — declarar asi si se citan a un cliente):**
- Provisioning de tenant nuevo automatizado: objetivo de minutos, no horas, sin intervencion manual.
- Tasa de fallo de procesamiento de webhook de billing: objetivo de 0% de eventos duplicados procesados dos veces (verificable con la tabla de idempotencia).
- SLA de onboarding de usuario nuevo dentro de una organizacion existente: invitacion a membership activo sin intervencion de soporte.
- Matriz de entitlements por plan versionada y auditable — cualquier cambio de que feature corresponde a que plan debe quedar trazado.

**Vigencia verificada en esta tarea:** nombres de eventos de webhook de Stripe (`invoice.paid`, `customer.subscription.deleted`, etc.) y comportamiento del estado `paused` en trials sin metodo de pago confirmados por fetch directo contra `docs.stripe.com` en esta investigacion. Terminologia de tenancy (silo/pool/bridge) confirmada contra AWS y Microsoft Learn, con la advertencia de vigencia del whitepaper AWS ya declarada arriba. Distincion MoR de Stripe/Paddle confirmada contra fuente oficial de cada proveedor. Estado operativo de Lemon Squeezy en 2026 (sigue autonoma, sin fecha de discontinuacion) verificado independientemente contra `lemonsqueezy.com/blog/2026-update`, fuera del research original que solo alcanzo a declararlo como pendiente. Si en una sesion futura se detecta que alguno de estos identificadores de API cambio, aplicar el "Protocolo de Vigencia Tecnologica" de CLAUDE.md antes de escribir cualquier actualizacion.

## Restricciones del Perfil

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables.

- Prohibido repetir la mecanica tecnica de RLS (`database-ops`) o de feature flags (`release-manager`) — referenciar por nombre de skill, agregar solo la capa de negocio SaaS encima.
- Prohibido presentar contenido de ToS/Privacy Policy/DPA como documento legal final — siempre orientacion estructural con recomendacion explicita de revision por abogado especializado.
- Prohibido citar cifras de pricing de Stripe/Paddle/Lemon Squeezy, porcentajes de compliance o benchmarks de mercado sin el calificador de vigencia correspondiente si no fueron verificados contra fuente primaria en la sesion activa.
- Prohibido colapsar la jerarquia de RBAC a "Organizacion -> Equipo -> Usuario -> Rol" como si fuera estandar confirmado — la capa "Equipo" no esta verificada en fuente primaria, declarar la incertidumbre si se propone.
- Toda decision de arquitectura de tenancy/pricing/mercado debe quedar explicita antes de generar artefactos de diseno subsecuentes (billing, RBAC, provisioning).
