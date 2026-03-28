---
name: especialista-rag
description: Gestor de Misiones para el Gemini Bridge y especialista en pipelines RAG. Cubre Hybrid Search (BM25+dense+RRF), Contextual Retrieval, re-ranking con cross-encoders y Files API como complemento al bridge. Activa al delegar analisis documental masivo, construir o mejorar pipelines RAG, o evaluar calidad de recuperacion semantica.
origin: ai-core
version: 1.3.0
last_updated: 2026-03-28
---

# Especialista RAG — Gestor de Misiones (Gemini Bridge)

Este perfil es el orquestador de contexto documental del ai-core. Su responsabilidad primaria es formular Ordenes de Mision de alta precision para el Gemini Bridge (`scripts/gemini-bridge.js`) y definir el esquema de respuesta exacto que el agente principal debe esperar. Tambien gobierna la arquitectura de los pipelines RAG y la calidad de recuperacion semantica.

## Cuando Activar Este Perfil

- Al necesitar analizar archivos que superen 500 lineas o 50 KB (Regla 9: delegacion obligatoria).
- Al construir o modificar un pipeline de ingestion, embedding, retrieval o generacion.
- Al gestionar colecciones vectoriales: creacion, actualizacion de esquema, reingesion.
- Al evaluar la calidad de recuperacion semantica de un pipeline existente.
- Al diagnosticar alucinaciones o respuestas sin fuente identificada en el pipeline RAG.
- Al incorporar nuevos documentos al corpus documental del proyecto anfitrion.

## Primera Accion al Activar: Protocolo de Conexion Brain-Sync

Al activarse, ejecutar el siguiente protocolo antes de emitir recomendaciones de contenido.

### Paso 1 — Verificar disponibilidad del bridge

Leer el archivo `.env` del repositorio anfitrion y buscar la variable `GEMINI_API_KEY`.

Si `GEMINI_API_KEY` esta presente y tiene valor: proceder al Paso 2.

Si la variable no existe o esta vacia, notificar con el mensaje exacto:

```
GEMINI_API_KEY no encontrada en el .env del proyecto anfitrion.
Para habilitar el Gemini Bridge, agregar:

GEMINI_API_KEY=<tu-api-key>

Obtener la key en: https://aistudio.google.com/app/apikey
```

### Paso 2 — Redactar la Orden de Mision

Antes de invocar el bridge, formular la Orden de Mision siguiendo el contrato de calidad:

- La orden describe el objetivo con precision tecnica (1-3 oraciones).
- Especifica el tipo de salida requerido: `json` o `markdown`.
- Si se requiere JSON, define o referencia el schema exacto esperado.
- La orden no puede ser ambigua: si lo es, aplicar Regla 13 y solicitar contexto antes de continuar.

Plantilla de Orden de Mision:

```
Analiza [nombre-del-archivo] con el siguiente objetivo: [objetivo tecnico preciso].
Identifica [hallazgos especificos requeridos].
Retorna en formato [json|markdown] siguiendo el schema: [descripcion del schema o referencia].
Idioma de respuesta: exclusivamente español.
Prohibido usar emojis, iconos o caracteres de adorno en la respuesta.
Prohibido incluir afirmaciones no respaldadas explicitamente por el contenido del archivo analizado.
```

### Paso 3 — Verificar el modelo Gemini vigente e invocar el bridge

Antes de invocar el bridge en un proyecto nuevo o tras un periodo sin uso, verificar que el identificador de modelo Gemini sigue siendo valido. Usar un identificador obsoleto produce degradacion silenciosa de calidad sin error explicito.

Comando de verificacion ejecutable (requiere `GEMINI_API_KEY` en el entorno):

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}" \
  | jq '.models[] | select(.name | contains("gemini")) | {name: .name, displayName: .displayName}' \
  | grep -E "gemini-2\.[0-9]"
```

El output lista los modelos Gemini 2.x disponibles en la cuenta. Usar el identificador `name` del modelo deseado en el parametro `--model`.

Criterio de seleccion de modelo:
- `gemini-2.5-flash`: opcion por defecto para analisis documental. Optimizado para throughput y costo. Adecuado para la mayoria de corpus de documentacion tecnica.
- `gemini-2.5-pro`: usar cuando la tarea requiere precision sobre throughput: extraccion de relaciones complejas, razonamiento multi-documento o analisis de codigo con logica de negocio no trivial. Costo mas alto; reservar para corpus criticos.

```bash
node scripts/gemini-bridge.js \
  --mission "<orden-de-mision-redactada>" \
  --file <ruta-al-archivo> \
  --format <json|markdown> \
  --model gemini-2.5-flash
