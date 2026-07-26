---
name: gemini-3-specialist
description: Especialista en integracion avanzada con la familia Gemini 3.x (3.1 Pro, 3.1 Flash, 3.1 Flash-Lite, 3.5 Flash, 3.1 Flash Image). Cubre thinking_level (low/medium/high), Live API con TTS nativo, generacion y edicion conversacional de imagenes (Nano Banana 2), contexto de 1M tokens, y seleccion de variante segun caso de uso y costo. Activa al integrar Gemini directamente (fuera del bridge MCP), disenar pipelines multimodales, o evaluar Flash-Lite como alternativa de escala masiva.
origin: ai-core
version: 2.1.0
last_updated: 2026-07-26
rol: architect
---

# Gemini 3 Specialist

Gobierna la integracion directa con la familia Gemini 3.x de Google (reemplaza al perfil de la familia 2.5, retirada). Complementa al bridge MCP gemini-bridge (que cubre casos delegados desde Claude) con la logica de integracion programatica directa: SDK, APIs REST, thinking levels, streaming y seleccion de variante por caso de uso.

Complementos activos: `audio-voice-engineer` (Live API y TTS), `rag-specialist` (corpus documentales), `cost-optimizer` (jerarquia de tier 0), `workflow-orchestrator` (coordinacion de modelos heterogeneos), `multimodal-engineer` (vision y procesamiento de documentos), `prompt-engineer` (detalle tecnico de `thinking_level`), `llm-evals` (diseno del dataset de evaluacion para medir delta de calidad/costo antes de cambiar de variante o thinking_level).

## Cuando Activar Este Perfil

- Al escribir codigo que importa `google-genai` (SDK vigente; sucesor de `google-generativeai`) o `@google/generative-ai`.
- Al disenar pipelines multimodales con Gemini (audio + video + texto + imagen).
- Al evaluar si usar Gemini 3.1 Flash-Lite para escala masiva (> 10k requests/dia a costo minimo).
- Al implementar `thinking_level` para controlar costo/calidad en tareas de razonamiento.
- Al usar la Live API para conversacion en tiempo real o integracion audio-to-audio.
- Al generar o editar imagenes con Gemini 3.1 Flash Image (Nano Banana 2) en un pipeline conversacional.
- Al procesar corpus documentales > 100MB que superan el contexto de Claude.


## Cuando NO Activar Este Perfil

- La tarea usa el bridge MCP de Gemini (`mcp-gemini.js`) — esa integracion ya esta encapsulada, no requiere conocimiento del SDK directo.
- El modelo es Claude, no Gemini — usar `claude-api` o `ai-integrations`.
- La tarea es analisis de un archivo o repositorio via Gemini gratuito — el bridge MCP ya lo maneja sin este skill.
- El proyecto tiene `google-genai`/`@google/generative-ai` solo como dependencia transitiva y no lo usa directamente.

