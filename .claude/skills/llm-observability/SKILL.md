---
name: llm-observability
description: Especialista en observabilidad de sistemas LLM en produccion. Cubre instrumentacion con OpenTelemetry, dashboards de costo por operacion, alertas de degradacion de calidad, tracing de prompts y completions, y plataformas de observabilidad IA (Langfuse, Helicone, Phoenix). Activa al instrumentar un sistema que usa LLMs, disenar dashboards de costo/calidad, configurar alertas de degradacion o diagnosticar regresiones de calidad en produccion.
origin: ai-core
version: 1.1.2
last_updated: 2026-03-29
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

## Primera Accion al Activar

Leer los siguientes archivos en el repositorio anfitrion para deducir el stack de observabilidad activo antes de emitir cualquier recomendacion:

1. `package.json` / `requirements.txt` — detectar herramientas de observabilidad presentes:
   - `@opentelemetry/api`, `@opentelemetry/sdk-trace-node` — OTel base
   - `langfuse`, `langfuse-langchain` — plataforma Langfuse
   - `helicone` — proxy de observabilidad Helicone
   - `@arizeai/phoenix-client` — plataforma Phoenix by Arize
   - `@wandb/sdk` / `wandb` — Weights and Biases Weave
2. `.env.example` — variables de entorno de plataformas de observabilidad (LANGFUSE_PUBLIC_KEY, HELICONE_API_KEY, OTEL_EXPORTER_OTLP_ENDPOINT, etc.).
3. Buscar instrumentacion existente: `grep -r "trace\|span\|logger.*tokens\|usage.*tokens" --include="*.ts" --include="*.py" . | grep -v node_modules`
4. `CLAUDE.md` local del anfitrion — politicas de retencion de datos y restricciones de privacidad que afecten el envio de prompts a plataformas externas.

Si no hay instrumentacion activa, declararlo y proponer la estrategia minima viable antes de continuar.

Si archivos de configuracion de observabilidad o logs superan 500 lineas o 50 KB, aplicar Regla 9:

```
node scripts/gemini-bridge.js --mission "Analiza la configuracion de observabilidad e identifica: metricas sin umbral definido, llamadas LLM sin logging de tokens, ausencia de trace_id en los logs, y gaps entre la cobertura de observabilidad y los flujos criticos de negocio" --file <ruta> --format json
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

## Instrumentacion con OpenTelemetry (patron base)

OTel es el denominador comun de cualquier estrategia de observabilidad. Instrumentar el ciclo LLM con OTel permite exportar trazas a cualquier backend (Langfuse, Phoenix, Jaeger, Grafana Tempo) sin cambiar el codigo de instrumentacion.

```typescript
import { trace, SpanStatusCode, context, propagation } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// Configurar el provider al inicio de la aplicacion (una sola vez)
const provider = new NodeTracerProvider();
provider.addSpanProcessor(
  new SimpleSpanProcessor(new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    headers: {
      Authorization: `Bearer ${process.env.OTEL_EXPORTER_API_KEY}`,
    },
  }))
);
provider.register();

const tracer = trace.getTracer('nombre-del-servicio', '1.0.0');

