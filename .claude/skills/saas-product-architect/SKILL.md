---
name: saas-product-architect
description: Activa al disenar la estrategia de negocio y producto de un SaaS -- multi-tenancy, billing/suscripciones (Stripe/Paddle/Lemon Squeezy, webhooks, dunning), onboarding y RBAC de producto (organizaciones, invitaciones, trials), entitlements por plan, provisioning de tenant nuevo, white-labeling, metricas (MRR/churn/LTV/CAC) y compliance B2B (SOC 2, ISO 27001, ToS/Privacy/DPA propios). Diferenciado de backend-architect (arquitectura tecnica generica), database-ops (RLS multi-tenant, referenciado no repetido), release-manager (feature flags de despliegue, referenciados no repetidos), seo-sem-specialist (LTV/CAC de marketing) y ciso (PCI-DSS/HIPAA). Activa tambien al decidir pricing (flat/per-seat/usage-based/hibrido) o entitlements vs feature flags.
origin: ai-core
version: 1.0.0
last_updated: 2026-08-04
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
- Diseno visual del onboarding o del dashboard de facturacion -> `ux-visual-designer` / `tech-lead-frontend`.

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

## Billing y Suscripciones

### Merchant of Record (MoR) vs procesador directo

La diferencia determina quien asume la responsabilidad legal/fiscal de recaudar y remitir impuestos (VAT/sales tax/GST), cumplimiento PCI, disputas y fraude.

| Plataforma | Rol por defecto | Detalle verificado |
|---|---|---|
| Stripe (producto estandar, Billing + Payments) | NO es MoR | El propio negocio SaaS es el merchant of record. Existe un producto especifico, **Stripe Managed Payments**, donde Stripe SI actua como MoR y gestiona sales tax/VAT/GST en mas de 80 paises — aplicable a nivel de transaccion/mercado especifico, coexiste con el modo procesador directo en otras partes del mismo negocio. Fuente: docs.stripe.com/payments/managed-payments |
| Paddle | SI es MoR (nativo) | Actua como "seller of record", recolecta y remite VAT y sales tax en nombre del vendedor. Fuente: paddle.com/support/what-is-a-merchant-of-record |
| Lemon Squeezy | SI es MoR (segun doc indexada); sigue operando de forma autonoma | Cubre sales tax, refunds, chargebacks y PCI compliance. Adquirida por Stripe en julio de 2024. Verificado independientemente (blog oficial de Lemon Squeezy, `lemonsqueezy.com/blog/2026-update`): la plataforma sigue operando en 2026, sin fecha de discontinuacion anunciada — Stripe esta migrando gradualmente usuarios hacia Stripe Managed Payments de forma opcional, no forzada. Riesgo a monitorear: cuando Stripe Managed Payments salga de beta con una comision menor (3.5% vs el 5% actual de Lemon Squeezy), la migracion podria acelerarse o Lemon Squeezy podria discontinuarse — no hay fecha anunciada para ninguno de los dos escenarios a la fecha de esta redaccion. |

Conclusion util para decision de arquitectura: si el objetivo es delegar la carga fiscal internacional completa, Paddle es MoR nativo por defecto; Stripe requiere activar explicitamente Managed Payments; Lemon Squeezy declara ser MoR y sigue operativo de forma independiente en 2026, aunque con riesgo de consolidacion futura hacia Stripe Managed Payments a monitorear antes de comprometerse a largo plazo.

### Modelos de pricing (modelado tecnico en Stripe)

| Modelo | Mecanismo en Stripe | Ejemplo |
|---|---|---|
| Flat-rate / licensed | `Price` tipo licensed atado a un `Product`; se factura `amount x quantity` por periodo | — |
| Per-seat | Caso particular de licensed; `quantity` = numero de asientos | 3 usuarios a 15 USD/mes = 45 USD/mes |
| Usage-based / metered | `Meter` + `Meter Events` (accion del cliente, customer ID, valor, timestamp); el `Meter` agrega los eventos del periodo y se adjunta a un `Price` | — |
| Tiered | Modelo documentado por Stripe, no profundizado en este material | — |
| Hibrido | Combinacion de un `Price` licensed + un `Price` metered en la misma `Subscription` via distintos subscription items | Inferencia razonable de la arquitectura Price/Product de Stripe, no es nombre citado textualmente en su documentacion — tratar como orientativo |

