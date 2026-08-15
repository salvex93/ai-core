---
name: claude-api
description: Especialista en Claude API y Anthropic SDK (Python/TypeScript). Cubre prompt caching, extended thinking, tool use, streaming, Batch API, Files API, Citations API, modelos Fable 5/Opus/Sonnet/Haiku, migracion entre versiones de modelo y optimizacion de costo por token. Activa al escribir codigo que importa anthropic/@anthropic-ai/sdk, disenar pipelines con cache de prompts, implementar tool use nativo, o migrar entre versiones de Claude.
origin: ai-core
version: 1.3.1
last_updated: 2026-08-15
rol: coder
compatibility: Depende de @anthropic-ai/sdk (o el paquete Python `anthropic`) y conectividad de red hacia api.anthropic.com.
---

# Claude API Specialist

## Cuando Activar Este Perfil

- Codigo importa `anthropic` o `@anthropic-ai/sdk`.
- El usuario pregunta sobre prompt caching, cache hit rate, o costos de inferencia.
- Implementacion de tool use, streaming, extended thinking o Batch API.
- Migracion de modelo: Haiku 4.5 → Sonnet 5 → Opus 5, o reemplazo de modelos retirados.
- Disenar system prompts con cache para reducir costo en sesiones largas.
- Uso de Citations API para documentos estructurados o Files API para contexto persistente.


## Cuando NO Activar Este Perfil

- El codigo usa OpenAI, Gemini u otro proveedor — este skill es especifico de Anthropic SDK.
- La tarea es diseno del prompt, no la implementacion de la llamada — usar `prompt-engineer`.
- La tarea es integrar el LLM como feature completa de producto (endpoint, streaming, fallback) — usar `ai-integrations`.
- La tarea es construir un agente con herramientas — usar `claude-agent-sdk`.

## Primera Accion al Activar

1. Verificar version del SDK en `package.json` o `requirements.txt` via CONTEXT_MAP — no leer el archivo completo.
2. Identificar el modelo activo en el codigo (grep por `claude-` en archivos fuente).
3. Detectar si hay prompt caching activo (`cache_control` en el codigo).

```bash
grep -r "cache_control\|anthropic\|claude-" src/ --include="*.ts" --include="*.py" -l
```

## Modelos Vigentes (verificado 2026-08-14 contra anthropic.com/news/claude-opus-5 y platform.claude.com/docs/en/about-claude/models/overview)

| Modelo | ID exacto | Uso recomendado |
|---|---|---|
| Fable 5 | `claude-fable-5` | Razonamiento profundo multi-paso, diseno de sistemas, alternativa a Opus cuando la tarea es puro razonamiento sin computer use |
| Opus 5 | `claude-opus-5` | Recomendado por defecto para agentes autonomos, computer use, arquitectura con herramientas integradas — nuevo default en Claude Max, mismo pricing que Opus 4.8 ($5/$25 por MTok) |
| Opus 4.8 | `claude-opus-4-8` | Version anterior, aun soportada — mantener solo si el proyecto ya fijo esta version por compatibilidad especifica |
| Sonnet 5 | `claude-sonnet-5` | Produccion general, balance costo/calidad |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | Tareas simples, maximo ahorro de tokens |

Jerarquia de costo: Haiku < Sonnet < Opus ≈ Fable. Usar siempre el minimo suficiente.
Regla de seleccion Fable vs Opus: si la tarea requiere razonamiento profundo SIN herramientas integradas → Fable 5. Si requiere computer use o loops de agente con tools → Opus 5 (Opus 4.8 como fallback documentado).

## Prompt Caching — Patron Obligatorio

