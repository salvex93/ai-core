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
      'gen_ai.provider.name': 'anthropic',
      'gen_ai.request.model': prompt.modelo ?? 'claude-sonnet-5',
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

**Vigencia verificada 2026-08-04** (`github.com/open-telemetry/semantic-conventions-genai`, `github.com/open-telemetry/semantic-conventions/releases`): `gen_ai.system` fue renombrado a `gen_ai.provider.name` en semantic-conventions v1.37.0 -- el nombre viejo queda deprecado, no eliminado. El contenido GenAI completo se movio de repositorio en v1.42.0 (junio 2026). Muchas librerias de instrumentacion en produccion todavia emiten `gen_ai.system` por no haber migrado -- si se integra con un backend de terceros (Phoenix, Grafana, Langfuse), confirmar cual de los dos nombres espera esa version especifica antes de asumir compatibilidad automatica.

## Integracion con Langfuse

Langfuse es la opcion recomendada para proyectos con restriccion de privacidad porque es completamente self-hosteable con Docker Compose.

Verificado 2026-08-14 contra langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4 y langfuse.com/docs/compatibility: la API v2/v3 (`langfuse.trace()`, `traza.generation()`, paquete monolitico `langfuse`) fue **eliminada**, no solo deprecada, en la version GA actual (v4/v5). La arquitectura vigente es OTel-nativa via `@langfuse/tracing` + `@langfuse/otel`, y converge con la instrumentacion OTel generica ya descrita arriba en este skill — un `LangfuseSpanProcessor` registrado en el mismo `NodeSDK` de OpenTelemetry.

```typescript
// Setup — una sola vez al arrancar el proceso
import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});
sdk.start();
```

```typescript
// Instrumentacion de la llamada LLM — startObservation con asType: 'generation'
import { startActiveObservation } from '@langfuse/tracing';

async function llamarLLMConLangfuse(operacion: string, prompt: PromptRequest): Promise<LLMResponse> {
  return startActiveObservation(operacion, async (span) => {
    const generacion = span.startObservation(
      'llm-call',
      {
        model: prompt.modelo ?? 'claude-sonnet-5',
        input: [{ role: 'user', content: prompt.usuario }],
      },
      { asType: 'generation' }
    );

    try {
      const respuesta = await gateway.completar(prompt);

      generacion.update({
        usageDetails: { input: respuesta.tokensEntrada, output: respuesta.tokensSalida },
        output: { content: respuesta.contenido },
      });
      generacion.end();

      return respuesta;
    } catch (error) {
      generacion.update({ level: 'ERROR', statusMessage: String(error) });
      generacion.end();
      throw error;
    }
  });
}
```

Variables de entorno requeridas (mismos nombres que la version anterior del SDK):

```
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://langfuse.empresa.interna
```

Nota: la documentacion oficial no confirma un campo explicito de costo total (`totalCost`) en `usageDetails` — Langfuse deriva el costo del lado servidor a partir de `model` + tokens. No asumir un parametro de costo manual sin confirmar contra la version instalada.

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
