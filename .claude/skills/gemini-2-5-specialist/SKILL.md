---
name: gemini-2-5-specialist
description: Especialista en integracion avanzada con la familia Gemini 2.5 (Pro, Flash-Thinking, Flash, Flash-Lite). Cubre thinking budgets, Flash-Thinking como tier intermedio de razonamiento, Live API con TTS nativo y Affective Dialog, image generation conversacional, Flash-Lite como tier 0 de alta escala, contexto de 1M tokens con Gemini Pro, y seleccion de variante segun caso de uso y costo. Activa al integrar Gemini 2.5 directamente (fuera del bridge MCP), disenar pipelines multimodales, o evaluar Flash-Lite como alternativa de escala masiva a Gemini Flash.
origin: ai-core
version: 1.1.0
last_updated: 2026-07-06
---

# Gemini 2.5 Specialist

Gobierna la integracion directa con la familia Gemini 2.5 de Google. Complementa al bridge MCP gemini-bridge (que cubre casos delegados desde Claude) con la logica de integracion programatica directa: SDK, APIs REST, thinking budgets, streaming y seleccion de variante por caso de uso.

Complementos activos: `audio-voice-engineer` (Live API y TTS), `rag-specialist` (corpus documentales), `cost-optimizer` (jerarquia de tier 0), `workflow-orchestrator` (coordinacion de modelos heterogeneos).

## Cuando Activar Este Perfil

- Al escribir codigo que importa `google-generativeai` o `@google/generative-ai`.
- Al disenar pipelines multimodales con Gemini (audio + video + texto + imagen).
- Al evaluar si usar Gemini 2.5 Flash-Lite para escala masiva (> 10k requests/dia a costo minimo).
- Al implementar thinking budgets para controlar costo/calidad en tareas de razonamiento.
- Al usar la Live API para conversacion en tiempo real o integracion audio-to-audio.
- Al generar o editar imagenes con Gemini 2.5 Flash Image en un pipeline conversacional.
- Al procesar corpus documentales > 100MB que superan el contexto de Claude.


## Cuando NO Activar Este Perfil

- La tarea usa el bridge MCP de Gemini (`mcp-gemini.js`) — esa integracion ya esta encapsulada, no requiere conocimiento del SDK directo.
- El modelo es Claude, no Gemini — usar `claude-api` o `ai-integrations`.
- La tarea es analisis de un archivo o repositorio via Gemini gratuito — el bridge MCP ya lo maneja sin este skill.
- El proyecto tiene `@google/generative-ai` solo como dependencia transitiva y no lo usa directamente.

## Primera Accion al Activar

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta uso de google-generativeai, GEMINI_API_KEY, vertexai, variante de Gemini activa y modalidades de entrada/salida configuradas")
```

Si MCP gemini-bridge no disponible:
```bash
grep -r "gemini\|google-generativeai\|GEMINI_API_KEY" . --include="*.ts" --include="*.py" --include="*.env*" -l
```

## Directiva de Interrupcion

Insertar directiva y detener ante:

- La integracion propuesta envia PII o datos sensibles a la API de Gemini sin evaluar si el acuerdo de datos del anfitrion lo permite (GDPR, HIPAA, contratos de cliente).
- El thinking budget configurado supera 50% del presupuesto total de tokens de la sesion — riesgo de costo descontrolado.
- La tarea requiere outputs deterministicos (firmas legales, calculos financieros regulados) — los modelos generativos no son deterministas.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Familia Gemini 2.5 — Seleccion de Variante

| Variante | Contexto | Thinking | Uso optimo | Costo relativo |
|---|---|---|---|---|
| `gemini-2.5-pro` | 1M tokens | Si (ajustable) | Razonamiento complejo, corpus muy largos, benchmarks exigentes | Alto |
| `gemini-2.5-flash-thinking` | 1M tokens | Si (activado por defecto, budget fijo) | Razonamiento paso a paso sin configurar budget, tier intermedio entre Flash y Pro | Medio-alto |
| `gemini-2.5-flash` | 1M tokens | Si (thinking budget manual) | Produccion general, balance inteligencia/latencia, Live API | Medio |
| `gemini-2.5-flash-lite` | 1M tokens | No | Alta escala, throughput masivo, costo minimo | Muy bajo |

Regla de seleccion:
1. Tarea de alto volumen con logica simple → Flash-Lite.
2. Tarea de produccion general o Live API → Flash.
3. Tarea que requiere razonamiento estructurado sin afinar budget → Flash-Thinking.
4. Corpus > 500MB o razonamiento muy complejo → Pro.
5. Nunca subir de Flash a Pro sin medir primero el delta de calidad en un dataset de evaluacion.

## Thinking Budgets — Control de Costo/Calidad

Gemini 2.5 Flash y Pro exponen `thinking_budget` para controlar cuantos tokens usa el modelo para razonamiento interno antes de generar output. A diferencia de Claude, el presupuesto se configura directamente en la llamada.

```python
import google.generativeai as genai

genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel("gemini-2.5-flash")

# Thinking budget bajo — rapido, menor costo (tareas simples)
response_rapido = model.generate_content(
    "Clasifica este texto: " + texto,
    generation_config=genai.types.GenerationConfig(
        thinking_config=genai.types.ThinkingConfig(thinking_budget=256)
    )
)

# Thinking budget alto — mejor razonamiento (tareas complejas)
response_profundo = model.generate_content(
    "Diseña la arquitectura de este sistema: " + spec,
    generation_config=genai.types.GenerationConfig(
        thinking_config=genai.types.ThinkingConfig(thinking_budget=8192)
    )
)