No hay en este material pricing monetario exacto de Stripe Managed Payments, Paddle ni Lemon Squeezy — no asumir cifras sin consultar `stripe.com/pricing`, `paddle.com/pricing` o `lemonsqueezy.com/pricing` antes de comprometerse con un cliente.

### Webhooks criticos de facturacion

| Evento de negocio | Stripe | Paddle |
|---|---|---|
| Pago exitoso | `invoice.paid`, `payment_intent.succeeded` | `transaction.completed`, `transaction.paid` |
| Pago fallido | `invoice.payment_failed`, `invoice.payment_action_required` | cubierto dentro de `subscription.updated` |
| Suscripcion cancelada | `customer.subscription.deleted` | cubierto dentro de `subscription.updated` |
| Trial por terminar | `customer.subscription.trial_will_end` | — |
| Cambio de plan / proration | `customer.subscription.updated` | `subscription.updated` (evento consolidado, cubre renovacion, upgrade/downgrade y cambios de estado en un solo evento) |
| Suscripcion pausada/reanudada | `customer.subscription.paused`, `customer.subscription.resumed` | — |
| Proxima factura | `invoice.upcoming` | — |

Fuentes: docs.stripe.com/billing/subscriptions/webhooks, developer.paddle.com/webhooks/subscriptions/subscription-updated, developer.paddle.com/webhooks/transactions/transaction-completed.

### Idempotencia de webhooks (patron obligatorio)

Ambas plataformas garantizan entrega "at-least-once" — el mismo evento puede llegar mas de una vez. Patron recomendado: tabla de eventos procesados con constraint UNIQUE sobre el ID del evento (`event.id` en Stripe, `event_id` en Paddle — distinto de `notification_id`, que identifica cada intento de entrega individual). Antes de ejecutar logica de negocio (cobrar, activar, notificar), verificar si el ID ya fue procesado; si existe, responder 200 sin reprocesar. Sin este patron: riesgo real de doble cobro o doble activacion ante reintentos del proveedor.

### Dunning management (Stripe Smart Retries, verificado)

- Reintentos configurables: 1 semana, 2 semanas, 3 semanas, 1 mes o 2 meses. Default recomendado por Stripe: 8 intentos en 2 semanas.
- No reintenta si no hay metodo de pago disponible o el emisor devolvio un "hard decline".
- Al agotar reintentos, la configuracion define el desenlace: `canceled`, `unpaid` (facturas en borrador, sin cobrar) o `past_due` (vencida indefinidamente).
- Patron de periodo de gracia: usar `past_due`/`unpaid` como ventana antes de suspender acceso, en vez de cortar en el primer fallo — esto se infiere de la existencia de esos estados intermedios, no es terminologia textual de "grace period" en la doc de Stripe.
- No verificado en este material: mecanismo de dunning especifico de Paddle o Lemon Squeezy.

### Trials sin tarjeta vs con tarjeta (verificado, Stripe)

- Con metodo de pago capturado: estado inicial `trialing`, transiciona automaticamente a `active` cuando termina el trial y el pago es exitoso.
- Sin metodo de pago al terminar el trial: la suscripcion transiciona a `paused` (no genera facturas, se reanuda cuando el cliente agrega metodo de pago). El campo `status_details.paused.subscription.type` toma el valor `trial_end_without_payment_method`. El evento `entitlements.active_entitlement_summary.updated` tambien se dispara en esta transicion — util para sincronizar el bloqueo/degradacion de acceso con el cambio de entitlements.
- Con pago inmediato fallido: estado `incomplete`; si no se paga la primera factura en 23 horas, pasa a `incomplete_expired` (terminal).
- Decidir si un tenant en `paused` se bloquea o se degrada a plan free es decision de producto de la aplicacion — Stripe solo expone el estado, no prescribe la accion.
- No verificado: duracion tipica de 14 dias y cifras de conversion opt-in (18%) vs opt-out (48%) provienen solo de blogs sin autoridad tecnica de proveedor — tratar como orientativo de industria, no como dato confirmado.