Todo proyecto con Claude API DEBE incluir cache en el system prompt si supera 1024 tokens (512 en Opus 5; 4096 en Haiku 4.5 — el minimo cacheable varia por modelo).
Cache reduce costo hasta 90% en tokens de input repetidos. TTL disponibles: **5 minutos** (default, escritura a 1.25x el precio de input base) y **1 hora** (escritura a 2x, para pipelines de agente con pasos espaciados mas de 5 minutos entre si). Lectura de cache: 0.1x el precio de input base en ambos TTL. Sintaxis del TTL de 1h: `"cache_control": {"type": "ephemeral", "ttl": "1h"}`.

```python
response = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": SYSTEM_PROMPT_LARGO,
            "cache_control": {"type": "ephemeral"}
        }
    ],
    messages=[{"role": "user", "content": user_message}]
)
```

```typescript
const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  system: [{ type: "text", text: SYSTEM_PROMPT_LARGO, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: userMessage }]
});
```

### Cache Breakpoints — Posicionamiento Estrategico

Posicionar `cache_control` despues del bloque que cambia con menor frecuencia:

```python
system = [
    {"type": "text", "text": INSTRUCCIONES_FIJAS, "cache_control": {"type": "ephemeral"}},  # cache aqui
    {"type": "text", "text": contexto_dinamico_de_sesion}  # sin cache — cambia por turno
]
```

Regla: el contenido antes del breakpoint se cachea; el de despues, no. Colocar el breakpoint despues del bloque mas largo y mas estable.

## Extended Thinking — Patron con Streaming

Para razonamiento profundo en Opus 5. Usar streaming para no bloquear el proceso:

```python
with client.messages.stream(
    model="claude-opus-5",
    max_tokens=16000,
    thinking={"type": "enabled", "budget_tokens": 10000},
    messages=[{"role": "user", "content": pregunta_compleja}]
) as stream:
    for event in stream:
        if event.type == "content_block_start" and event.content_block.type == "thinking":
            pass  # bloque de razonamiento interno — no mostrar al usuario
        elif event.type == "text":
            print(event.text, end="", flush=True)
```

`budget_tokens`: cuantos tokens puede usar Claude para razonar internamente. Ajustar al 60-80% de `max_tokens`.

## Tool Use — Patron Minimo

```python
tools = [{
    "name": "get_data",
    "description": "Obtiene datos del sistema",
    "input_schema": {
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"]
    }
}]

response = client.messages.create(
    model="claude-sonnet-5", max_tokens=1024, tools=tools,
    messages=[{"role": "user", "content": "Busca los datos de X"}]
)

if response.stop_reason == "tool_use":
    tool_block = next(b for b in response.content if b.type == "tool_use")
    result = execute_tool(tool_block.name, tool_block.input)
```

Este patron aplica a catalogos pequenos de herramientas (todas se cargan siempre). Para catalogos grandes de tools o servidores MCP con muchos servicios, ver "Tool Search Tool" abajo.

### Tool Use Examples — subir precision en schemas anidados complejos

Verificado 2026-08-14 contra platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools: el campo `input_examples` (array al mismo nivel que `input_schema`, no anidado dentro de el) sube la precision de parametros anidados complejos de 72% a 90% en el benchmark de Anthropic. No soportado en server tools (web search, code execution).

```python
tools = [{
    "name": "get_weather",
    "description": "Obtiene el clima de una ubicacion",
    "input_schema": {"type": "object", "properties": {"location": {"type": "string"}, "unit": {"type": "string"}}},
    "input_examples": [
        {"location": "San Francisco, CA", "unit": "fahrenheit"},
        {"location": "New York, NY"}
    ]
}]
```

Cada ejemplo debe validar contra `input_schema`. Usar siempre que el schema tenga arrays anidados o mas de 2-3 campos con formato ambiguo (ej. fechas, enums, estructuras compuestas).

### Tool Search Tool — descubrimiento diferido para catalogos grandes