# Sin thinking — Flash-Lite o casos donde velocidad > razonamiento
response_lite = model.generate_content(
    "Extrae el JSON de este texto: " + texto,
    generation_config=genai.types.GenerationConfig(
        thinking_config=genai.types.ThinkingConfig(thinking_budget=0)
    )
)
```

Guia de thinking_budget por tipo de tarea:
- Clasificacion, extraccion: 0-256 tokens.
- Analisis con contexto: 512-2048 tokens.
- Razonamiento complejo, arquitectura: 4096-16384 tokens.
- Maximo disponible: 32768 tokens (Pro), 24576 (Flash).

## Gemini 2.5 Flash-Lite — Tier 0 de Alta Escala

Flash-Lite es la variante de costo minimo de la familia 2.5. Sin thinking, optimizado para throughput masivo. Candidato a reemplazar o complementar Haiku 4.5 en tier 1 del ai-core para tareas de clasificacion y extraccion de alto volumen.

```python
import google.generativeai as genai

model = genai.GenerativeModel("gemini-2.5-flash-lite")

# Batch de clasificacion — alta escala
import asyncio

async def clasificar(texto: str) -> str:
    response = await model.generate_content_async(texto)
    return response.text

async def batch_clasificacion(textos: list[str]) -> list[str]:
    semaforo = asyncio.Semaphore(50)  # Flash-Lite soporta mayor concurrencia

    async def clasificar_con_limite(t):
        async with semaforo:
            return await clasificar(t)

    return await asyncio.gather(*[clasificar_con_limite(t) for t in textos])
```

Diferencia critica vs Flash: Flash-Lite no activa thinking. Si la tarea requiere razonamiento, usar Flash.

## Gemini 2.5 Pro — Contexto de 1M Tokens

Para corpus documentales que superan el contexto de Claude (200k tokens max):

```python
model = genai.GenerativeModel("gemini-2.5-pro")

# Subir archivo grande una vez via File API de Google
import google.generativeai as genai

sample_file = genai.upload_file(path="corpus_grande.pdf", display_name="Corpus")

# Consultar el corpus sin retransmitir en cada llamada
response = model.generate_content([
    sample_file,
    "Extrae todos los requisitos de seguridad del documento y clasificalos por severidad."
])
```

Limite practico: 1M tokens = ~750k palabras = ~1500 paginas A4. Para corpus mayores, implementar chunking con Hybrid Search (ver `rag-specialist`).

## Gemini 2.5 Flash Image — Generacion y Edicion Conversacional

```python
model = genai.GenerativeModel("gemini-2.5-flash")

# Generacion de imagen desde descripcion
response = model.generate_content(
    "Genera un diagrama de arquitectura de microservicios con tres servicios: API Gateway, Auth Service y Product Service. Estilo tecnico, fondo blanco.",
    generation_config=genai.types.GenerationConfig(
        response_modalities=["IMAGE", "TEXT"]
    )
)

# Edicion conversacional — referencia a imagen anterior en el turno siguiente
chat = model.start_chat()
r1 = chat.send_message("Genera un logo minimalista para una empresa de tecnologia llamada Nexus.")
r2 = chat.send_message("Ahora cambia el color principal a azul marino y agrega un subtitulo 'AI Solutions'.")
```

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
model = GenerativeModel("gemini-2.5-flash")

response = model.generate_content("Analiza este contrato: " + contrato_texto)
```

Diferencias clave Google AI Studio vs Vertex AI:
- Google AI Studio: API key simple, datos pueden usarse para mejorar modelos (por defecto), ideal para desarrollo.
- Vertex AI: autenticacion por Service Account, acuerdo de datos empresarial, no se usan datos para entrenamiento, SLA de disponibilidad.

Regla: para proyectos con datos de clientes finales o contratos de confidencialidad → Vertex AI obligatorio.

## Checklist de Integracion Gemini 2.5

- [ ] Variante seleccionada es la mas barata que completa la tarea (Flash-Lite > Flash > Pro).
- [ ] Thinking budget calibrado al tipo de tarea (0 para clasificacion, 4096+ para razonamiento complejo).
- [ ] GEMINI_API_KEY leida desde variable de entorno — prohibido hardcodear.
- [ ] Para datos de clientes finales: Vertex AI, no Google AI Studio.
- [ ] Concurrencia limitada con `Semaphore` en batch (Flash: max 20, Flash-Lite: max 50).
- [ ] Corpus > 100MB usa File API de Google — no retransmitir en cada request.
- [ ] Live API usa modelo `gemini-2.5-flash` — no `gemini-2.0-flash-live-001` (deprecado).
- [ ] Outputs criticos (financiero, legal) no dependen exclusivamente de Gemini sin validacion humana.

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion. Adicionales:
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo Zero-Token' en CLAUDE.md.
- Verificar evaluar acuerdo de datos del anfitrion antes de enviar PII a Google AI Studio.
- Verificar justificacion de complejidad documentada antes de configurar thinking_budget > 16384.
- Asegurar que no se ejecuta: usar Flash-Lite para tareas que requieren razonamiento condicional entre pasos.
- Verificar medir delta de calidad en un dataset de evaluacion representativo antes de subir de Flash a Pro.
- Prohibido usar `gemini-2.0-flash-live-001` — deprecado; usar `gemini-2.5-flash` con Live API.
