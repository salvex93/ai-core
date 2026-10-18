## Tecnicas Avanzadas de Recuperacion

### Hybrid Search

Combina recuperacion densa (embeddings) con recuperacion lexica (BM25), fusionada con Reciprocal Rank Fusion (RRF).

Cuando usar: corpus con terminos tecnicos, codigos de error o nombres propios; consultas de tipo lookup frecuentes; busqueda vectorial sola produce respuestas vacias o de baja precision.

Implementacion: Qdrant soporta Hybrid Search nativo via `prefetch` con `{"fusion": "rrf"}`. Para motores sin soporte nativo, RRF manual: `score(doc) = sum(1 / (k + rank))` con `k=60` (amortiguacion estandar; valores menores amplifican diferencias entre posiciones).

Combinar siempre con Contextual Retrieval: el contexto mejora la recuperacion semantica; BM25 mejora la lexica.

### Contextual Retrieval

Resuelve la perdida de contexto del chunk al extraerlo del documento original. Genera un prefijo corto (Anthropic reporta 50-100 tokens en la practica) por chunk usando un LLM ligero (Gemini 3.5 Flash via bridge, o Claude Haiku 4.5 si el bridge no aplica), describiendo el documento de origen y la posicion del chunk dentro de el. El chunk almacenado es `{prefijo}\n\n{contenido_original}`.

Prompt de generacion de contexto (verificado 2026-08-15 contra `anthropic.com/engineering/contextual-retrieval`, template literal del proveedor, adaptar solo los placeholders):

```
<document>
{{WHOLE_DOCUMENT}}
</document>
Here is the chunk we want to situate within the whole document
<chunk>
{{CHUNK_CONTENT}}
</chunk>
Please give a short succinct context to situate this chunk within the overall document
for the purposes of improving search retrieval of the chunk. Answer only with the
succinct context and nothing else.
```

**Contextual BM25** (distinto del BM25 clasico ya cubierto en Hybrid Search arriba): el mismo prefijo contextual se antepone al chunk ANTES de construirse el indice BM25, no solo antes de embeder — el paso de preprocesamiento aplica a ambos indices (denso y lexico), no solo al vectorial. Anthropic no publica una formula distinta de scoring BM25, solo el paso de preprocesamiento del texto indexado.

**Magnitud de mejora, desglosada por combinacion** (metrica: top-20-chunk retrieval failure rate, 1 - recall@20, baseline sin contexto 5.7%, mismo benchmark de la fuente citada):
- Contextual Embeddings solos: -35% (5.7% -> 3.7%)
- Contextual Embeddings + Contextual BM25: -49% (5.7% -> 2.9%)
- Contextual Embeddings + Contextual BM25 + Reranking: -67% (5.7% -> 1.9%) — combinacion recomendada por el proveedor cuando el presupuesto de latencia lo permite (ver seccion Re-ranking arriba para el criterio de cuando aplica).

No usar el rango "35-50%" sin aclarar a que combinacion corresponde — 35% es contextual embeddings solos, 49% ya incluye Contextual BM25. Cualquier cifra citada a un cliente o en un reporte debe especificar la combinacion exacta, no el rango generico.

Activar Prompt Caching sobre el `documento_completo` en el system prompt de la llamada que genera el contexto — el documento se cachea una vez, cada chunk solo paga el costo incremental de su propio prefijo. Costo reportado por la fuente: ~$1.02 por millon de tokens de documento procesado (documentos de referencia de ~8k tokens, ~100 tokens de contexto generado por chunk, con caching activo). Sin cache, cada chunk repite el costo de ingestion completa del documento — en uno de 50 paginas con 100 chunks, la diferencia es sustancial.

### Re-ranking

Two-stage: bi-encoder recupera top-20/50 (mayor recall); cross-encoder re-rankea para seleccionar top-5/10 (mayor precision). El cross-encoder evalua consulta y chunk de forma conjunta — score mas preciso que similitud separada.

Opciones: `BAAI/bge-reranker-v2-m3` (open-source, alta precision) via `sentence-transformers`; Cohere Rerank API (`rerank-v3.5`) si se prefiere SaaS sin infraestructura propia.

Cuando usar: precision del top-5 del bi-encoder insuficiente, corpus > 10.000 chunks con ruido, latencia adicional (50-200ms) aceptable para el caso de uso.

No usar en flujos con restriccion de latencia estricta (<200ms end-to-end). Priorizar calidad del chunking y del modelo de embedding en esos casos.