Verificado 2026-08-14 contra platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool: cuando el catalogo de herramientas es grande (muchos servidores MCP, decenas de tools), cargar todas las definiciones completas en cada request infla el costo de input. `defer_loading: true` es un campo booleano dentro de cada definicion de tool individual — el array `tools` sigue enviando todas las definiciones (el servidor las necesita para expandir referencias), pero Claude las descubre bajo demanda en vez de razonar sobre el catalogo completo desde el primer token. Reduce hasta 85% de tokens de descubrimiento de herramientas.

```python
tools = [
    {"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"},
    {
        "name": "get_weather",
        "description": "...",
        "input_schema": {"type": "object", "properties": {"location": {"type": "string"}}},
        "defer_loading": True,
    },
    # resto del catalogo grande, todas con defer_loading: True
]
```

Variante `tool_search_tool_bm25_20251119` disponible para busqueda en lenguaje natural en vez de regex. Al menos una tool de busqueda debe quedar sin `defer_loading` (o en `false`). Claude descubre tools via bloques `tool_search_tool_result` con `tool_references` que la API expande automaticamente.

### Programmatic Tool Calling — orquestacion via codigo, no llamadas secuenciales

Verificado 2026-08-14 contra platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling: para tareas con 3+ llamadas de tool dependientes entre si, este patron reduce ~37% de tokens facturados en el benchmark de Anthropic al dejar que Claude escriba codigo que orquesta las llamadas, en vez de hacer una tool call por turno. Se activa incluyendo la tool `code_execution_20260120` en `tools`, y agregando `allowed_callers: ["code_execution_20260120"]` a cada tool que Claude debe poder invocar desde el codigo que escribe:

```python
tools = [
    {"type": "code_execution_20260120", "name": "code_execution"},
    {
        "name": "query_database",
        "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}},
        "allowed_callers": ["code_execution_20260120"],
    },
]
```

La respuesta incluye un bloque `server_tool_use` (name `code_execution`) con el codigo que Claude escribio, seguido de bloques `tool_use` con un campo `caller: {"type": "code_execution_20260120", "tool_id": "srvtoolu_..."}` que identifica que ejecucion de codigo invoco cada tool. `stop_reason` sigue siendo `"tool_use"` mientras el modelo espera resultados.

## Batch API — 50% de descuento para procesamiento no urgente

```python
batch = client.messages.batches.create(
    requests=[
        {"custom_id": f"req-{i}", "params": {
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 256,
            "messages": [{"role": "user", "content": prompt}]
        }}
        for i, prompt in enumerate(prompts)
    ]
)
# Recuperar cuando batch.processing_status == "ended"
for result in client.messages.batches.results(batch.id):
    print(result.custom_id, result.result.message.content)
```

Usar Batch API para: evaluaciones masivas, enriquecimiento de datos, generacion de embeddings, cualquier tarea con > 10 requests independientes sin SLA de tiempo real.

## Files API — Contexto Persistente entre Sesiones

Subir archivos grandes una vez, referenciarlos en multiples requests sin retransmitir el contenido:

```python
# Subir una vez
with open("documento.pdf", "rb") as f:
    file_obj = client.beta.files.upload(file=("documento.pdf", f, "application/pdf"))

# Referenciar en requests subsiguientes
response = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": [
            {"type": "document", "source": {"type": "file", "file_id": file_obj.id}},
            {"type": "text", "text": "Resume los puntos clave de este documento."}
        ]
    }],
    betas=["files-api-2025-04-14"]
)
```

Caso de uso optimo: documentos de referencia que se consultan en muchos turnos (manuales, specs, bases de conocimiento).

## Citations API — Respuestas con Fuentes Verificables

Para documentos estructurados donde el usuario necesita saber de donde proviene cada afirmacion:

```python
response = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "document",
                "source": {"type": "text", "media_type": "text/plain", "data": contenido_doc},
                "title": "Documento de referencia",
                "citations": {"enabled": True}
            },
            {"type": "text", "text": "¿Cuales son los requisitos de seguridad?"}
        ]
    }]
)
```

