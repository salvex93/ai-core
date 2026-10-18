## Modulo — Vanguardia Transversal en Recuperacion Semantica

### Principio fundamental

Un pipeline RAG que responde con una fuente citada pero recupera el fragmento equivocado no cumple el objetivo — la cita correcta sobre contenido irrelevante es peor que admitir ignorancia. El listón no es "el retrieval corre y devuelve top-K": es que chunking, fusion hibrida y re-ranking trabajen como un solo sistema calibrado contra el corpus real, no una libreria de vectorstore con sus defaults de tutorial encendidos. Si no se puede declarar en una frase por que este pipeline recupera mejor que una busqueda vectorial pura sobre el mismo corpus, no esta listo.

### Identidad de recuperacion — declarar antes de construir

Ningun pipeline RAG se construye ni se modifica sin declarar primero:

```
IDENTIDAD RAG:
  Naturaleza del corpus: [documentacion tecnica con codigos/nombres propios | conversacional/soporte | legal-regulatorio con clausulas exactas | multimodal texto+imagen/PDF]
  Estrategia de recuperacion: [solo denso | hibrido BM25+denso con RRF | hibrido + re-ranking cross-encoder | hibrido + re-ranking + Contextual Retrieval]
  Tolerancia a latencia: [< 200ms end-to-end, sin re-ranking | 200-500ms, re-ranking aceptable | > 500ms, precision prioritaria sobre velocidad]
  Criterio de fuente de verdad: [una linea — ej. "respuestas sobre codigos de error deben citar el chunk exacto del manual, nunca parafrasear desde memoria del modelo"]
```

Si el corpus mezcla naturalezas (ej. documentacion tecnica + soporte conversacional), declarar una identidad por segmento del corpus, no una identidad promedio que no sirve a ninguno de los dos.

### Prohibido — patrones reconocibles de demo/plantilla

- Chunking fijo de 512 tokens aplicado a todo el corpus sin verificar si el contenido tiene estructura propia (tablas, codigo, listas) que ese tamano rompe a la mitad.
- Similitud coseno pura sobre embeddings sin BM25 ni RRF en corpus con codigos de error, IDs o nombres propios — el caso de tutorial que ignora que la busqueda lexica exacta es insustituible para ese tipo de consulta.
- Top-K fijo en 3-5 sin justificar por que ese numero y no 10 o 20 antes del re-ranking — el "K=5 porque es lo que trae el ejemplo de LangChain".
- Prompt de generacion que concatena chunks recuperados sin indicar al LLM que cite la fuente ni que admita ausencia de informacion si el retrieval no trajo nada relevante.
- Re-ranking activado por defecto en flujos con restriccion de latencia estricta, solo porque "mejora la precision", sin medir el costo de los 50-200ms adicionales contra el presupuesto real del caso de uso.
- Coleccion vectorial sin metadatos de trazabilidad (`documento_id`, `seccion`, `version_documento`) — imposible auditar de donde vino un chunk cuando el usuario cuestiona una respuesta.

### Gate de calidad medible (no solo estetico)

| Metrica | Umbral | Verificacion |
|---|---|---|
| Precision de fuente citada | >= 90% de respuestas con fuente correctamente atribuida | Muestra de 50-100 queries reales evaluadas contra el chunk de origen real, no autoevaluacion del LLM |
| Tasa de admision de ignorancia | >= 95% de queries sin informacion en el corpus resultan en respuesta que admite ausencia, no alucinacion | Set de queries adversariales fuera de corpus, verificado manualmente |
| Recall@K antes de re-ranking | >= 85% del chunk relevante presente en el top-20/50 recuperado | Dataset de evaluacion con ground truth de chunk correcto por query, script de recall automatizado |
| Latencia p99 del pipeline completo | Segun tolerancia declarada en IDENTIDAD RAG — nunca "lo que tarde" | Medicion end-to-end con carga real, no con corpus de prueba de 10 documentos |
| Degradacion tras cambio de modelo de embedding o reranker | <= 5% de caida en precision de fuente sobre el mismo set de evaluacion | Comparacion A/B del mismo dataset de evaluacion antes/despues del cambio |

Un cambio que no se puede medir contra este set de metricas no se aprueba solo porque "se ve bien" en una prueba manual de 3 queries.

### Vigencia — estandar mas reciente del dominio

Verificado en esta pasada contra fuente oficial (`docs.cohere.com/changelog/rerank-v3.5`, `docs.cohere.com/docs/rerank`): `rerank-v3.5` (release diciembre 2024) sigue siendo el modelo Cohere Rerank vigente — unifica ingles y multilingue en un solo modelo, context length de 4096 tokens, y la API v2 reemplazo `max_chunks_per_doc` por `max_tokens_per_doc`. No se encontro evidencia oficial de una version posterior (v4 o similar) en esta verificacion.

Verificado 2026-08-15 contra `anthropic.com/engineering/contextual-retrieval` (fuente primaria del proveedor): el prompt literal, el desglose de mejora por combinacion (35%/49%/67%) y el costo de caching (~$1.02 por millon de tokens de documento) de la seccion "Contextual Retrieval" arriba quedaron actualizados contra esta fuente — la version previa de esta seccion citaba solo un rango generico ("35-50%") sin especificar a que combinacion de tecnicas correspondia, lo cual podia inducir a citar la cifra mas favorable (49% o mas) para una implementacion que en realidad solo aplica contextual embeddings solos (35%).

El resto de datos tecnicos de esta seccion (parametro `k=60` para RRF, rangos de recall@K, umbrales de latencia de re-ranking) son practica estandar de la industria documentada en literatura tecnica, no un dato de version/pricing/deprecacion de proveedor puntual — no requieren la misma verificacion contra fuente oficial primaria que un identificador de modelo, pero siguen siendo orientativos: calibrar contra el corpus y caso de uso real antes de fijarlos como umbral de produccion. Cualquier mencion futura a un modelo de reranking o embedding especifico en este modulo debe pasar por el Protocolo de Vigencia Tecnologica de CLAUDE.md antes de escribirse como confirmado.

Reverificado 2026-09-15 contra `docs.cohere.com/docs/rerank` (Rerank v3.5 sin cambio) y `anthropic.com/engineering/contextual-retrieval` (cifras de mejora y costo de caching sin cambio) — sin drift. Confirmado ademas contra `docs.ragas.io/en/stable/concepts/metrics/available_metrics/` y `promptfoo.dev/docs/configuration/guide/` que las metricas de evaluacion RAG citadas por `llm-evals` (skill hermano de este en el mismo dominio) siguen alineadas con las tecnicas de retrieval documentadas aqui.
