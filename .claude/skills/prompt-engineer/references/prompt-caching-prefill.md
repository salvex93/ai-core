## Optimizacion de Prompt Caching desde el Diseño

Prompt Caching puede reducir hasta 90% el costo de tokens de entrada en llamadas repetidas. La efectividad depende de como se estructura el artefacto:

- Colocar todo contenido estatico (rol, restricciones, few-shot examples, documentacion de referencia) al inicio del system prompt, antes de cualquier contenido dinamico.
- Los few-shot examples son candidatos ideales para cache: son voluminosos, no cambian entre llamadas y estan al inicio del contexto.
- Umbral minimo para activar cache: 1024 tokens (Sonnet/Opus) o 2048 (Haiku). Un system prompt por debajo del umbral no genera cache aunque se marque.
- Verificar impacto en `cache_read_input_tokens` de los logs. Hit rate bajo (<50%) indica que contenido dinamico esta mezclado con el estatico o que el prompt no supera el umbral.
- Un cambio de version del prompt invalida el cache de todas las llamadas activas — planificar el rollout como cualquier cambio de esquema.

### Cache Breakpoints — Posicionamiento Estrategico

El breakpoint `cache_control: ephemeral` debe colocarse despues del bloque mas largo y mas estable del system prompt. El contenido **antes** del breakpoint se cachea; el de despues, no.

```python
system = [
    # Bloque 1: rol + restricciones + few-shot (estatico entre sesiones) — CACHEAR AQUI
    {
        "type": "text",
        "text": INSTRUCCIONES_FIJAS_Y_FEW_SHOT,
        "cache_control": {"type": "ephemeral"}
    },
    # Bloque 2: contexto dinamico de la sesion actual — sin cache
    {
        "type": "text",
        "text": contexto_de_la_llamada_actual
    }
]
```

Antipatron: colocar el breakpoint al final del ultimo bloque — en ese caso el contexto dinamico queda dentro del bloque cacheado y el cache se invalida en cada llamada.

El orden de construccion del cache es tools -> system -> messages: un cambio en cualquier nivel invalida ese nivel y todos los siguientes (cambiar `tool_choice` invalida solo messages; cambiar definiciones de tools invalida todo, incluyendo system). El lookback window para encontrar cache hits previos es de 20 bloques hacia atras: en conversaciones que superen esa longitud, anadir un segundo breakpoint explicito mas reciente ademas del original, o el cache-hit se pierde silenciosamente sin error. Si se usan TTL de 5 minutos y 1 hora en el mismo request, los breakpoints de mayor TTL deben ir primero en el prompt.

Verificar siempre `cache_creation_input_tokens` y `cache_read_input_tokens` en la respuesta real: si ambos son cero, el prompt no alcanzo el minimo de tokens cacheables del modelo y el caching se omitio sin error explicito. Para eliminar la latencia del primer request en produccion, pre-calentar el cache con una llamada de `max_tokens: 0` y un breakpoint explicito (no automatico) antes de que lleguen usuarios reales.

## Prefill de Respuesta — Forzar Formato sin Instrucciones Extra

El prefill inicia la respuesta del modelo con contenido predefinido, eliminando la necesidad de instrucciones de formato largas en el prompt.

```python
# Forzar inicio de JSON sin instrucciones de formato en el system prompt.
# texto es contenido no confiable (input de usuario o contexto recuperado) --
# se delimita con <user_input> siguiendo el patron obligatorio de la seccion
# "Prompt Injection - Defensas en el Diseno" de este mismo skill; nunca se
# concatena crudo en el mensaje.
response = client.messages.create(
    model="claude-haiku-4-5-20251001",
    max_tokens=512,
    messages=[
        {"role": "user", "content": f"Analiza este texto:\n<user_input>\n{texto}\n</user_input>"},
        {"role": "assistant", "content": "{"}  # prefill — el modelo continua desde aqui
    ]
)
# La respuesta NO incluye el prefill — concatenar: "{" + response.content[0].text
resultado_json = "{" + response.content[0].text
```

Casos de uso del prefill:
- Forzar inicio de JSON o XML cuando el output siempre sigue un formato fijo.
- Forzar el idioma de la respuesta sin agregarlo en el system prompt.
- Saltar saludos o introducciones cuando se necesita directamente el contenido.

Regla: no usar prefill simultaneamente con `tool_use` forzado — elegir uno de los dos mecanismos para controlar el formato de output.