## RBAC de Producto y Onboarding de Usuarios

### Jerarquia de roles

Modelo de facto en SaaS B2B: **Owner > Admin > Member > Viewer**, ligado a la organizacion (no a un tenant tecnico — la organizacion es el concepto de negocio, el tenant puede o no mapear 1:1 a ella segun el modelo de tenancy elegido arriba).

| Rol | Alcance tipico |
|---|---|
| Owner | Acceso administrativo completo, incluye billing, transferencia de ownership, configuracion de SSO |
| Admin | Todo lo del Owner excepto billing, SSO y transferencia de ownership |
| Member | Sin acceso al panel de configuracion de la organizacion |
| Viewer | Solo lectura, sin capacidad de modificar datos |

Cadena tecnica confirmada (WorkOS): Organizacion -> Organization Membership -> Rol(es) -> Permisos. Todo membership recibe un rol default si no se asigna otro explicitamente. La asignacion ocurre por API, por dashboard manual, o por sincronizacion desde el IdP corporativo (grupos via Directory Sync) — cuando hay IdP, la asignacion del IdP tiene precedencia.

**Correccion deliberada de encuadre:** la capa intermedia "Equipo" (Organizacion -> Equipo -> Usuario -> Rol) NO esta confirmada como estandar en la fuente primaria consultada (WorkOS documenta Organizacion -> Membership directamente, sin capa de "Team" formal en su modelo de RBAC). Existe como patron de mercado en algunos productos, pero no se debe asumir como jerarquia universal confirmada — si un producto la necesita, es una decision de diseno propia, no un estandar heredado.

**Distincion RBAC de producto vs RBAC de infraestructura:** este skill cubre el RBAC de producto (roles de negocio ligados al plan, memberships de organizacion). El RBAC de infraestructura (IAM de nube, policies de servidor) pertenece a `devops-infra` / `backend-architect` y no se redesarrolla aqui.

### Invitaciones a organizacion

Patron confirmado consistente entre WorkOS y Auth0:
- Token con expiracion configurable (`expires_in_days` en WorkOS); al autenticar con el token se acepta automaticamente la invitacion y se crea el membership.
- Email transaccional con enlace tipo `https://app.com/login?invitation={id}&organization={id}`, o generar solo la URL para integrar en un flujo propio.
- Maneja ambos casos: usuario nuevo (no existe en el sistema) o usuario existente que se agrega a una organizacion adicional.
- Estados soportados documentados: accept, revoke, resend (si esta pending), o expiracion automatica. No hay flujo explicito de "rechazar" documentado en las fuentes consultadas — tratar como no verificado.

### SSO empresarial (SAML/OIDC) como requisito de venta

Confirmado como el requisito mas solicitado por organizaciones que evaluan adoptar un SaaS nuevo (WorkOS: "Single Sign-On is the most frequently asked for requirement by organizations looking to adopt new SaaS applications"). Razones de negocio: gestion centralizada de credenciales via el IdP corporativo y cumplimiento normativo mediante control centralizado de identidad.

Patron tecnico de alto nivel: middleware de autenticacion compatible con cualquier IdP SAML/OIDC, modelado sobre OAuth 2.0. Flujo de tres pasos: (1) la app genera URL de autorizacion hacia el IdP, (2) el usuario se autentica en su sistema corporativo, (3) el IdP devuelve un codigo que se intercambia por el perfil autenticado. La persistencia de usuarios sigue siendo responsabilidad de la aplicacion, no del proveedor de SSO.