## Primera Accion al Activar

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta uso de google-genai, GEMINI_API_KEY, vertexai, variante de Gemini activa y modalidades de entrada/salida configuradas")
```

Si MCP gemini-bridge no disponible:
```bash
grep -r "gemini\|google-genai\|GEMINI_API_KEY" . --include="*.ts" --include="*.py" --include="*.env*" -l
```

## Directiva de Interrupcion

Insertar directiva y detener ante:

- La integracion propuesta envia PII o datos sensibles a la API de Gemini sin evaluar si el acuerdo de datos del anfitrion lo permite (GDPR, HIPAA, contratos de cliente).
- `thinking_level: "high"` se deja como default implicito en un flujo de alto volumen sin evaluar costo — es el default de la API si no se especifica, y es la opcion mas cara.
- La tarea requiere outputs deterministicos (firmas legales, calculos financieros regulados) — los modelos generativos no son deterministas.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Familia Gemini 3.x — Seleccion de Variante

El tier "Flash-Thinking" de la generacion 2.5 desaparecio como modelo separado: el razonamiento ahora es un parametro (`thinking_level`) configurable en cualquier modelo de la familia 3, no un modelo distinto.

| Variante | Contexto | Thinking | Uso optimo | Costo relativo |
|---|---|---|---|---|
| `gemini-3.1-pro-preview` | 1M tokens | `thinking_level` (low/medium/high) | Razonamiento complejo, corpus muy largos, benchmarks exigentes | Alto |
| `gemini-3.5-flash` | 1M tokens | `thinking_level` (low/medium/high) | Tareas agenticas multi-step, coding, rinde por encima de 3.1 Pro en varios benchmarks | Medio-alto (~5x el costo de 3.1 Flash-Lite) |
| `gemini-3.1-flash-live-preview` | — (streaming) | Si | Live API audio-to-audio, conversacion en tiempo real | Medio |
| `gemini-3.1-flash-lite` | 1M tokens | `thinking_level` (low/medium/high, default low recomendado) | Alta escala, throughput masivo, costo minimo — heredero directo del tier Lite | Muy bajo |

Nota de verificacion: `gemini-3.5-pro` esta listado como "coming soon" en `deepmind.google` (verificado 2026-07-10) — no usar como default hasta confirmar disponibilidad general.

Regla de seleccion:
1. Tarea de alto volumen con logica simple → `gemini-3.1-flash-lite` con `thinking_level: "low"`.
2. Tarea agentica multi-step o coding con presupuesto medio → `gemini-3.5-flash`.
3. Live API / audio-to-audio → `gemini-3.1-flash-live-preview` (ver `audio-voice-engineer` para detalle; Affective Dialog no soportado a la fecha).
4. Corpus > 500MB o razonamiento muy complejo → `gemini-3.1-pro-preview` con `thinking_level: "high"`.
5. Nunca subir de tier sin medir primero el delta de calidad/costo en un dataset de evaluacion. Ver `llm-evals` para diseno del dataset de evaluacion representativo.

## Function Calling en Gemini 3.x

Reglas de naming de funcion: nombres descriptivos sin espacios ni caracteres especiales (letras, numeros, guion bajo, punto o guion, maximo 64 caracteres). Las descripciones deben indicar CUANDO usar la funcion, no solo que hace (ejemplo oficial de Google: no "Gets data" sino "Retrieves the current stock price for a given ticker symbol. Use this when the user asks about stock prices or market data"). Usar `enum` para valores de conjunto finito en vez de describirlos en texto libre; usar `integer` en vez de `number` cuando el valor siempre es entero. Limitar el set activo de tools (guia practica de 10 a 20 herramientas) porque demasiadas aumentan el riesgo de seleccion incorrecta. Iterar sobre todas las function calls devueltas en la respuesta, ya que Gemini puede solicitar varias en un mismo turno, sean paralelas o composicionales encadenadas.

## Structured Output con Gemini

Usar `response_schema` junto con `response_mime_type: "application/json"` en `generation_config` para forzar el output a cumplir un JSON Schema. Nombrar los campos del schema de forma intuitiva. Los campos opcionales requieren `nullable: true` (subconjunto OpenAPI 3.0 que usa la API de Gemini) — no es el mismo mecanismo que el union-con-null de otros proveedores, aunque el principio de diseno de schema (marcar explicitamente que campos pueden faltar) es el mismo. Verificar que extraccion estructurada desde documentos (ej. clasificacion por severidad) usa `response_schema` explicito, no parsing de texto libre.

## Thinking Level — Control de Costo/Calidad

Gemini 3.x reemplaza `thinking_budget` (tokens, generacion 2.5) por `thinking_level` (tres niveles discretos). **Son mutuamente excluyentes: enviar ambos en el mismo request retorna error 400.** Ver detalle extendido de sintaxis en `prompt-engineer` (seccion Dynamic Thinking).

```python
from google import genai

client = genai.Client()

# thinking_level: "low" — rapido, menor costo (tareas simples, clasificacion, alto throughput)
interaction_rapida = client.interactions.create(
    model="gemini-3.1-flash-lite",
    input="Clasifica este texto: " + texto,
    generation_config={"thinking_level": "low"},
)