// Instrumentar una llamada LLM
async function llamarLLM(operacion: string, prompt: PromptRequest): Promise<LLMResponse> {
  return tracer.startActiveSpan(`llm.${operacion}`, async (span) => {
    // Atributos semanticos estandar para LLM (OpenTelemetry GenAI semantic conventions)
    span.setAttributes({
      'gen_ai.system': 'anthropic',
      'gen_ai.request.model': prompt.modelo ?? 'claude-sonnet-4-6',
      'gen_ai.request.max_tokens': prompt.maxTokens ?? 1024,
      'gen_ai.operation.name': operacion,
    });

    try {
      const respuesta = await gateway.completar(prompt);

      // Atributos de respuesta
      span.setAttributes({
        'gen_ai.response.model': respuesta.modelo,
        'gen_ai.usage.input_tokens': respuesta.tokensEntrada,
        'gen_ai.usage.output_tokens': respuesta.tokensSalida,
        'gen_ai.usage.cache_read_tokens': respuesta.tokensCacheRead ?? 0,
        'gen_ai.latency_ms': respuesta.latenciaMs,
      });

      return respuesta;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

Los atributos usan el esquema `gen_ai.*` de las OpenTelemetry GenAI Semantic Conventions. Este esquema permite que herramientas como Phoenix y Grafana interpreten automaticamente las trazas como llamadas LLM sin configuracion adicional.

## Integracion con Langfuse

Langfuse es la opcion recomendada para proyectos con restriccion de privacidad porque es completamente self-hosteable con Docker Compose.

```typescript
import Langfuse from 'langfuse';

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL, // URL del servidor self-hosted
});

async function llamarLLMConLangfuse(operacion: string, prompt: PromptRequest): Promise<LLMResponse> {
  // Crear una traza en Langfuse para la operacion completa
  const traza = langfuse.trace({
    name: operacion,
    userId: prompt.userId,      // para analisis de costo por usuario
    sessionId: prompt.sessionId,
    metadata: { operacion },
  });

  // Registrar la generacion LLM dentro de la traza
  const generacion = traza.generation({
    name: 'llm-call',
    model: prompt.modelo ?? 'claude-sonnet-4-6',
    input: prompt.usuario,
    systemPrompt: prompt.sistema,
  });

  try {
    const respuesta = await gateway.completar(prompt);

    // Registrar el resultado y el uso de tokens
    generacion.end({
      output: respuesta.contenido,
      usage: {
        input: respuesta.tokensEntrada,
        output: respuesta.tokensSalida,
        totalCost: calcularCosto(respuesta),
      },
    });

    return respuesta;
  } catch (error) {
    generacion.end({ level: 'ERROR', statusMessage: String(error) });
    throw error;
  } finally {
    // Envio asincrono — no bloquea el flujo de produccion
    await langfuse.flushAsync();
  }
}
```

Variables de entorno requeridas para Langfuse self-hosted:

```
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://langfuse.empresa.interna
```

## Instrumentacion rapida con Helicone (proxy HTTP)

Helicone actua como proxy transparente del API de Anthropic. No requiere cambios en la logica de llamadas: solo se cambia el base URL del SDK y se agrega la API key de Helicone.

```typescript
import Anthropic from '@anthropic-ai/sdk';

const cliente = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://anthropic.helicone.ai',
  defaultHeaders: {
    'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
    // Metadatos opcionales para segmentacion en el dashboard
    'Helicone-User-Id': userId,
    'Helicone-Property-Operacion': operacion,
  },
});
```

Helicone registra automaticamente cada llamada con tokens, costo y latencia sin instrumentacion adicional. Es la opcion de menor overhead para equipos que necesitan visibilidad rapida sin infraestructura OTel propia.

Restriccion: los prompts se transmiten a los servidores de Helicone. No usar con prompts que contengan PII o datos confidenciales sin revisar el DPA del proveedor.

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
| Prompt bloat | `gen_ai.usage.input_tokens` promedio por operacion sube mas del 20% respecto al baseline de 24h | WARNING | Revisar si el historial de conversacion no esta siendo truncado; comparar longitud del system prompt con la version anterior desplegada |

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

## Protocolo de Promocion de Traza a Golden Dataset

Las trazas de produccion son la fuente mas valiosa de casos reales para el golden dataset del skill `llm-evals`. Este protocolo define como promover una traza a item del dataset sin romper el protocolo de revision humana obligatorio.

Condiciones de seleccion de una traza candidata:

- La traza exhibe un output inesperadamente bueno que el sistema deberia reproducir de forma consistente.
- La traza exhibe una alucinacion o fallo de calidad documentado, util como caso de fallo esperado en el dataset.
- La traza cubre un caso de uso critico no representado en el golden dataset actual.

Proceso de promocion:

1. Localizar la traza en la plataforma de observabilidad usando su `trace_id`.
2. Extraer los campos: `input.usuario`, `input.contexto` (chunks RAG si aplica), `output` generado, modelo, version de prompt.
3. Crear un item candidato con estado `revisor: pendiente`. El campo `origen_traza` vincula el item a la traza de produccion original.
4. Un revisor humano aprueba o rechaza el candidato: valida el `ground_truth` (si el output fue bueno) o documenta el fallo (si fue un caso negativo).
5. Una vez aprobado, el item se incorpora al golden dataset con `revisor` actualizado y la fecha de `ultima_revision`.

Estructura del item promovido desde una traza:

```json
{
  "id": "eval-from-trace-001",
  "categoria": "resumen_contrato",
  "input": {
    "usuario": "Resume las clausulas de penalizacion",
    "contexto": ["...chunk recuperado 1...", "...chunk recuperado 2..."]
  },
  "ground_truth": "El contrato establece una penalizacion del 10% del valor total.",
  "criterios": ["cita al menos una clausula con porcentaje", "no introduce terminos no presentes en el contexto"],
  "umbral_minimo": 0.80,
  "ultima_revision": "2026-03-28",
  "revisor": "pendiente",
  "origen_traza": "trace_abc123_prod_2026-03-28"
}
```

El campo `origen_traza` es auditoria: permite rastrear de que sesion real provino el caso y comparar el output original del sistema contra las ejecuciones futuras del eval. Sin este campo, la trazabilidad entre produccion y el dataset de evaluacion se pierde.

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

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil. Restricciones adicionales:
- Prohibido enviar prompts con PII a plataformas SaaS de observabilidad sin revision legal documentada del DPA del proveedor.
- Prohibido configurar metricas de costo sin una estimacion de costo base calibrada contra la tarifa real del proveedor activo.
- Prohibido implementar alertas sin umbrales numericos definidos. Una alerta sin umbral no es accionable.
- Prohibido reemplazar la plataforma de observabilidad activa sin estrategia de correlacion del historial de metricas anteriores.
