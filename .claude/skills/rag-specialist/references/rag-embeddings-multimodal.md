## Embeddings Multimodal (Gemini Embedding 2)

Gemini Embedding 2 (`gemini-embedding-2`, disponibilidad general — ya no "-preview") soporta vectorizacion de multiples modalidades en una sola llamada: texto, imagenes, videos, audio, y PDFs. Dimensión flexible (128 a 768) con recompensas de costo por dimension reducida.

### Cuando usar Gemini Embedding 2

- Corpus documental heterogeneo (texto + imagenes + PDFs).
- Recuperacion semantica que cruza modalidades (ej: buscar con texto pero recuperar imagenes relevantes).
- Presupuesto de embeddings estricto: dimension reducida (256 o 512 en lugar de 1024) amortiza costo sin degradacion severa en precision.
- Necesidad de actualizar modelo de embedding sin reingestion completa (Embedding 2 es compatible con colecciones legacy via reembed progresivo).

### Configuracion

```python
from google import genai
from google.genai import types

client = genai.Client()

# Texto + imagen simultaneamente
response = client.models.embed_content(
    model="gemini-embedding-2",
    contents=[
        "Descripcion de la imagen: [contenido]",
        {"inline_data": {"mime_type": "image/jpeg", "data": base64_encoded_image}}
    ],
    config=types.EmbedContentConfig(output_dimensionality=512)  # Flexibilidad: 128, 256, 384, 512, 768
)

# Recuperacion cruzada: embeddings de texto vs PDFs
pdf_chunks_with_embeddings = [
    {
        "id": "pdf_001_chunk_5",
        "texto": "[contenido extraido del PDF]",
        "embedding": client.models.embed_content(model="gemini-embedding-2", contents=[pdf_file]).embeddings[0].values,
        "documento_tipo": "pdf"
    }
]

# Consulta de usuario embebida
query_embedding = embed_content(
    model="models/gemini-embedding-2",
    content=[{"text": "Mi pregunta en texto"}]
).embedding

# Busqueda: top-K chunks con mayor similitud coseno
similitudes = [cosine_similarity(query_embedding, chunk["embedding"]) for chunk in pdf_chunks_with_embeddings]
```

### Reglas de deployment

- Dimension 256-384: suficiente para corpus tecnico. 40-50% reduccion de costo vs 1024.
- Dimension 512-768: para corpus con ruido o requiere mayor precision semantica. 20-30% reduccion.
- Embedding 2 es backward compatible: colecciones existentes con Embedding 1 pueden reembeberse progresivamente sin migracion forzada.
- Loguear `embedding_dimension` y `modelo` en payload vectorial. Permite rollback si es necesario.
- Monitorear hit rate de recuperacion (precision y recall) durante primeros 100 queries tras cambio. Si degrada >5%, revertir a Embedding 1 o aumentar dimension.
