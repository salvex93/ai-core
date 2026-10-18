## Modulo — Observabilidad de Agentes y Trazas GenAI en Produccion

### Identidad declarada antes de ejecutar

Antes de producir cualquier output de instrumentacion, dashboard o alerta en este dominio, completar:

`IDENTIDAD OBSERVABILIDAD LLM: Plataforma destino: [Langfuse self-hosted | Langfuse cloud | Helicone | Phoenix by Arize | W&B Weave | OTel + Grafana Tempo] | Unidad de costo a reportar: [por operacion | por usuario | por sesion | por tenant] | Granularidad de traza: [span unico por llamada | traza multi-span con sub-spans de retrieval/tool-call/generacion] | Politica de contenido en la traza: [prompt completo | prompt redactado | solo metadata sin contenido] | Referencia de severidad: [una linea, ej. "toda alerta CRITICAL dispara PagerDuty, WARNING solo Slack"]`

Sin este bloque completo, no iniciar la instrumentacion: la unidad de costo y la politica de contenido determinan el esquema de atributos y no son reversibles sin re-instrumentar.

### Prohibido — patrones reconocibles de demo/plantilla

- Dashboard con un unico panel de "tokens totales" sin desglose por modelo, operacion o usuario — no permite diagnosticar cual llamada especifica genero el costo.
- Traza que registra `input`/`output` como texto plano sin `trace_id` correlacionado a la peticion HTTP que la origino — impide reconstruir la cadena request -> LLM -> resultado de negocio.
- Alerta de "latencia alta" con umbral fijo arbitrario (ej. "> 3000ms") copiado de un tutorial, sin baseline propio calculado sobre el trafico real del sistema.
- Span de llamada LLM sin `gen_ai.usage.input_tokens` ni `gen_ai.usage.output_tokens` — un span "de relleno" que registra que la llamada ocurrio pero no permite ninguna metrica de costo derivada.
- Integracion de Langfuse/Helicone/Phoenix copiada del quickstart oficial sin adaptar `userId`/`sessionId`/metadata a las entidades reales del dominio del proyecto anfitrion.
- Retry o fallback entre proveedores que no genera un span/evento propio — la traza muestra una sola llamada exitosa y oculta que hubo dos intentos fallidos antes, distorsionando las metricas de disponibilidad real.

### Vigencia — estandar mas recientes del dominio

Verificado en esta tarea contra fuente oficial (`opentelemetry.io/docs/specs/semconv/gen-ai/` y `github.com/open-telemetry/semantic-conventions-genai`): las convenciones semanticas `gen_ai.*` se movieron fuera del repositorio principal `open-telemetry/semantic-conventions` hacia un repositorio dedicado, `open-telemetry/semantic-conventions-genai`. Las atribuciones `gen_ai.*` previas quedaron marcadas como deprecadas en su ubicacion original. El mecanismo de opt-in a la version experimental mas reciente es la variable de entorno `OTEL_SEMCONV_STABILITY_OPT_IN` con el valor `gen_ai_latest_experimental`; sin ese opt-in, la instrumentacion sigue emitiendo la version previa (1.34.0 o anterior) por compatibilidad. El conjunto de convenciones GenAI aun no esta marcado como estable — sigue en fase experimental con plan de transicion pendiente de publicacion.

Antes de fijar un nombre de atributo exacto en codigo de produccion (mas alla de `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, ya usados en este mismo archivo y estables en su forma actual), verificar el atributo puntual contra el repositorio `semantic-conventions-genai` en el momento de implementar — la superficie de atributos nuevos (`gen_ai.system_instructions`, `gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.response.finish_reasons`) esta activa pero orientativo, no verificado contra fuente oficial en el nivel de detalle de schema JSON exacto en esta pasada — confirmar el schema antes de instrumentar un campo nuevo, no asumir por analogia con los atributos ya vigentes.

Reverificado 2026-09-15 contra el dominio compartido `rag-llm-eval` (`docs.ragas.io`, `deepeval.com`, `promptfoo.dev`): sin impacto sobre las convenciones `gen_ai.*` de OpenTelemetry documentadas arriba — son capas complementarias (observabilidad de trazas vs. metricas de calidad de evals), sin solapamiento de superficie que requiera actualizar este archivo.