**Conexion con compliance (gap que no debe tratarse como tema separado):** SSO no es solo un requisito de producto — es tambien parte del vendor-risk-assessment que exige SOC 2 (ver seccion de compliance abajo). Un cliente enterprise que pide SOC 2 casi siempre pide SSO en el mismo proceso de evaluacion; disenarlos como si fueran disciplinas no relacionadas genera doble trabajo.

## Entitlements por Plan (capa de negocio sobre feature flags)

**Distincion obligatoria con `release-manager`:** un feature flag (ver `release-manager`, seccion "Feature Flags") es una tecnica de release — rollout gradual, kill switch, A/B testing de despliegue. Un entitlement es una decision de monetizacion: que feature esta disponible segun el plan que el cliente pago. Son capas distintas que pueden coexistir sobre la misma feature (un flag controla si el codigo esta activo en produccion; un entitlement controla si un tenant especifico tiene derecho a usarlo).

Cita textual clave (Stripe): "Payment is not access. A successful payment does not grant access; a successful payment creates entitlements. Stripe handles billing; your app handles entitlements." Y: "Stripe supports basic entitlement management through an API, but it does not enforce access at runtime... the entitlement logic... lives entirely in your code."

Patron tecnico: registrar features asociadas a productos/planes en la Entitlements API de Stripe; consultar por Customer ID los entitlements activos; sincronizar cambios via el webhook `entitlements.active_entitlement_summary.updated` (el mismo evento que se dispara al pausar un trial sin metodo de pago, ver seccion de billing arriba).

**No verificado:** si los entitlements deben cachearse o consultarse en vivo en cada request no esta prescrito por Stripe como fuente primaria — es decision de arquitectura de cada implementacion. Cachear con invalidacion por webhook es patron extendido de mercado, no mandato del proveedor.

## White-Labeling: Dominios Custom y Subdominios

Fuente principal: Microsoft Learn, "Domain Name Considerations in Multitenant Solutions" (no se encontro equivalente AWS oficial con el mismo nivel de detalle).

- **Subdominios:** patron `tenant.provider.com`, con wildcard DNS (`*.provider.com`) para no crear un registro por tenant nuevo. Multiples stem domains regionales (`us.provider.com`, `eu.provider.com`) reducen overhead operativo porque los tenants heredan el wildcard automaticamente.
- **Dominio propio del cliente:** requiere (1) CNAME encadenado hacia el stem domain del proveedor, (2) reescritura del Host header con propagacion via `X-Forwarded-Host` para que la app identifique el tenant, (3) validacion de dominio obligatoria (CNAME o TXT de verificacion) antes de activarlo.
- **Riesgo documentado explicitamente — dangling DNS / subdomain takeover:** si un tenant se da de baja y no borra su CNAME, un atacante puede reclamar ese nombre y hacer phishing bajo la marca original. Mitigacion oficial: exigir borrado del CNAME antes de remover el dominio de la cuenta, y prohibir reutilizacion de identificadores de tenant.
- **TLS:** el proveedor emite y renueva el certificado (requiere autorizacion via registro CAA si el cliente lo tiene) o el cliente aporta su propio certificado (el proveedor gestiona la clave privada de forma segura). Certificados wildcard normalmente no se automatizan igual que los de dominio custom individual.

## Rate Limiting y Quotas por Plan

Fuente: Microsoft Learn, "Throttling Pattern" (Azure Architecture Center).

- El throttling es "a control loop, not a single admission decision" — opera sobre utilizacion de infraestructura, estado de la aplicacion y contadores por-principal (tenant, usuario o app).
- **Per-principal rate limits:** rechazar requests de un tenant que ya excedio su tasa configurada — la fuente remite explicitamente a medir el consumo de cada tenant por separado.
- **Priority Queue pattern:** procesar tenants de plan alto primero cuando hay distintos SLA por plan.

