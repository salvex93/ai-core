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