## Prefill de Respuesta — Forzar Formato sin Tokens Extra

Forzar JSON u otro formato estructurado sin necesidad de instrucciones largas en el prompt:

```python
response = client.messages.create(
    model="claude-haiku-4-5-20251001",
    max_tokens=512,
    messages=[
        {"role": "user", "content": "Analiza este texto: " + texto},
        {"role": "assistant", "content": "{"}  # prefill fuerza inicio de JSON
    ]
)
# La respuesta comienza despues del prefill — concatenar: "{" + response.content[0].text
```

## Checklist de Optimizacion de Costo

- [ ] System prompt > 1024 tokens tiene `cache_control: ephemeral`.
- [ ] Cache breakpoints posicionados despues del bloque mas estable (no al final).
- [ ] Modelo seleccionado es el minimo suficiente (Haiku si la tarea lo permite).
- [ ] Batch API activo para > 10 requests independientes sin SLA de tiempo real.
- [ ] `max_tokens` ajustado al output esperado, no al maximo del modelo.
- [ ] Streaming activo si el usuario espera respuesta en tiempo real.
- [ ] Files API para documentos > 10KB consultados en multiples turnos.
- [ ] Prefill activo si el output siempre sigue un formato fijo (JSON, XML, tabla).

## ant CLI — Cliente de Linea de Comandos

`ant` es el cliente oficial de Anthropic para interactuar con la Claude API desde terminal. Integrado con Claude Code y con versionado de recursos en YAML.

```bash
# Instalar
npm install -g @anthropic-ai/ant

# Llamada directa al modelo
ant messages create --model claude-sonnet-5 --max-tokens 1024 "Analiza este error: ..."

# Versionado de recursos en YAML
ant prompts push prompts/system.yaml   # versionar prompt
ant prompts pull system-v2             # recuperar version
```

Caso de uso en ai-core: invocar Claude desde hooks de CI/CD sin levantar un proceso Node.js completo. Util para `PreToolUse` hooks que necesitan validacion rapida de inputs.

## Adaptive Thinking — Calibracion Automatica de Razonamiento

Disponible en `claude-opus-5` (y `claude-opus-4-8`). El modelo asigna presupuesto de razonamiento por paso segun la complejidad local, sin requerir `budget_tokens` fijo. No se verifico independientemente en esta pasada si Opus 5 cambia algun detalle de este mecanismo respecto a Opus 4.8 — confirmar contra platform.claude.com antes de asumir paridad total si el comportamiento observado difiere.

```python
# Thinking adaptativo — el modelo decide cuanto razonar por llamada
response = client.messages.create(
    model="claude-opus-5",
    max_tokens=16000,
    thinking={"type": "auto"},   # adaptativo vs {"type": "enabled", "budget_tokens": N}
    messages=[{"role": "user", "content": pregunta}]
)
```

Cuando usar `auto` vs `budget_tokens`:
- `auto`: tareas con complejidad variable entre llamadas — ahorra tokens en pasos simples.
- `budget_tokens: N`: costo predecible por llamada, flujos con complejidad uniforme.

## Context Compaction — Sesiones de Ejecucion Larga

Precision importante (verificado 2026-08-14 contra code.claude.com/docs/en/agent-sdk/agent-loop, seccion "Automatic compaction"): la compactacion automatica de historial es una capacidad del **Claude Agent SDK** (y por extension del `/compact` de la CLI de Claude Code que lo usa), NO un comportamiento de la Messages API llamada directamente con este SDK (`anthropic`/`@anthropic-ai/sdk`). Una llamada cruda a `client.messages.create` con un historial que supera el limite de contexto simplemente falla — no compacta sola. Si el proyecto usa el SDK base de este skill sin el Agent SDK, la compactacion debe implementarse manualmente (ver regla abajo). Si el proyecto SI usa el Agent SDK, ver `claude-agent-sdk` para el detalle de `PreCompact` hook y personalizacion — este skill (`claude-api`) no cubre esa capa.