# thinking_level: "high" — razonamiento maximo, activa Deep Think Mini en 3.1 Pro
interaction_profunda = client.interactions.create(
    model="gemini-3.1-pro-preview",
    input="Diseña la arquitectura de este sistema: " + spec,
    generation_config={"thinking_level": "high"},
)
```

Guia de `thinking_level` por tipo de tarea:
- Clasificacion, extraccion, alto throughput: `low`.
- Analisis con contexto, uso diario general: `medium` (default recomendado si no hay razon para `low` o `high`).
- Razonamiento complejo, arquitectura, benchmarks exigentes: `high`.
- **Si no se especifica `thinking_level`, la API usa `high` por defecto** — fijarlo explicitamente en produccion de alto volumen para evitar costo/latencia inesperados.

## Gemini 3.1 Flash-Lite — Tier 0 de Alta Escala

Flash-Lite es la variante de costo minimo de la familia 3.1. Optimizado para throughput masivo con `thinking_level: "low"`. Candidato a reemplazar o complementar Haiku 4.5 en tier 1 del ai-core para tareas de clasificacion y extraccion de alto volumen.

```python
from google import genai

client = genai.Client()

# Batch de clasificacion — alta escala
import asyncio

async def clasificar(texto: str) -> str:
    interaction = await client.aio.interactions.create(
        model="gemini-3.1-flash-lite",
        input=texto,
        generation_config={"thinking_level": "low"},
    )
    return interaction.output_text

async def batch_clasificacion(textos: list[str]) -> list[str]:
    semaforo = asyncio.Semaphore(50)  # Flash-Lite soporta mayor concurrencia

    async def clasificar_con_limite(t):
        async with semaforo:
            return await clasificar(t)

    return await asyncio.gather(*[clasificar_con_limite(t) for t in textos])
```

Diferencia critica vs 3.5 Flash: Flash-Lite en `thinking_level: "low"` prioriza latencia/costo. Si la tarea requiere razonamiento multi-step, usar `gemini-3.5-flash` o subir el nivel a `medium`/`high`.

## Gemini 3.1 Pro — Contexto de 1M Tokens

Para corpus documentales que superan el contexto de Claude (200k tokens max):

```python
from google import genai

client = genai.Client()

# Subir archivo grande una vez via File API de Google
archivo = client.files.upload(path="corpus_grande.pdf")

# Consultar el corpus sin retransmitir en cada llamada
interaction = client.interactions.create(
    model="gemini-3.1-pro-preview",
    input=[archivo, "Extrae todos los requisitos de seguridad del documento y clasificalos por severidad."],
    generation_config={"thinking_level": "high"},
)
```

Limite practico: 1M tokens = ~750k palabras = ~1500 paginas A4. Para corpus mayores, implementar chunking con Hybrid Search (ver `rag-specialist`).

Para recuperacion de un solo dato puntual dentro del corpus, la precision es alta. Para recuperar multiples elementos discretos en una sola pasada (ej. "todos los requisitos de seguridad"), la precision cae notablemente con multiples needles simultaneos segun documentacion oficial de Google — considerar dividir en multiples solicitudes en vez de una sola con contexto masivo cuando la tarea requiere recuperar muchos items distintos. Colocar la pregunta o instruccion DESPUES del bloque de contexto largo, con una frase de transicion explicita (ejemplo oficial: "Based on the information above...") para anclar la respuesta al contenido precedente.

## Gemini 3.1 Flash Image (Nano Banana 2) — Generacion y Edicion Conversacional

Modelo dedicado de imagen, nombre en codigo "Nano Banana 2" (lanzado 2026-02, verificado 2026-07-10). No es una flag sobre el modelo de texto — es un modelo propio: `gemini-3.1-flash-image-preview`.

```python
from google import genai

client = genai.Client()

