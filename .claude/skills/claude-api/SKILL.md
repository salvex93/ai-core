---
name: claude-api
description: Especialista en Claude API y Anthropic SDK (Python/TypeScript). Cubre prompt caching, extended thinking, tool use, streaming, Batch API, Files API, modelos Opus/Sonnet/Haiku, migracion entre versiones de modelo y optimizacion de costo por token. Activa al escribir codigo que importa anthropic/@anthropic-ai/sdk, disenar pipelines con cache de prompts, implementar tool use nativo, o migrar entre versiones de Claude.
origin: ai-core
version: 1.0.0
last_updated: 2026-04-27
---

# Claude API Specialist

## Cuando Activar Este Perfil

- Codigo importa `anthropic` o `@anthropic-ai/sdk`.
- El usuario pregunta sobre prompt caching, cache hit rate, o costos de inferencia.
- Implementacion de tool use, streaming, thinking extendido o Batch API.
- Migracion de modelo: Haiku 4.5 → Sonnet 4.6 → Opus 4.7, o reemplazo de modelos retirados.
- Disenar system prompts con cache para reducir costo en sesiones largas.

## Primera Accion al Activar

1. Verificar version del SDK en `package.json` o `requirements.txt` via CONTEXT_MAP — no leer el archivo completo.
2. Identificar el modelo activo en el codigo (grep por `claude-` en archivos fuente).
3. Detectar si hay prompt caching activo (`cache_control` en el codigo).

```bash
grep -r "cache_control\|anthropic\|claude-" src/ --include="*.ts" --include="*.py" -l
```

## Modelos Vigentes (2026-04)

| Modelo | ID | Uso recomendado |
|---|---|---|
| Opus 4.7 | `claude-opus-4-7` | Razonamiento complejo, agentes autonomos |
| Sonnet 4.6 | `claude-sonnet-4-6` | Produccion general, balance costo/calidad |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | Tareas simples, maximo ahorro de tokens |

## Prompt Caching — Patron Obligatorio

Todo proyecto con Claude API DEBE incluir cache en el system prompt si supera 1024 tokens:

```python
# Python — cache en system prompt
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
// TypeScript — cache en system prompt
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: [
    {
      type: "text",
      text: SYSTEM_PROMPT_LARGO,
      cache_control: { type: "ephemeral" }
    }
  ],
  messages: [{ role: "user", content: userMessage }]
});
```

Cache reduce costo hasta 90% en tokens de input repetidos. TTL: 5 minutos.

## Tool Use — Patron Minimo

```python
tools = [
    {
        "name": "get_data",
        "description": "Obtiene datos del sistema",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Consulta a ejecutar"}
            },
            "required": ["query"]
        }
    }
]

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "Busca los datos de X"}]
)

# Manejar tool_use en la respuesta
if response.stop_reason == "tool_use":
    tool_block = next(b for b in response.content if b.type == "tool_use")
    result = execute_tool(tool_block.name, tool_block.input)
```

## Streaming

```python
with client.messages.stream(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": prompt}]
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
```

## Batch API (procesamiento masivo con 50% descuento)

```python
batch = client.messages.batches.create(
    requests=[
        {"custom_id": f"req-{i}", "params": {"model": "claude-haiku-4-5-20251001", "max_tokens": 256, "messages": [{"role": "user", "content": prompt}]}}
        for i, prompt in enumerate(prompts)
    ]
)
# Recuperar resultados cuando batch.processing_status == "ended"
```

## Checklist de Optimizacion de Costo

- [ ] System prompt > 1024 tokens tiene `cache_control: ephemeral`.
- [ ] Modelo seleccionado es el minimo suficiente para la tarea (Haiku si aplica).
- [ ] Batch API activo para > 10 requests independientes.
- [ ] `max_tokens` ajustado al output esperado, no al maximo.
- [ ] Streaming activo si el usuario espera respuesta en tiempo real.

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