Regla para pipelines sobre la Messages API directa: si el pipeline de agente supera 20 iteraciones, implementar compaction manual como fallback:
1. Llamar a Claude con el historial completo pidiendo un resumen estructurado de los pasos completados.
2. Reemplazar el historial por `[{"role": "assistant", "content": resumen_compacto}]`.
3. Continuar el pipeline con el historial compactado.

```python
# Ejemplo del paso 1 — resumen estructurado antes de reemplazar el historial
response = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=8192,
    system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
    messages=historial + [{"role": "user", "content": "Resume los pasos completados hasta ahora en un formato estructurado que preserve el estado necesario para continuar la tarea."}],
)
```

## Batch API — Limite 300k tokens (actualizado)

Limite actualizado en 2026: `max_tokens` de hasta 300.000 en Message Batches API para Opus 4.8 y Sonnet 5. Aplica para procesamiento masivo de documentos largos.

```python
batch = client.messages.batches.create(
    requests=[{
        "custom_id": f"doc-{i}",
        "params": {
            "model": "claude-sonnet-5",
            "max_tokens": 300000,   # limite actualizado 2026
            "messages": [{"role": "user", "content": doc_largo}]
        }
    } for i, doc_largo in enumerate(documentos)]
)
```

## Directiva de Interrupcion

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

Activar ante:
- Propuesta de migrar > 3 archivos que usan modelos Claude simultaneamente.
- Deteccion de `anthropic.Anthropic()` sin manejo de errores de rate limit en produccion.
- Sistema que acumula historial de mensajes sin limite de tokens.

El marcador anterior se inserta de forma literal en la respuesta, ademas de la explicacion en prosa — nunca se omite ni se reemplaza por una descripcion equivalente. Emitir el marcador implica detenerse: prohibido entregar en el mismo turno el codigo completo como solucion final aprobada. Si se ilustra con codigo, debe marcarse explicitamente como ejemplo parcial que requiere plan aprobado antes de usarse en produccion.

## Restricciones del Perfil

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.
- Responder exclusivamente en espanol, sin emojis ni adornos visuales (Regla 1 de CLAUDE.md — IDIOMA).
- Prohibido leer archivos completos sin consultar CONTEXT_MAP primero (Regla 10 de CLAUDE.md — CONTEXT_MAP).
- Prohibido agregar logica no solicitada (Principios de Arquitectura, "Cambios minimos" en CLAUDE.md).
- Solo mostrar diffs o bloques minimos — nunca repetir codigo que el usuario ya tiene.
- Siempre incluir `cache_control` en system prompts > 1024 tokens.

## Modulo — Vanguardia en Uso de Claude API y Anthropic SDK

### Identidad declarada antes de ejecutar

Ninguna llamada a la API se codea sin declarar primero el perfil de uso — determina modelo, cache, formato de salida y tolerancia a latencia:

```
IDENTIDAD CLAUDE API:
  Naturaleza de la carga: [conversacional interactiva | batch masivo sin SLA | agente autonomo con tool loop | extraccion estructurada de documentos]
  Modelo minimo suficiente: [Haiku 4.5 | Sonnet 5 | Opus 4.8 | Fable 5]
  Estrategia de cache: [system prompt estatico > 1024 tokens con TTL 5m | contexto de sesion larga con TTL 1h | sin cache — payload cambia en cada llamada]
  Tolerancia a latencia: [streaming obligatorio, usuario esperando | batch, resultado en horas | tool use con multiples turnos, latencia acumulada tolerable]
```

Si el proyecto ya tiene un patron de cache o seleccion de modelo declarado en otra parte del codigo (otro endpoint, otro pipeline), esta identidad es su extension — mismo criterio de costo, no un esquema paralelo de decision de modelo.

### Prohibido — patrones reconocibles de integracion generica