| Algoritmo | Comportamiento | Caso de uso |
|---|---|---|
| Token bucket | Soporta rafagas hasta un tamano configurado + tasa de recarga constante | Gateways que deben absorber picos cortos |
| Leaky bucket | Emite a tasa constante | Backends que necesitan ingreso estable |
| Fixed window | Simple, pero admite rafagas dobles en el borde de ventana | Casos de bajo riesgo |
| Sliding window | Corrige el problema de fixed window a costa de mas estado | Cuando la precision importa mas que el costo de estado |

Cita textual clave sobre capas: "Edge controls... run at the network boundary and drop volumetric or malicious traffic before it reaches your application. The Throttling pattern runs inside your application and meters legitimate traffic against application-defined limits. Use both layers together." — es decir, gateway/edge y aplicacion son capas complementarias, no alternativas.

Codigos de respuesta estandar: HTTP 429 (excedio tasa configurada) vs 503 (sobrecarga por pico inesperado), siempre con header `Retry-After`. Usar contador centralizado (ej. Redis) cuando el limite abarca multiples nodos; contador local es mas rapido pero puede subcontar.

## Metricas de Negocio SaaS

Definiciones matematicas de dominio publico (bajo riesgo de alucinacion, consenso universal de la industria — no requieren fuente regulatoria, a diferencia de la seccion de compliance abajo):

| Metrica | Formula |
|---|---|
| ARR | MRR x 12 (o suma de valores de contrato anual) |
| Net New MRR | New MRR + Expansion MRR - Contraction MRR - Churned MRR |
| Logo/customer churn | (Clientes perdidos / Clientes al inicio del periodo) x 100 |
| Revenue churn | (MRR perdido por cancelacion / MRR al inicio del periodo) x 100 |
| NRR | (MRR inicial + expansion - contraccion - churn) / MRR inicial x 100 |
| LTV | ARPA x Margen Bruto % / Tasa de churn de revenue |
| CAC (fully loaded) | (Marketing + salarios/comisiones de ventas + herramientas + servicios profesionales + overhead asignado) / Clientes nuevos adquiridos |

Nota importante de encuadre: logo churn cuenta clientes, revenue churn cuenta dinero — un cliente grande que cancela puede mover mucho el revenue churn sin apenas mover el logo churn. No confundirlas en un reporte.

**Ratio LTV:CAC — heuristica de mercado, no estandar regulatorio, antes del numero:** la regla "3:1" fue originada por David Skok (Matrix Partners, ~2010) por observacion de SaaS publico maduro, no es un estandar impuesto por ningun organismo. Benchmarks de industria citados por firmas de consultoria de crecimiento (no confirmados contra reporte primario de OpenView/SaaS Capital en su edicion 2026): mediana B2B SaaS ~3.2:1, top quartile 4:1-6:1, expectativa creciente por etapa de inversion (Serie A >=3:1, Serie B >=4:1, Serie C+ >=5:1).

**Orientativo, no verificado contra fuente primaria — benchmarks de churn/NRR/GRR:** cifras reportadas por fuentes secundarias que citan la encuesta anual de SaaS Capital (mediana de churn anual B2B ~3.5%, NRR mediana 103%, GRR mediana 91% en el segmento bootstrapped $3M-$20M ARR) no se pudieron confirmar contra el reporte original (acceso con paywall/formulario). Usar como referencia de rango de industria, nunca como cifra de precision garantizada en un documento contractual o propuesta a cliente.

## Compliance B2B: SOC 2 e ISO 27001

Este skill no repite PCI-DSS ni HIPAA — ver `ciso` para esos dos, que ya los cubre con profundidad equivalente.

| Dimension | SOC 2 | ISO 27001 |
|---|---|---|
| Naturaleza | Atestacion (attestation) por CPA licenciado en EE.UU. (o equivalente ICAEW en UK) | Certificacion emitida por organismo de certificacion acreditado |
| Alcance | Controles sobre sistemas o servicios especificos | Sistema de Gestion de Seguridad de la Informacion (SGSI/ISMS) a nivel organizacional completo |
| Geografia/uso | Predomina en Norteamerica, se reporta bajo NDA directamente a clientes (no es sello publico) | Estandar internacional, certificado publicable |
| Prescriptividad | Flexible — la empresa elige que Trust Services Criteria auditar | Prescriptivo, con controles universales de Anexo A |