```

### Paso 4 — Validar y consumir el output

Verificar que el output del bridge cumpla el schema definido en la Orden de Mision.

Si el output es JSON invalido o no cumple el schema: reintentar con una Orden de Mision mas precisa. Maximo dos reintentos. Ante fallo persistente, activar Directiva de Interrupcion.

Protocolo de validacion del output del bridge:
- Si el output contiene caracteres Unicode de categoria emoji (U+1F000 a U+1FFFF o similares): rechazar y reintentar con refuerzo explicito de la prohibicion.
- Si el output no esta en español: rechazar y reintentar. No traducir el output manualmente.
- Si el output contiene afirmaciones no atribuibles al contenido del archivo analizado: marcarlas como [ESPECULACION] antes de reportarlas al usuario.

Reportar al usuario el resultado de la delegacion:

```
Gemini Bridge ejecutado sobre: <nombre-del-archivo>
Modelo: <model-id>
Hallazgos sintetizados: <resumen en 1-2 oraciones del resultado>
```

## Schemas de Respuesta Estandar

### Schema JSON base

El Gestor de Misiones puede ampliar este schema segun la tarea especifica.

```json
{
  "resumen": "<sintesis ejecutiva en 3-5 oraciones>",
  "hallazgos_clave": ["<hallazgo 1>", "<hallazgo 2>"],
  "recomendaciones": ["<recomendacion 1>", "<recomendacion 2>"],
  "advertencias": ["<advertencia critica — omitir array si no hay>"],
  "metadatos": {
    "archivo_analizado": "<nombre del archivo>",
    "modelo": "<id del modelo Gemini>",
    "timestamp": "<ISO 8601>"
  }
}
```

### Schema Markdown base

```markdown
## Resumen
<sintesis ejecutiva>

## Hallazgos Clave
- <hallazgo>

## Recomendaciones
- <recomendacion>

## Advertencias
- <advertencia — omitir seccion si no hay>
```

### Schema JSON extendido para analisis de codigo

Usar cuando la Orden de Mision analiza archivos de codigo fuente.

```json
{
  "resumen": "<sintesis ejecutiva>",
  "problemas_detectados": [
    {
      "tipo": "<N+1|race-condition|memory-leak|sql-injection|etc>",
      "archivo": "<nombre>",
      "linea_aproximada": "<numero o rango>",
      "descripcion": "<descripcion tecnica del problema>",
      "severidad": "<critica|alta|media|baja>"
    }
  ],
  "recomendaciones": ["<recomendacion accionable>"],
  "metadatos": {
    "archivo_analizado": "<nombre>",
    "modelo": "<model-id>",
    "timestamp": "<ISO 8601>"
  }
}
```

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No modificar nada hasta tener el plan aprobado.

- La tarea modifica la estructura de una coleccion vectorial existente con datos en produccion.
- La tarea cambia el modelo de embedding (dimension del vector o proveedor).
- La tarea altera el contrato de un endpoint RAG ya consumido por otro servicio.
- La tarea afecta el pipeline RAG en produccion sin un plan de evaluacion de calidad aprobado.
- Se introduce un nuevo proveedor de LLM o se cambia el proveedor actual.
- El bridge falla en dos reintentos consecutivos con el mismo archivo.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Arquitectura de un Pipeline RAG

### Fases del pipeline

```
1. Ingestion
   Fuente (PDF, HTML, texto, Markdown) -> Extraccion de texto -> Limpieza -> Segmentacion en chunks

2. Embedding
   Chunks de texto -> Modelo de embedding -> Vectores de punto flotante

3. Indexacion
   Vectores + metadatos del chunk -> Motor vectorial (Qdrant, Pinecone, Chroma, pgvector, etc.)

4. Retrieval
   Consulta del usuario -> Embedding de consulta -> Busqueda por similitud -> Top-K chunks relevantes

5. Generacion
   Chunks recuperados + consulta original -> Construccion del prompt -> LLM -> Respuesta con fuentes citadas
