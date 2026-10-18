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

## Effort Levels (Opus 5 / Opus 4.8 Adaptive Reasoning)

Opus 5 (`claude-opus-5`, lanzado 24-jul-2026, mismo pricing $5/$25 por millon de tokens que Opus 4.8 y default recomendado en Claude Max) mantiene `effort` para controlar la intensidad del razonamiento por tarea dentro de un presupuesto global. Tres niveles: `low`, `high`, `xhigh`. Opus 4.8 sigue soportado como fallback documentado con la misma semantica de `effort`.

### Configuracion

```python
respuesta = cliente.messages.create(
    model="claude-opus-5",  # fallback documentado: claude-opus-4-8
    effort="high",  # o "low", "xhigh"
    task_budgets={
        "total_budget": 8000,          # Presupuesto global para toda la sesion
        "per_step_min": 512,           # Razonamiento minimo por paso
        "per_step_max": 2048,          # Razonamiento maximo por paso
        "allocation_strategy": "adaptive"  # Opus decide dinamicamente
    },
    messages=[...]
)
```

### Semantica por nivel

| Nivel | Descripcion | Costo token | Caso de uso |
|---|---|---|---|
| `low` | Razonamiento minimo, respuesta rapida | Base | Respuestas simples, clasificacion, baja latencia |
| `high` | Razonamiento balanceado, decision adaptativa | ~1.5x | Tareas normales, resolucion de problemas, agentes multistep |
| `xhigh` | Razonamiento profundo, analisis exhaustivo | ~2.5x | Arquitectura critica, debug profundo, planificacion compleja |

### Task Budgets vs Effort

- **`effort`**: controla la *intensidad* del razonamiento (como de profundo piensa).
- **`task_budgets`**: controla el *presupuesto total* y la *distribucion* entre pasos de un agente multiturn.

Usar ambos juntos en agentes multi-paso donde la complejidad es variable:

```python
# Agente que puede tener pasos simples y pasos complejos
cliente.messages.create(
    model="claude-opus-5",  # fallback documentado: claude-opus-4-8
    effort="high",  # Razonamiento balanceado por defecto
    task_budgets={
        "total_budget": 10000,         # Presupuesto global para toda la sesion del agente
        "per_step_min": 256,
        "per_step_max": 2000,
        "allocation_strategy": "adaptive"  # Opus asigna tokens segun complejidad real de cada paso
    },
    messages=[...]
)
```

### Reglas de deployment

- En produccion, preferir `low` o `high`. Evitar `xhigh` en flujos con alto volumen (>100 req/min) o latencia critica (<500ms).
- El effort no afecta `max_tokens`, solo el estilo de razonamiento interno.
- Loguear `effort`, `thinking_tokens_used` y `budget_remaining` para auditar la efectividad.
- En agentes multistep, `task_budgets` es obligatorio si `effort: "high"` o superior.