**SOC 2 — Trust Services Criteria (5, uno obligatorio):** Security (obligatorio en todo reporte SOC 2), Availability, Processing Integrity, Confidentiality, Privacy.

**SOC 2 Tipo I vs Tipo II:**
- Tipo I: evalua el diseno de los controles en un punto especifico del tiempo (point-in-time).
- Tipo II: evalua diseno Y efectividad operativa durante un periodo continuo, tipicamente 6-12 meses.
- **Limite de verificacion declarado:** la distincion textual exacta Tipo I/Tipo II esta confirmada por consenso de multiples fuentes secundarias especializadas en compliance, no contra el texto primario integro de AICPA (el documento oficial esta en PDF, no accesible por fetch de texto plano en esta verificacion). Si esto va a un contrato o propuesta comercial, descargar y citar el PDF oficial de AICPA antes de usarlo como fuente unica.

**Por que un SaaS B2B enterprise lo necesita:** clientes enterprise exigen SOC 2 (usualmente Tipo II) como requisito de procurement/vendor risk assessment antes de firmar contrato — es la evidencia estandar de proteccion de datos auditada, no autodeclarada. AICPA confirma la existencia de mapeos oficiales publicados entre su Trust Services Criteria 2017 e ISO 27001/NIST 800-53, lo que valida que ambos estandares cubren dominios de control comparables aunque con mecanismos de certificacion distintos.

## Terms of Service, Privacy Policy y DPA (orientacion estructural — NO asesoria legal)

Todo el contenido de esta seccion es orientacion estructural general. Un ToS, Privacy Policy o DPA real deben ser redactados o revisados por un abogado con jurisdiccion aplicable antes de publicarse — esto no es un sustituto de asesoria legal formal.

**Terms of Service — elementos tipicos:**
- Limitacion de responsabilidad (cap de danos)
- Condiciones de terminacion del servicio (por ambas partes, con y sin causa)
- Politica de uso aceptable
- Propiedad intelectual y licencia de uso del software
- Resolucion de disputas / ley aplicable

**Privacy Policy — elementos tipicos bajo GDPR/CCPA:**
- Datos personales recolectados y finalidad
- Base legal del procesamiento (Art. 6 GDPR: consentimiento, ejecucion de contrato, interes legitimo, obligacion legal)
- Derechos del interesado: acceso, rectificacion, borrado, portabilidad, oposicion (GDPR); derecho a saber/eliminar/optar por no vender datos (CCPA/CPRA)
- Retencion de datos y transferencias internacionales

**DPA (Data Processing Agreement):** cuando el SaaS procesa datos personales de los usuarios finales de su cliente, el cliente es el controller y el SaaS es el processor. Contenido minimo exigido por Articulo 28(3) GDPR (verificado contra el texto del reglamento):
- Objeto, duracion, naturaleza y finalidad del procesamiento; tipo de datos y categorias de interesados.
- Obligaciones del processor: (a) procesar solo bajo instrucciones documentadas, (b) confidencialidad del personal autorizado, (c) medidas de seguridad conforme Art. 32, (d) condiciones para subcontratar sub-processors, (e) asistir con solicitudes de derechos de los interesados, (f) asistir en notificacion de brechas (Art. 32-36), (g) eliminar o devolver datos al finalizar el servicio, (h) proveer informacion para auditorias del controller.
- El contrato debe ser por escrito, incluida forma electronica.

Esto es orientacion estructural sobre contenido minimo segun el texto del reglamento — no sustituye redaccion legal formal ni el analisis de si aplican Clausulas Contractuales Estandar (SCC) para transferencias internacionales.

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