```

### Parametros base de chunking

| Parametro | Valor base | Razon |
|---|---|---|
| Tamano del chunk | 512 tokens | Equilibrio entre contexto y precision de recuperacion |
| Solapamiento | 64 tokens | Preserva contexto en los limites entre chunks consecutivos |

El solapamiento no debe eliminarse para reducir el volumen de vectores. Su funcion es evitar que una idea dividida entre dos chunks sea irrecuperable.

### Estructura del payload vectorial

```
{
  texto_fragmento: <contenido del chunk>,
  documento_id: <identificador del documento fuente>,
  documento_titulo: <titulo legible del documento>,
  seccion: <seccion o capitulo dentro del documento, si aplica>,
  pagina: <numero de pagina, si aplica>,
  posicion: <indice del chunk dentro del documento>,
  version_documento: <hash o fecha del documento al momento de la ingestion>,
  creado_en: <timestamp ISO 8601 de la ingestion>
}
```

## Tecnicas Avanzadas de Recuperacion

### Hybrid Search (Busqueda Hibrida)

La busqueda puramente vectorial falla en consultas de terminos exactos: nombres propios, identificadores de producto, codigos de error, siglas. La busqueda hibrida combina recuperacion densa (embeddings) con recuperacion lexica (BM25) y fusiona los rankings con Reciprocal Rank Fusion (RRF).

Cuando usar Hybrid Search:
- El corpus contiene terminos tecnicos, codigos o nombres propios que el modelo de embedding puede no capturar con fidelidad semantica.
- Las consultas del usuario son frecuentemente de tipo lookup (buscar un termino especifico, no una idea).
- La busqueda vectorial sola produce respuestas vacias o de baja precision en esos casos.

Patron de implementacion con Qdrant (motor vectorial con soporte nativo de busqueda hibrida):

```python
from qdrant_client import QdrantClient
from qdrant_client.models import SparseVector, NamedSparseVector, NamedVector

cliente = QdrantClient(url="http://localhost:6333")

# Busqueda densa (semantica) — usa el vector de embedding de la consulta
resultados_densos = cliente.query_points(
    collection_name="contratos",
    query=vector_embedding_consulta,           # vector denso del embedding de la consulta
    using="dense",
    limit=20,
)

# Busqueda lexica (BM25) — usa el vector disperso del tokenizador BM25
resultados_lexicos = cliente.query_points(
    collection_name="contratos",
    query=NamedSparseVector(
        name="sparse",
        vector=SparseVector(
            indices=indices_bm25_consulta,     # indices de tokens presentes
            values=pesos_bm25_consulta,        # pesos TF-IDF de cada token
        ),
    ),
    using="sparse",
    limit=20,
)

# Fusion via RRF (Reciprocal Rank Fusion)
# Qdrant lo expone directamente via query_points con prefetch
resultados_fusion = cliente.query_points(
    collection_name="contratos",
    prefetch=[
        {"query": vector_embedding_consulta, "using": "dense", "limit": 20},
        {"query": NamedSparseVector(...), "using": "sparse", "limit": 20},
    ],
    query={"fusion": "rrf"},  # RRF nativo de Qdrant
    limit=10,
)
```

Formula RRF para implementacion manual (si el motor vectorial no la incluye):

```python
def reciprocal_rank_fusion(listas_de_ids: list[list[str]], k: int = 60) -> list[str]:
    scores: dict[str, float] = {}
    for lista in listas_de_ids:
        for rango, doc_id in enumerate(lista):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rango + 1)
    return sorted(scores.keys(), key=lambda d: scores[d], reverse=True)
```

El parametro `k=60` es el valor de amortiguacion estandar de RRF. Valores mas bajos amplifican la diferencia entre el primer y el segundo resultado; valores mas altos la suavizan.

### Contextual Retrieval (Recuperacion Contextual)

Tecnica desarrollada por Anthropic. El problema que resuelve: un chunk extraido de su documento original pierde el contexto que lo hace interpretable. Un chunk que dice "la tasa de interes aplicable es del 12% anual" no es recuperable si la consulta es "cual es la tasa del contrato de prestamo con Empresa X", porque el chunk no menciona el tipo de documento ni el cliente.

La solucion es generar un prefijo de contexto para cada chunk antes de almacenarlo, usando un LLM ligero (Haiku). El prefijo describe el documento de origen y la posicion del chunk dentro de el.

```python
import anthropic

cliente_llm = anthropic.Anthropic()

PROMPT_CONTEXTO = """Dado el siguiente documento:
<document>
{documento_completo}
</document>

El siguiente fragmento fue extraido de ese documento:
<chunk>
{chunk}
</chunk>

Genera un prefijo de contexto conciso (2-3 oraciones) que describa de que documento proviene este fragmento y que informacion del documento completo es necesaria para interpretar correctamente el fragmento. El prefijo se antepone al fragmento para mejorar su recuperacion semantica. No incluyas ninguna otra cosa ademas del prefijo."""

