---
name: llm-observability
description: Especialista en observabilidad de sistemas LLM en produccion. Activa al instrumentar un sistema que usa LLMs, disenar dashboards de costo/calidad, configurar alertas de degradacion o diagnosticar regresiones de calidad en produccion.
metadata:
  origin: ai-core
  version: 1.2.1
  last_updated: 2026-10-29
  rol: auditor
compatibility: Depende de SDKs de terceros (@langfuse/tracing, @langfuse/otel, @opentelemetry/*, helicone) y conectividad de red hacia la plataforma de observabilidad elegida.
---

# LLM Observability — Especialista en Observabilidad de Sistemas IA

Este perfil cubre la instrumentacion y el monitoreo de sistemas que usan LLMs en produccion. Su dominio no es el LLM en si, sino la infraestructura de observabilidad que rodea cada llamada: trazas distribuidas, metricas de costo y calidad, alertas de degradacion, y la seleccion e integracion de plataformas de observabilidad especializadas.

Complementa al skill `ai-integrations` (integracion del LLM como feature) y al skill `llm-evals` (medicion de calidad offline). Este skill cubre la observabilidad en tiempo real en produccion.

## Cuando Activar Este Perfil

- Al instrumentar por primera vez un sistema que llama a LLMs en produccion.
- Al disenar dashboards de costo por operacion, por usuario o por modelo.
- Al configurar alertas de degradacion: latencia anormal, tasa de errores del proveedor, costo por encima del presupuesto.
- Al seleccionar una plataforma de observabilidad IA (Langfuse, Helicone, Phoenix by Arize, Weights and Biases Weave).
- Al diagnosticar una regresion de calidad detectada en produccion: trazar la cadena prompt -> completion -> resultado de negocio.
- Al revisar si un PR que integra un LLM incluye instrumentacion suficiente para operar en produccion.

## Cuando NO Activar Este Perfil

- La tarea es deteccion y bloqueo de comportamiento malicioso en el LLM — usar `ai-guardrails`.
- La tarea es medir la calidad semantica de los outputs (faithfulness, alucinaciones) — usar `llm-evals`.
- La tarea es configurar observabilidad de infraestructura general (CPU, memoria, latencia HTTP) — usar `devops-infra`.
- El sistema LLM esta en desarrollo local sin trafico real — la observabilidad de produccion no es necesaria todavia.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta herramientas de observabilidad (Langfuse/Helicone/Phoenix/OTel), variables de plataformas externas y politicas de privacidad")
```

Retorna: stack detectado, dependencias IA, variables de entorno, convenciones del proyecto.

Si MCP gemini-bridge no disponible → leer manualmente: `package.json`, `.env.example`, `CLAUDE.md` local.

Si no hay instrumentacion activa, declararlo y proponer la estrategia minima viable antes de continuar.

Si archivos de configuracion de observabilidad superan 200 lineas, o logs/errores superan 50 lineas, aplicar la regla GEMINI PRIMERO de CLAUDE.md (delegacion obligatoria al bridge):

```
node scripts/mcp-gemini.js --mission "Analiza la configuracion de observabilidad e identifica: metricas sin umbral definido, llamadas LLM sin logging de tokens, ausencia de trace_id en los logs, y gaps entre la cobertura de observabilidad y los flujos criticos de negocio" --file <ruta> --format json
```

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No emitir recomendaciones hasta tener el plan aprobado.

- La tarea envia prompts del sistema o datos de usuario a una plataforma SaaS externa sin revision de la politica de privacidad del proyecto anfitrion.
- La tarea modifica el exportador de trazas en produccion sin un plan de migracion que garantice continuidad del historial de metricas.
- La tarea integra una nueva plataforma de observabilidad que reemplaza la existente sin estrategia de correlacion de datos historicos.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Seleccion de Plataforma de Observabilidad

La eleccion de la plataforma depende de dos ejes: restricciones de privacidad (donde viven los datos) y la funcionalidad requerida (solo trazas vs trazas + evals integrados).

| Plataforma | Tipo | Datos | Evals integrados | Cuando usar |
|---|---|---|---|---|
| Langfuse | Open-source, self-hosteable o cloud | Self-hosted: dentro del perimetro propio | Si | Proyectos con restriccion de privacidad; equipos que quieren una sola herramienta para trazas + evals |
| Helicone | SaaS (proxy HTTP) | Cloud Helicone | No (solo metricas) | Instrumentacion rapida de bajo overhead; no requiere cambios de codigo, solo redirigir el base URL del SDK |
| Phoenix by Arize | Open-source, self-hosteable o cloud | Self-hosted o Arize cloud | Si (LLM-as-judge) | Equipos con stack MLOps existente en Arize; evaluacion de RAG en produccion |
| Weights and Biases Weave | SaaS | Cloud W&B | Si | Equipos que ya usan W&B para experimentos de ML; proyectos que combinan LLM con modelos de ML tradicionales |
| OpenTelemetry + Grafana | Open-source, self-hosteable | Self-hosted | No (requiere llm-evals por separado) | Equipos con plataforma OTel existente; maximo control sobre la infraestructura |

Criterio de decision por restriccion de privacidad:
- Si los prompts contienen datos personales (PII) o informacion confidencial: usar plataforma self-hosteable (Langfuse o Phoenix o OTel propio). Nunca enviar prompts con PII a un SaaS externo sin revision legal documentada.
- Si los prompts son genericos o publicos: cualquier plataforma es viable.

## Gate de Calidad Medible

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Cobertura de instrumentacion | 100% de las llamadas LLM en rutas de produccion emiten `trace_id` + tokens de entrada/salida | Grep dirigido de todas las funciones que invocan al proveedor LLM (`ModelRegistry.chat` o equivalente) contra los puntos donde se abre un span; cero llamadas sin span asociado |
| Latencia de exportacion de trazas | Overhead de instrumentacion <= 5% de la latencia total de la llamada LLM | Comparar `llm_request_duration_ms` con y sin el span activo, usando el mismo prompt, en un benchmark de al menos 20 llamadas |
| Frescura del dashboard de costo | Desfase entre el evento y su aparicion en el dashboard <= 60 segundos (exportacion no batcheada en ventanas mayores) | Revisar la configuracion del `SpanProcessor` (`SimpleSpanProcessor` vs `BatchSpanProcessor` y su `scheduledDelayMillis`); confirmar en el dashboard real con una llamada de prueba cronometrada |
| Correlacion request-a-traza | 100% de los `trace_id` emitidos son buscables end-to-end desde el log de la peticion HTTP hasta la traza en la plataforma de observabilidad | Tomar 5 `trace_id` al azar de logs de produccion y confirmar que cada uno resuelve a una traza completa en la plataforma, sin traza huerfana ni log sin `trace_id` |
| Precision de alertas de degradacion | Tasa de falsos positivos de alertas WARNING/CRITICAL <= 10% en una ventana de 7 dias | Revisar el historial de alertas disparadas vs. incidentes confirmados por el equipo de guardia; recalibrar el umbral si supera el 10% |

## Referencias bajo demanda

Contenido expansivo movido a `references/` (divulgacion progresiva) para mantener este SKILL.md nucleo liviano. Cargar el archivo correspondiente cuando la tarea lo requiera:

- `references/obs-instrumentacion.md` — Instrumentacion con OpenTelemetry, Langfuse y Helicone.
- `references/obs-golden-dataset.md` — Promocion de traza a golden dataset.
- `references/obs-vanguardia-agentes.md` — Observabilidad de agentes y trazas GenAI en produccion.

## Metricas Obligatorias en Produccion

Todo sistema LLM en produccion debe exponer las siguientes metricas, independientemente de la plataforma de observabilidad elegida:

### Metricas de costo

| Metrica | Tipo | Descripcion |
|---|---|---|
| `llm_tokens_input_total` | Contador | Tokens de entrada acumulados, segmentados por modelo y operacion |
| `llm_tokens_output_total` | Contador | Tokens de salida acumulados, segmentados por modelo y operacion |
| `llm_tokens_cache_read_total` | Contador | Tokens leidos desde cache (ahorro de costo), segmentados por operacion |
| `llm_cost_usd_total` | Contador | Costo estimado en USD acumulado, segmentado por modelo y operacion |
| `llm_cost_usd_per_request` | Histograma | Distribucion del costo por llamada individual |

### Metricas de latencia

| Metrica | Tipo | Descripcion |
|---|---|---|
| `llm_request_duration_ms` | Histograma | Latencia total de cada llamada, segmentada por modelo y operacion |
| `llm_time_to_first_token_ms` | Histograma | Tiempo hasta el primer token en llamadas streaming |

### Metricas de disponibilidad

| Metrica | Tipo | Descripcion |
|---|---|---|
| `llm_requests_total` | Contador | Total de llamadas, segmentadas por modelo, operacion y estado (success/error) |
| `llm_errors_total` | Contador | Llamadas fallidas, segmentadas por tipo de error (timeout, rate_limit, provider_error) |

## Alertas de Degradacion

Configurar las siguientes alertas como gate de calidad operativa. Los umbrales exactos dependen del SLA del proyecto anfitrion.

| Alerta | Condicion de activacion | Severidad | Accion recomendada |
|---|---|---|---|
| Latencia anormal | p95 de `llm_request_duration_ms` supera 2x el baseline | WARNING | Revisar carga del proveedor; activar fallback |
| Costo fuera de presupuesto | `llm_cost_usd_total` supera el presupuesto diario definido | CRITICAL | Throttling de llamadas no criticas; notificar al responsable de costos |
| Tasa de errores del proveedor | `llm_errors_total` / `llm_requests_total` > 1% en 5 minutos | WARNING | Revisar status del proveedor; activar circuit breaker si supera 5% |
| Cache miss rate alto | `llm_tokens_cache_read_total` / `llm_tokens_input_total` < 30% para operaciones con system prompt estatico | INFO | Revisar si el system prompt se esta modificando entre llamadas |
| Prompt bloat | `gen_ai.usage.input_tokens` promedio por operacion sube mas del 20% respecto al baseline de 24h | WARNING | Revisar si el historial de conversacion no esta siendo truncado; comparar longitud del system prompt con la version anterior desplegada. Si el bloat viene de definiciones de tools (no de historial), evaluar Tool Search Tool con `defer_loading: true` (anthropic.com/engineering/advanced-tool-use, reduce hasta 85% de tokens de descubrimiento de herramientas) como mitigacion arquitectonica antes de solo ajustar el umbral de la alerta — ver `claude-platform` para el detalle de implementacion |

Ejemplo de regla PromQL para la alerta de prompt bloat:

```yaml
- alert: LLMPromptBloat
  expr: |
    avg by (operacion) (rate(llm_tokens_input_total[1h]))
    > 1.2 * avg by (operacion) (rate(llm_tokens_input_total[1h] offset 24h))
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "Incremento anormal de tokens de entrada en {{ $labels.operacion }}"
    description: "Los tokens de entrada promedio superan en mas del 20% el baseline de 24h. Posible prompt bloat o historial no truncado."
```

## Protocolo de Diagnostico de Regresion de Calidad

Cuando una regresion se detecta en produccion (mas quejas de usuarios, metricas de negocio degradas), seguir este protocolo antes de hacer cambios:

1. Aislar el rango temporal: identificar en el dashboard el timestamp exacto donde comenzo la degradacion.
2. Verificar cambios coincidentes: revisar git log en ese rango para cambios de prompt, modelo o configuracion del LLM.
3. Extraer una muestra de trazas del periodo afectado: buscar patrones en inputs, longitud de prompts, modelo usado.
4. Comparar tokens de salida: una degradacion de calidad frecuentemente correlaciona con una caida en la longitud del output (el modelo genera menos contenido) o un aumento (el modelo alucina mas para completar).
5. Ejecutar el golden dataset del skill `llm-evals` contra la configuracion actual para confirmar la regresion de forma controlada.
6. Revertir el ultimo cambio de prompt o modelo si se identifica como causa. No hacer multiples cambios simultaneos.

## Lista de Verificacion de Revision de Codigo — LLM Observability

Verificar en orden antes de aprobar un PR que introduce o modifica un sistema LLM en produccion.

1. Tokens: toda llamada al LLM registra `input_tokens`, `output_tokens` y `cache_read_input_tokens` en el sistema de observabilidad.
2. Costo: existe una estimacion de costo por llamada calculada en el momento de la respuesta y registrada en la metrica `llm_cost_usd_total`.
3. Trazas: cada llamada tiene un `trace_id` que la correlaciona con la peticion HTTP que la origino.
4. Errores: los errores del proveedor (timeout, 429, 500) se registran con el tipo de error en `llm_errors_total`.
5. Privacidad: si los prompts contienen PII, la plataforma de observabilidad es self-hosteable o los prompts se redactan antes de enviarse.
6. Alertas: existen umbrales de alerta configurados para latencia y costo, con acciones de respuesta documentadas.
7. Precision: cada hallazgo cita la ruta relativa del archivo y el numero de linea exacto. Sin esta referencia, el hallazgo no es accionable.

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.
- Verificar revision legal documentada del DPA del proveedor antes de enviar prompts con PII a plataformas SaaS de observabilidad.
- Verificar una estimacion de costo base calibrada contra la tarifa real del proveedor activo antes de configurar metricas de costo.
- Prohibido implementar alertas sin umbrales numericos definidos. Una alerta sin umbral no es accionable.
- Verificar estrategia de correlacion del historial de metricas anteriores antes de reemplazar la plataforma de observabilidad activa.