- Llamar `client.messages.create` con `model="claude-opus-4-8"` hardcodeado para tareas triviales (resumen corto, clasificacion binaria) solo porque "es el mejor modelo" — sin justificar por que Haiku o Sonnet no alcanzan.
- System prompt largo (> 1024 tokens) repetido en cada llamada sin `cache_control` — el patron de tutorial que ignora costo de produccion.
- Manejo de `tool_use` que asume un unico bloque de contenido en la respuesta, ignorando que `response.content` puede traer texto y tool_use mezclados en el mismo turno.
- Loop de agente sin limite de iteraciones ni control de presupuesto de tokens — el "while True" copiado de un ejemplo de demo sin guard de salida.
- Captura de excepciones de la API con `except Exception: pass` o equivalente, sin distinguir `RateLimitError`, `APIConnectionError` y `OverloadedError` — las tres deben nombrarse siempre juntas al abordar manejo de errores de la API, nunca mencionarse solo como ejemplo generico ni omitirse una de ellas; tratarlas igual pierde señales de retry vs fallo definitivo.
- `max_tokens` fijado al maximo del modelo "por si acaso", sin relacion con el output real esperado, inflando costo y latencia sin beneficio.

### Gate de calidad medible

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Cache hit rate en sesiones con system prompt repetido | >= 70% de las llamadas subsiguientes a la primera en la misma sesion | Inspeccionar `usage.cache_read_input_tokens` vs `usage.input_tokens` en la respuesta de cada llamada |
| Cache breakpoints por request | <= 4 (limite duro de la API) | Contar bloques con `cache_control` en el payload antes de enviar — la API responde `400` al superar el limite |
| Costo por request en tareas de bajo volumen | Modelo Haiku para inputs < 8k tokens sin razonamiento multi-paso — verificar que no se uso Sonnet/Opus por defecto | Revisar el campo `model` en el log de cada request contra el tamano real del contexto enviado |
| Manejo de rate limit | 100% de las llamadas en produccion envueltas en retry con backoff exponencial ante `429`/`RateLimitError` | Grep de `try/except` o `try/catch` alrededor de cada `client.messages.create` en el codigo fuente |
| Iteraciones de tool use por tarea | Limite explicito y verificable en codigo (ej. `MAX_ITERATIONS = 10`), nunca loop sin cota | Grep del loop de agente — debe existir una condicion de corte ademas de `stop_reason != "tool_use"` |

### Vigencia — estandar mas reciente del dominio

Verificado contra fuente oficial (`platform.claude.com/docs/en/build-with-claude/prompt-caching`, `anthropic.com/news/claude-opus-5`, `anthropic.com/engineering/advanced-tool-use`) — ultima pasada 2026-08-14:

- Limite duro de cache breakpoints: **4 por request**. Un quinto breakpoint explicito devuelve error `400` (sin espacio para cache automatico).
- TTL de cache y minimos cacheables ya consolidados en el cuerpo principal de este skill (seccion "Prompt Caching — Patron Obligatorio") — no dejar esta informacion solo en esta nota de vigencia.
- Opus 5 (`claude-opus-5`) ya incorporado en la tabla de modelos vigentes y en los ejemplos de codigo de este skill.
- Tool Search Tool, Programmatic Tool Calling y `input_examples` ya incorporados en la seccion "Tool Use".
- Pricing exacto por modelo (USD/MTok) no fue re-verificado linea por linea en esta pasada — orientativo, verificar contra `platform.claude.com/docs/en/about-claude/pricing` antes de escribir un numero de costo especifico en una propuesta o skill.
- La sintaxis exacta de subcomandos de `ant CLI` (`ant prompts push/pull`) no pudo confirmarse contra el repositorio oficial (github.com/anthropics/anthropic-cli) en esta pasada — tratar como ilustrativo, no como sintaxis literal verificada, hasta confirmar contra el README del repo.