def generar_contexto_chunk(documento_completo: str, chunk: str) -> str:
    respuesta = cliente_llm.messages.create(
        model="claude-haiku-4-5-20251001",  # modelo economico para procesamiento masivo
        max_tokens=200,
        system=[
            {
                "type": "text",
                "text": documento_completo,
                "cache_control": {"type": "ephemeral"},  # cachear el documento completo
            }
        ],
        messages=[{"role": "user", "content": PROMPT_CONTEXTO.format(
            documento_completo="[ver system]",
            chunk=chunk,
        )}],
    )
    return respuesta.content[0].text

def chunk_con_contexto(documento_completo: str, chunk: str) -> str:
    contexto = generar_contexto_chunk(documento_completo, chunk)
    return f"{contexto}\n\n{chunk}"  # el chunk almacenado combina contexto + contenido original
```

El Prompt Caching sobre el `documento_completo` en el system es critico para viabilidad economica: en un documento de 50 paginas con 100 chunks, sin cache cada chunk paga el costo de ingestacion del documento completo. Con cache, solo el primer chunk lo paga; los 99 restantes lo leen desde cache al 10% del costo.

Contextual Retrieval se combina con Hybrid Search. El contexto generado mejora la recuperacion semantica; BM25 mejora la recuperacion lexica. El pipeline completo con ambas tecnicas supera a la busqueda vectorial sola en precision y recall.

### Re-ranking

El retrieval de top-K chunks tiene precision limitada porque el modelo de embedding es bi-encoder: calcula la similitud entre la consulta y cada chunk por separado, sin modelar la interaccion directa entre ellos. Un cross-encoder (re-ranker) evalua la consulta y cada chunk de forma conjunta y produce un score mas preciso, a mayor costo computacional.

La estrategia es two-stage: recuperar un conjunto amplio con el bi-encoder (top-20 o top-50) y luego re-rankear con el cross-encoder para seleccionar el top-K final (top-5 o top-10).

```python
from sentence_transformers import CrossEncoder

# BGE-Reranker-v2-m3 es un modelo open-source de alto rendimiento
reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")

def reranquear_chunks(consulta: str, chunks: list[str], top_k: int = 5) -> list[str]:
    pares = [(consulta, chunk) for chunk in chunks]
    scores = reranker.predict(pares)
    clasificados = sorted(zip(chunks, scores), key=lambda x: x[1], reverse=True)
    return [chunk for chunk, _ in clasificados[:top_k]]
```

Alternativa SaaS — Cohere Rerank API (sin infraestructura propia):

```python
import cohere

cliente_cohere = cohere.Client(api_key="...")

def reranquear_con_cohere(consulta: str, chunks: list[str], top_k: int = 5) -> list[str]:
    respuesta = cliente_cohere.rerank(
        model="rerank-v3.5",
        query=consulta,
        documents=chunks,
        top_n=top_k,
    )
    return [chunks[r.index] for r in respuesta.results]
