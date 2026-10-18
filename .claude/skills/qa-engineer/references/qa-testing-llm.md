## Testing de Features con LLM Integrado

Las features que usan un LLM como parte de su logica requieren una estrategia de testing en tres capas. Cada capa tiene responsabilidades distintas e inamovibles: no se solapan y no se sustituyen entre si.

Capa 1 — Tests unitarios de construccion de prompts (sin llamadas al LLM):

El objetivo es verificar que la logica determinista que construye el prompt es correcta: seleccion de contexto, truncado de historial, interpolacion de variables. Estos tests son rapidos, baratos y no requieren credenciales de API.

```typescript
describe('construirPromptResumen', () => {
  it('trunca el historial cuando supera el 60% del context window', () => {
    const historialLargo = generarMensajes(200);
    const prompt = construirPrompt({ historial: historialLargo, documento: 'contrato.pdf' });
    expect(calcularTokens(prompt.messages)).toBeLessThanOrEqual(MAX_CONTEXT * 0.6);
  });

  it('incluye el documento en el bloque delimitado correcto', () => {
    const prompt = construirPrompt({ historial: [], documento: 'contrato.pdf' });
    expect(prompt.system).toContain('<retrieved_context>');
    expect(prompt.system).toContain('</retrieved_context>');
  });
});
```

Capa 2 — Tests de integracion con grabacion HTTP (VCR/snapshot):

El objetivo es verificar que la llamada al LLM se ejecuta correctamente con el input construido y que el output se parsea y procesa sin errores. Se intercepta el trafico HTTP y se graba la primera ejecucion como snapshot. Las ejecuciones siguientes reproducen el snapshot sin llamadas reales al proveedor.

Herramientas por stack:
- Node.js: `nock` o `msw` (Mock Service Worker) con modo de grabacion.
- Python: `pytest-recording` (wrapper de `vcrpy`) o `respx` para clientes `httpx`.

Al cambiar el prompt o el modelo, borrar el snapshot existente y grabarlo de nuevo con una llamada real. Conservar el snapshot en el repositorio como artefacto de prueba versionado.

Capa 3 — Evaluacion de calidad (delegada al skill `llm-evals`):

El objetivo es medir si los outputs del LLM cumplen los criterios de calidad del sistema: faithfulness, relevancia, ausencia de alucinaciones. Esta capa no es responsabilidad del QA engineer en solitario: requiere la colaboracion del skill `llm-evals`.

El rol del QA engineer en esta capa es:
- Verificar que el golden dataset cubre los escenarios criticos de la feature.
- Confirmar que el gate de calidad `evals:llm` esta integrado en el pipeline de CI/CD (ver skill `release-manager`).
- Asegurar que existe un umbral numerico definido por metrica antes de aprobar el PR.

No corresponde al QA engineer disenar metricas LLM-as-judge ni mantener el golden dataset. Eso pertenece al skill `llm-evals`.
