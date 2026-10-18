## Billing y Suscripciones

### Merchant of Record (MoR) vs procesador directo

La diferencia determina quien asume la responsabilidad legal/fiscal de recaudar y remitir impuestos (VAT/sales tax/GST), cumplimiento PCI, disputas y fraude.

| Plataforma | Rol por defecto | Detalle verificado |
|---|---|---|
| Stripe (producto estandar, Billing + Payments) | NO es MoR | El propio negocio SaaS es el merchant of record. Existe un producto especifico, **Stripe Managed Payments**, donde Stripe SI actua como MoR y gestiona sales tax/VAT/GST en mas de 80 paises — aplicable a nivel de transaccion/mercado especifico, coexiste con el modo procesador directo en otras partes del mismo negocio. Fuente: docs.stripe.com/payments/managed-payments |
| Paddle | SI es MoR (nativo) | Actua como "seller of record", recolecta y remite VAT y sales tax en nombre del vendedor. Fuente: paddle.com/support/what-is-a-merchant-of-record |
| Lemon Squeezy | SI es MoR (segun doc indexada); sigue operando de forma autonoma | Cubre sales tax, refunds, chargebacks y PCI compliance. Adquirida por Stripe en julio de 2024. Verificado independientemente (blog oficial de Lemon Squeezy, `lemonsqueezy.com/blog/2026-update`): la plataforma sigue operando en 2026, sin fecha de discontinuacion anunciada — Stripe esta migrando gradualmente usuarios hacia Stripe Managed Payments de forma opcional, no forzada. Riesgo a monitorear: cuando Stripe Managed Payments salga de beta con una comision menor (3.5% vs el 5% actual de Lemon Squeezy), la migracion podria acelerarse o Lemon Squeezy podria discontinuarse — no hay fecha anunciada para ninguno de los dos escenarios a la fecha de esta redaccion. La comision comparada (3.5% vs 5%) y la migracion opcional NO se reconfirmaron el 2026-09-21: tratar como orientativo hasta verificar contra `lemonsqueezy.com` y `docs.stripe.com`. |

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