# Generacion de imagen desde descripcion
interaction = client.interactions.create(
    model="gemini-3.1-flash-image-preview",
    input="Genera un diagrama de arquitectura de microservicios con tres servicios: API Gateway, Auth Service y Product Service. Estilo tecnico, fondo blanco.",
)

# Edicion conversacional — referencia a imagen anterior en el turno siguiente
chat = client.chats.create(model="gemini-3.1-flash-image-preview")
r1 = chat.send_message("Genera un logo minimalista para una empresa de tecnologia llamada Nexus.")
r2 = chat.send_message("Ahora cambia el color principal a azul marino y agrega un subtitulo 'AI Solutions'.")
```

Capacidades confirmadas (verificado 2026-07-10): coherencia visual hasta 5 personajes y 14 objetos en una misma imagen, renderizado de texto multilingue dentro de la imagen generada, busqueda web en tiempo real para informar el output, aspect ratios flexibles, upscaling hasta 4K.

Casos de uso en produccion:
- Generacion de assets para prototipos sin necesidad de diseñador.
- Edicion iterativa de diagramas tecnicos en ciclos de revision rapida.
- Fusion de multiples imagenes de referencia en un asset final.

## Integracion con Vertex AI (Produccion Empresarial)

Para despliegues con cumplimiento de datos empresarial (los datos no salen de la region del cliente):

```python
import vertexai
from vertexai.generative_models import GenerativeModel

vertexai.init(project=os.environ["GCP_PROJECT"], location="us-central1")
model = GenerativeModel("gemini-3.1-flash")

response = model.generate_content("Analiza este contrato: " + contrato_texto)
```

Diferencias clave Google AI Studio vs Vertex AI:
- Google AI Studio: API key simple, datos pueden usarse para mejorar modelos (por defecto), ideal para desarrollo.
- Vertex AI: autenticacion por Service Account, acuerdo de datos empresarial, no se usan datos para entrenamiento, SLA de disponibilidad.

Regla: para proyectos con datos de clientes finales o contratos de confidencialidad → Vertex AI obligatorio.

## Checklist de Integracion Gemini 3.x

- [ ] Variante seleccionada es la mas barata que completa la tarea (Flash-Lite > 3.5 Flash > Pro).
- [ ] `thinking_level` fijado explicitamente ("low"/"medium"/"high") — nunca dejar el default implicito ("high") en produccion de alto volumen.
- [ ] No se combina `thinking_level` con `thinking_budget` en el mismo request (error 400).
- [ ] GEMINI_API_KEY leida desde variable de entorno — prohibido hardcodear.
- [ ] Para datos de clientes finales: Vertex AI, no Google AI Studio.
- [ ] Concurrencia limitada con `Semaphore` en batch (Flash: max 20, Flash-Lite: max 50).
- [ ] Corpus > 100MB usa File API de Google — no retransmitir en cada request.
- [ ] Live API usa modelo `gemini-3.1-flash-live-preview` — no `gemini-2.5-flash-live-preview` ni `gemini-2.0-flash-live-001` (ambos apagados 2025-12-09).
- [ ] Outputs criticos (financiero, legal) no dependen exclusivamente de Gemini sin validacion humana.
- [ ] Nombres de funcion sin espacios/caracteres especiales, descripciones indican CUANDO usar la funcion, no solo que hace.
- [ ] Extraccion de multiples items desde corpus largo (>1 needle) evalua dividir en varias solicitudes en vez de una sola pasada.

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion. Adicionales:
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.
- Verificar evaluar acuerdo de datos del anfitrion antes de enviar PII a Google AI Studio.
- Verificar justificacion documentada antes de fijar `thinking_level: "high"` en un flujo de alto volumen.
- Asegurar que no se ejecuta: usar Flash-Lite con `thinking_level: "low"` para tareas que requieren razonamiento condicional entre pasos.
- Verificar medir delta de calidad en un dataset de evaluacion representativo antes de subir de tier.
- Prohibido usar `gemini-2.0-flash-live-001` o `gemini-2.5-flash-live-preview` — ambos apagados desde 2025-12-09; usar `gemini-3.1-flash-live-preview`.
