---
name: claude-api
description: Especialista en Claude API y Anthropic SDK (Python/TypeScript). Cubre prompt caching, extended thinking, tool use, streaming, Batch API, Files API, Citations API, modelos Opus/Sonnet/Haiku, migracion entre versiones de modelo y optimizacion de costo por token. Activa al escribir codigo que importa anthropic/@anthropic-ai/sdk, disenar pipelines con cache de prompts, implementar tool use nativo, o migrar entre versiones de Claude.
origin: ai-core
version: 1.1.0
last_updated: 2026-05-17
---

# Claude API Specialist

## Cuando Activar Este Perfil

- Codigo importa `anthropic` o `@anthropic-ai/sdk`.
- El usuario pregunta sobre prompt caching, cache hit rate, o costos de inferencia.
- Implementacion de tool use, streaming, extended thinking o Batch API.
- Migracion de modelo: Haiku 4.5 → Sonnet 4.6 → Opus 4.7, o reemplazo de modelos retirados.
- Disenar system prompts con cache para reducir costo en sesiones largas.
- Uso de Citations API para documentos estructurados o Files API para contexto persistente.

## Primera Accion al Activar

1. Verificar version del SDK en `package.json` o `requirements.txt` via CONTEXT_MAP — no leer el archivo completo.
2. Identificar el modelo activo en el codigo (grep por `claude-` en archivos fuente).
3. Detectar si hay prompt caching activo (`cache_control` en el codigo).

```bash
grep -r "cache_control\|anthropic\|claude-" src/ --include="*.ts" --include="*.py" -l
```

## Modelos Vigentes (2026-05)

| Modelo | ID exacto | Uso recomendado |
|---|---|---|
| Opus 4.7 | `claude-opus-4-7` | Razonamiento complejo, agentes autonomos, arquitectura |
| Sonnet 4.6 | `claude-sonnet-4-6` | Produccion general, balance costo/calidad |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | Tareas simples, maximo ahorro de tokens |

Jerarquia de costo: Haiku < Sonnet < Opus. Usar siempre el minimo suficiente.

## Prompt Caching — Patron Obligatorio

Todo proyecto con Claude API DEBE incluir cache en el system prompt si supera 1024 tokens.
Cache reduce costo hasta 90% en tokens de input repetidos. TTL: 5 minutos.

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
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
  model: "claude-sonnet-4-6",
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

Para razonamiento profundo en Opus 4.7. Usar streaming para no bloquear el proceso:

```python
with client.messages.stream(
    model="claude-opus-4-7",
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
    model="claude-sonnet-4-6", max_tokens=1024, tools=tools,
    messages=[{"role": "user", "content": "Busca los datos de X"}]
)

if response.stop_reason == "tool_use":
    tool_block = next(b for b in response.content if b.type == "tool_use")
    result = execute_tool(tool_block.name, tool_block.input)
```

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
    model="claude-sonnet-4-6",
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
    model="claude-sonnet-4-6",
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
ant messages create --model claude-sonnet-4-6 --max-tokens 1024 "Analiza este error: ..."

# Versionado de recursos en YAML
ant prompts push prompts/system.yaml   # versionar prompt
ant prompts pull system-v2             # recuperar version
```

Caso de uso en ai-core: invocar Claude desde hooks de CI/CD sin levantar un proceso Node.js completo. Util para `PreToolUse` hooks que necesitan validacion rapida de inputs.

## Adaptive Thinking — Calibracion Automatica de Razonamiento

Disponible en `claude-opus-4-7`. El modelo asigna presupuesto de razonamiento por paso segun la complejidad local, sin requerir `budget_tokens` fijo.

```python
# Thinking adaptativo — el modelo decide cuanto razonar por llamada
response = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=16000,
    thinking={"type": "auto"},   # adaptativo vs {"type": "enabled", "budget_tokens": N}
    messages=[{"role": "user", "content": pregunta}]
)
```

Cuando usar `auto` vs `budget_tokens`:
- `auto`: tareas con complejidad variable entre llamadas — ahorra tokens en pasos simples.
- `budget_tokens: N`: costo predecible por llamada, flujos con complejidad uniforme.

## Context Compaction — Sesiones de Ejecucion Larga

El agente puede compactar su propio historial de contexto para continuar tareas sin alcanzar el limite de tokens. Util en pipelines de agentes con > 20 pasos.

```python
# Activar compaction en el loop del agente
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=8192,
    system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
    messages=historial,
    # Si el historial se acerca al limite, Claude compacta automaticamente
    # No requiere parametro explicito — se activa por politica del modelo
)
```

Regla: si el pipeline supera 20 iteraciones, implementar compaction manual como fallback:
1. Llamar a Claude con el historial completo pidiendo un resumen estructurado de los pasos completados.
2. Reemplazar el historial por `[{"role": "assistant", "content": resumen_compacto}]`.
3. Continuar el pipeline con el historial compactado.

## Batch API — Limite 300k tokens (actualizado)

Limite actualizado en 2026: `max_tokens` de hasta 300.000 en Message Batches API para Opus 4.7 y Sonnet 4.6. Aplica para procesamiento masivo de documentos largos.

```python
batch = client.messages.batches.create(
    requests=[{
        "custom_id": f"doc-{i}",
        "params": {
            "model": "claude-sonnet-4-6",
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

## Restricciones del Perfil

- Prohibido responder en ingles (Regla 1 de CLAUDE.md).
- Prohibido usar emojis o adornos visuales (Regla 2 de CLAUDE.md).
- Prohibido leer archivos completos sin consultar CONTEXT_MAP primero (Regla 3 de CLAUDE.md).
- Prohibido agregar logica no solicitada (Regla 4 de CLAUDE.md).
- Solo mostrar diffs o bloques minimos — nunca repetir codigo que el usuario ya tiene.
- Siempre incluir `cache_control` en system prompts > 1024 tokens.
