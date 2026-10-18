## Interleaved Thinking en Agentes Multi-Herramienta

Permite que el modelo emita bloques `thinking` entre llamadas a herramientas, razonando sobre cada resultado antes de decidir la siguiente accion.

Cuando activar:
- El agente toma decisiones condicionales basadas en resultados intermedios de herramientas.
- El flujo tiene mas de tres pasos de herramienta con dependencias entre ellos.
- La tarea requiere verificacion de coherencia entre resultados de diferentes herramientas.

No activar en flujos deterministas simples — el overhead de tokens no se justifica sin razonamiento adaptativo.

Reglas: incluir bloques `thinking` del turno anterior en el historial del siguiente. Loguear tokens thinking separado. Requiere `claude-sonnet-5` o superior.

## Adaptive Thinking — sintaxis vigente (verificado 2026-09-15 contra platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost)

El thinking del modelo es adaptativo por defecto: en cada request el modelo evalua la complejidad y decide por si mismo si razonar y cuanto, sin que el llamador fije un presupuesto de tokens. El control real de intensidad es el parametro `output_config.effort` (no un campo dentro de `thinking`), con 5 niveles: `max` (siempre piensa, sin techo), `xhigh`, `high` (default, piensa casi siempre), `medium` (razonamiento moderado, puede omitirlo en consultas simples), `low` (lo omite salvo que la tarea lo amerite).

```typescript
const respuesta = await cliente.messages.create({
  model: 'claude-opus-5',
  thinking: { type: 'adaptive' },
  output_config: { effort: 'medium' },  // control real de intensidad, no thinking.type
  max_tokens: 16000,
  messages: historial,
});
```

Corregido: `thinking: { type: "auto" }` NO es un valor valido de la API — el tipo correcto es `"adaptive"`. El modo `{ type: "enabled", budget_tokens: N }` sigue existiendo pero la fuente primaria lo describe como "legacy manual mode"; en modelos con thinking adaptativo (Opus 5 en adelante) preferir `thinking: { type: "adaptive" }` + `output_config.effort` sobre fijar `budget_tokens` a mano.

Cambiar `effort` entre requests invalida el cache de prompt (mismo nivel de invalidacion que `tools`/`system`/`messages`) — fijar un nivel por conversacion y usar steering por mensaje (`"Piensa con cuidado antes de responder"` / `"Responde directo sin deliberar"`) para variar la profundidad turno a turno sin romper cache.

Loguear `output_tokens_details.thinking_tokens` (no `thinking_tokens` suelto) separado de `output_tokens` — asi se ve que porcion del costo billeado es razonamiento interno vs texto de respuesta.
