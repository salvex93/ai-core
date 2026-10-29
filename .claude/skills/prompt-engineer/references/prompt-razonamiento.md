## Dynamic Thinking (Gemini 3.1 Pro — thinking_level)

Gemini 3.1 Pro soporta `thinking_level` (razonamiento dinamico) como alternativa a Opus extended thinking. Define el grado maximo de razonamiento interno antes de emitir la respuesta. Disponible via Google AI SDK (`google-genai`) o Vertex AI.

Cambio de fondo respecto a la generacion 2.5 (verificado 2026-07-10 contra `ai.google.dev/gemini-api/docs/gemini-3`): el parametro real ya no es `thinking_config.thinking_budget` en tokens — es `thinking_level` con tres valores discretos (`low`/`medium`/`high`). **`thinking_level` y `thinking_budget` son mutuamente excluyentes: combinarlos en el mismo request retorna error 400.** No portar codigo legacy con `thinking_budget` sin migrarlo.

### Niveles de thinking en Gemini 3.1 Pro

```python
from google import genai

client = genai.Client()

interaction = client.interactions.create(
    model="gemini-3.1-pro-preview",
    input="Prompt del usuario",
    generation_config={"thinking_level": "low"},   # "low" | "medium" | "high"
)

print(interaction.output_text)
```

### Cuando usar cada nivel

- `low`: latencia y costo minimos — instruction-following simple, chat, aplicaciones de alto throughput.
- `medium`: default recomendado para uso diario — balance entre calidad y costo.
- `high`: razonamiento maximo, activa "Deep Think Mini" (77.1% en ARC-AGI-2, benchmark Google DeepMind feb-2026). Latencia notablemente mayor hasta el primer token de salida. **Es el default si `thinking_level` no se especifica** — fijar explicitamente `low` o `medium` si el caso de uso no requiere el nivel maximo, para evitar costo/latencia inesperados.

### Reglas de costo y logging

- Los tokens de razonamiento se facturan a la misma tarifa que los tokens de salida.
- El campo exacto de conteo de tokens de razonamiento en la respuesta no esta confirmado en esta pasada — verificar contra la respuesta real del SDK antes de instrumentar logging de costo.
- Migracion desde codigo con `thinking_budget`: reemplazar por el nivel discreto mas cercano (`budget: 0` → `low`; `budget` bajo/fijo → `medium`; `budget: -1`/alto → `high`) y probar contra el error 400 de parametros mutuamente excluyentes.
- Para integracion via bridge MCP del ai-core, delegar al skill `gemini-3-specialist`. Este bloque aplica a integracion directa via SDK.

## Effort Levels (Opus 5.5 / Opus 5 / Opus 4.8 Adaptive Reasoning)

Opus 5.5 (`claude-opus-5-5`; $4/$20 por millon de tokens segun models overview, verificado 2026-10-28) controla la intensidad del razonamiento con `output_config.effort`, parametro GA sin header beta. Cinco niveles: `low`, `medium`, `high` (default de la API en Opus), `xhigh` y `max`. Opus 5 y Opus 4.8 siguen disponibles con la misma semantica. Fuente: platform.claude.com/docs/en/build-with-claude/effort.

### Configuracion

```python
respuesta = cliente.messages.create(
    model="claude-opus-5-5",
    max_tokens=64000,  # en xhigh o max, al menos 64k
    output_config={"effort": "high"},  # low | medium | high | xhigh | max
    messages=[...],
)
```

### Semantica por nivel

| Nivel | Descripcion | Caso de uso |
|---|---|---|
| `low` | Razonamiento minimo, respuesta rapida | Clasificacion, respuestas simples, baja latencia |
| `medium` | Razonamiento moderado | Cargas sensibles a costo |
| `high` | Default; piensa casi siempre | Tareas normales y agentes multistep |
| `xhigh` | Capacidad extendida para trabajo de horizonte largo | Codigo y agentes exigentes, debug profundo |
| `max` | Sin techo de tokens | Solo si una medicion muestra margen sobre `xhigh` |

El sobrecosto de tokens por nivel no esta medido en este repo; no asumir multiplicadores fijos. Con thinking `disabled`, `xhigh` y `max` devuelven 400 en Opus 5.

### Task Budgets vs Effort

- **`effort`**: controla la *profundidad* del razonamiento en cada paso.
- **`task_budget`** (beta): pista consultiva del *trabajo total* del loop agentico. Detalle y forma exacta del parametro en el skill `ai-integrations`, seccion Task Budgets.

Se usan juntos en agentes multi-paso:

```python
with cliente.beta.messages.stream(
    model="claude-opus-5-5",
    max_tokens=128000,
    output_config={"effort": "high", "task_budget": {"type": "tokens", "total": 64000}},
    messages=[...],
    betas=["task-budgets-2026-03-13"],
) as stream:
    respuesta = stream.get_final_message()
```

### Reglas de deployment

- En produccion de alto volumen (>100 req/min) o latencia critica (<500ms), preferir `low`, `medium` o `high`; evaluar `xhigh` solo con medicion propia.
- El effort no cambia `max_tokens`, que sigue siendo el tope duro por request.
- Loguear `effort` y los tokens de `usage` de cada request para auditar la efectividad; el restante del task budget no viene en la respuesta.
- En agentes multistep de larga duracion, considerar `task_budget` junto con `max_tokens` como techo duro.