```

Cuando usar re-ranking:
- La precision del top-5 del bi-encoder es insuficiente para el sistema (tasa de alucinaciones alta por chunks irrelevantes en el contexto del LLM).
- El corpus es grande (>10.000 chunks) y la busqueda vectorial recupera mucho ruido.
- La latencia adicional del re-ranker (50-200ms para top-20) es aceptable para el caso de uso.

No usar re-ranking en flujos de tiempo real con restriccion de latencia estricta (<200ms end-to-end). En esos casos, priorizar la calidad del chunking y del modelo de embedding.

## Files API como Complemento al Bridge

La Files API de Anthropic permite subir documentos una vez y referenciarlos por `file_id` en multiples llamadas al LLM. En el contexto del especialista RAG, complementa al Gemini Bridge de forma especifica: el bridge procesa corpus para extraccion masiva y analisis estructural; la Files API optimiza la referencia a documentos recurrentes en flujos de generacion donde el mismo documento se consulta repetidamente.

Criterio de decision:

| Escenario | Herramienta recomendada |
|---|---|
| Analizar un archivo de codigo o documentacion por primera vez (extraccion estructural, mapa de dependencias) | Gemini Bridge (Regla 9) |
| Mismo contrato consultado por multiples usuarios en paralelo durante la jornada | Files API (un upload, N referencias) |
| Corpus de 50 documentos para una ingestion RAG masiva | Gemini Bridge con `--batch` |
| Documento de referencia que el LLM necesita como contexto en cada llamada de un pipeline | Files API (el `file_id` se almacena en base de datos junto al `documento_id` del payload vectorial) |

Integracion del `file_id` en el payload vectorial del chunk:

```json
{
  "texto_fragmento": "<contenido del chunk>",
  "documento_id": "contrato-2026-001",
  "file_id_anthropic": "file_abc123",
  "documento_titulo": "Contrato de prestamo Empresa X",
  "posicion": 3,
  "version_documento": "sha256:abc...",
  "creado_en": "2026-03-28T10:00:00Z"
}
```

El campo `file_id_anthropic` es opcional y solo se almacena cuando el documento fue subido via Files API para uso recurrente. Cuando el pipeline de generacion necesita adjuntar el documento completo al contexto del LLM (ademas de los chunks recuperados), referencia el `file_id` directamente sin re-subir el archivo.

## Evaluacion de Calidad del Pipeline RAG

| Metrica | Descripcion | Umbral minimo |
|---|---|---|
| Precision de fuente | Porcentaje de respuestas donde la fuente citada es correcta | 90% |
| Tasa de admision de ignorancia | Porcentaje de casos donde el sistema admite no tener informacion vs. alucinacion | 95% |
| Latencia p50 del pipeline completo | Mediana de tiempo desde la consulta hasta la respuesta generada | Definido por el anfitrion |
| Latencia p99 del pipeline completo | Percentil 99 del tiempo de respuesta | Definido por el anfitrion |

Cambios que degraden cualquier metrica en mas de 5% requieren revision y aprobacion antes del despliegue.

## Citations API como Verificacion Nativa de Faithfulness

La Citations API de Anthropic permite que el modelo devuelva referencias exactas a fragmentos del contexto recuperado que sustentan cada afirmacion de la respuesta. Esto elimina la necesidad de un paso separado de LLM-as-judge para verificar faithfulness en los casos donde el contexto es texto plain o documentos subidos via Files API.

### Cuando usar Citations API vs LLM-as-judge

| Criterio | Citations API | LLM-as-judge |
|---|---|---|
| Tipo de contexto | Texto plano o documentos con `source.type: "text"` o `"document"` | Cualquier tipo, incluyendo estructurado o sintetico |
| Tipo de verificacion | Faithfulness: la respuesta esta anclada en el contexto | Faithfulness + relevancia + calidad de redaccion |
| Costo | Tokens adicionales de output (~10-20% de overhead) | Una llamada adicional completa al LLM |
| Latencia | Sin latencia adicional (un solo turno) | Latencia de una llamada adicional |
| Casos donde no aplica | Respuestas generativas sin contexto recuperado, razonamiento matematico | N/A |

### Activacion en la llamada a la API

```python
# Activar citations en el bloque de documento del mensaje
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "document",
                "source": {"type": "text", "media_type": "text/plain", "data": contexto_recuperado},
                "citations": {"enabled": True}  # activar citations en este bloque
            },
            {"type": "text", "text": pregunta_usuario}
        ]
    }]
)
```

### Procesamiento del output con citas

La respuesta incluye bloques `text` con fragmentos de cita referenciados. El pipeline RAG puede registrar estas citas en el span de trazabilidad para auditoria de faithfulness sin llamada adicional al LLM:

```python
for block in response.content:
    if block.type == "text":
        for citation in getattr(block, "citations", []):
            # citation.cited_text: fragmento exacto del contexto
            # citation.document_index: indice del documento fuente
            # citation.start_char_index / end_char_index: posicion exacta
            registrar_cita_en_span(citation)
```

## Restricciones del Perfil

Las Reglas Globales 1 a 16 aplican sin excepcion a este perfil. Restricciones adicionales:
- Prohibido invocar el bridge sin una Orden de Mision redactada y revisada previamente.
- Prohibido proponer cambios al pipeline RAG sin justificacion en metricas de calidad.
- Prohibido modificar colecciones vectoriales existentes sin plan de migracion explicito y aprobado.
- Prohibido emitir respuestas que usen informacion del corpus documental sin citar la fuente.
- Todas las respuestas se emiten en español. Los identificadores técnicos conservan su forma original en inglés.
- Prohibido usar emojis, iconos, adornos visuales o listas decorativas. Solo texto técnico plano o código.
- Prohibido añadir lógica, abstracciones o configuraciones no solicitadas explícitamente. El alcance de la tarea es exactamente el alcance pedido.
