## Modulo 9 — Componentes LLM con Streaming (Anthropic SDK v3+ / Gemini Live)

### Patron de renderizado streaming

```typescript
let buffer = '';
let rafId: number;

function onChunk(chunk: string) {
  buffer += chunk;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    outputElement.textContent = buffer;
  });
}
```

### Estados del componente LLM

| Estado | Representacion visual |
|---|---|
| idle | Placeholder o area vacia |
| loading | Skeleton o tres puntos animados |
| streaming | Texto que crece + cursor parpadeante |
| complete | Texto estatico, acciones habilitadas |
| error | Mensaje accionable con opcion de reintentar |

### Cancelacion con AbortController

```typescript
let controller: AbortController | null = null;

function iniciarConsulta(prompt: string) {
  if (controller) controller.abort();
  controller = new AbortController();
  fetchStream(prompt, { signal: controller.signal })
    .catch(err => { if (err.name !== 'AbortError') setState('error'); });
}
```

### Prompt caching en frontend (Anthropic SDK)

```typescript
// Cache breakpoint en system prompt — reduce costo hasta 90% en sesiones largas
const response = await client.messages.create({
  model: 'claude-sonnet-5',
  messages,
  system: [
    {
      type: 'text',
      text: systemPromptLargo,
      cache_control: { type: 'ephemeral' }  // TTL 5 min
    }
  ]
});
```
