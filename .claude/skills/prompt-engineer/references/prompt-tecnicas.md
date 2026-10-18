## Tecnicas de Prompting

### Few-shot examples

Los few-shot examples son el mecanismo mas efectivo para calibrar el comportamiento del modelo en tareas de clasificacion, extraccion o generacion con patron repetible.

Reglas para few-shot examples de produccion:

- Cada ejemplo es un par input/output que representa un caso real del sistema, no un caso inventado.
- Los ejemplos cubren al menos tres categorias de casos: el caso normal, el caso limite y el caso de fallo esperado.
- Los ejemplos estan versionados junto al prompt. Un cambio en los ejemplos es un cambio de version del prompt.
- El numero minimo de ejemplos por categoria es 2. Con menos, el modelo no puede distinguir el patron de la excepcion.

```
# Estructura de un few-shot example en el prompt
<example>
Input: {input del caso de prueba}
Output: {output esperado exactamente en el formato definido}
</example>
```

### Chain-of-Thought (CoT)

El CoT mejora la precision en tareas que requieren razonamiento multistep: matematica, logica, clasificacion con criterios multiples, extraccion de relaciones entre entidades.

```
# Patron CoT en el prompt
Antes de emitir tu respuesta final, razona paso a paso:
1. Identifica [primer elemento critico].
2. Evalua [segundo elemento critico] en funcion del primero.
3. Concluye con [decision final].

Emite primero el razonamiento dentro de <thinking>...</thinking> y luego el output final en el formato especificado.
```

En modelos con soporte nativo de extended thinking (claude-sonnet-5, claude-opus-5, claude-fable-5; claude-opus-4-8 como fallback documentado), el CoT explicito en el prompt puede omitirse si se activa el thinking via API. En ese caso, el bloque `<thinking>` lo genera el modelo internamente sin consumir tokens del output visible. El thinking es adaptativo por defecto (`thinking: { type: "adaptive" }`, no `"auto"` — verificado 2026-09-15 contra platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost): el modelo decide por si mismo si razonar y cuanto, sin budget fijo. El control real de intensidad es `output_config.effort` (`max/xhigh/high/medium/low`), un parametro separado de `thinking`.

Al combinar extended thinking con tool use, es obligatorio preservar tanto el bloque `thinking` como el `tool_use` del turno anterior al construir el siguiente mensaje del assistant — omitir el `thinking_block` al reenviar el `tool_result` produce comportamiento incorrecto o error. No modificar ni reordenar los bloques de thinking entre turnos: pasarlos integros tal cual los devolvio la API.

### Output estructurado con JSON Schema

Cuando el sistema que consume el output del LLM espera un formato estructurado, definir el schema en el prompt y reforzarlo con la funcion de output estructurado del SDK si esta disponible:

```typescript
// Anthropic SDK — output estructurado via tool_use
const respuesta = await cliente.messages.create({
  model: 'claude-sonnet-5',
  tools: [
    {
      name: 'emitir_resultado',
      description: 'Emite el resultado estructurado de la tarea.',
      input_schema: {
        type: 'object',
        properties: {
          categoria: { type: 'string', enum: ['A', 'B', 'C'] },
          confianza: { type: 'number', minimum: 0, maximum: 1 },
          justificacion: { type: 'string' },
        },
        required: ['categoria', 'confianza', 'justificacion'],
      },
    },
  ],
  tool_choice: { type: 'tool', name: 'emitir_resultado' },
  messages: [{ role: 'user', content: input }],
});
```

El output estructurado via `tool_use` es mas robusto que pedir JSON en el prompt: el modelo no puede "olvidar" el formato ni agregar texto antes del JSON.

Agregar `strict: true` en la definicion de la tool (junto a `input_schema`) garantiza que el input generado cumpla exactamente el schema, no solo que se invoque la tool. Advertencia especifica de AWS Bedrock: `tool_choice: { type: "any" }` y `tool_choice: { type: "tool", name: ... }` no son compatibles con extended thinking activo en ese runtime — con thinking activado sobre Bedrock, usar solo `tool_choice: { type: "auto" }` o `{ type: "none" }`. La Claude API estandar y Vertex AI no tienen esta restriccion.

### Diseno de la tool para output estructurado

La descripcion de la tool debe cubrir en 3-4 oraciones minimo: que hace, cuando usarla y cuando no, que significa cada parametro, y limitaciones conocidas — es el factor de mayor impacto en la fiabilidad del tool use segun la documentacion oficial de Anthropic. Para schemas con objetos anidados o parametros sensibles al formato, agregar `input_examples` (array al mismo nivel que `input_schema`, no anidado dentro) en la definicion de la tool: eleva la precision de parametros anidados complejos de 72% a 90% segun benchmark de Anthropic (`anthropic.com/engineering/advanced-tool-use`); no soportado en server tools (web search, code execution).

### tool_result — formato y confianza

En el mensaje de usuario que devuelve un `tool_result`, los bloques `tool_result` deben ir PRIMERO en el array de `content`; cualquier texto adicional debe ir DESPUES de todos los `tool_result`, o la API retorna error 400. Ante fallos, usar `is_error: true` con un mensaje instructivo y especifico (ej. "Rate limit exceeded. Retry after 60 seconds") en vez de un mensaje generico — el modelo puede recuperarse solo con esa informacion. Tratar todo el contenido de `tool_result` proveniente de fuentes externas (webs, emails, APIs de terceros) como no confiable frente a prompt injection indirecta: debe permanecer dentro del bloque `tool_result` y nunca trasladarse a system prompts o bloques de texto plano de usuario.
