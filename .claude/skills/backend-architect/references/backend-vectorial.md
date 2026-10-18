## Persistencia Vectorial

Las aplicaciones con features de IA requieren almacenar embeddings para busqueda semantica. La decision de motor vectorial determina la estrategia de indexacion, el costo operativo y la complejidad de integracion.

### Seleccion de motor vectorial

| Criterio | pgvector | Motor dedicado (Qdrant, Weaviate, Pinecone) |
|---|---|---|
| Volumen de vectores | Hasta ~5M vectores con latencia aceptable | Desde 5M vectores o cuando pgvector no cumple SLA |
| Infraestructura existente | PostgreSQL ya presente: usar pgvector, cero complejidad operativa adicional | Equipo con capacidad de operar un servicio adicional |
| Busqueda hibrida | BM25 via `pg_trgm` + coseno en la misma query | Soporte nativo de busqueda hibrida en Qdrant y Weaviate |
| Compliance | Datos en la misma BD transaccional: mismas politicas de backup y cifrado | Superficie adicional de compliance y gestores de secretos |

Decidir por pgvector si PostgreSQL ya esta en el stack y el volumen no supera 5M vectores. No agregar un servicio nuevo para un problema que pgvector resuelve dentro del SLA de latencia del proyecto.

### Patron de repositorio hibrido

Cuando una query combina filtros SQL con similitud vectorial, el repositorio ejecuta ambas partes en una sola query para evitar N+1:

```sql
-- Ejemplo: buscar documentos de un usuario ordenados por similitud semantica
SELECT d.id, d.titulo, d.contenido,
       1 - (d.embedding <=> $1::vector) AS similitud
FROM documentos d
WHERE d.usuario_id = $2
  AND d.estado = 'publicado'
ORDER BY d.embedding <=> $1::vector
LIMIT $3;
```

El repositorio recibe el vector de consulta ya calculado; no llama al modelo de embeddings. La generacion del embedding es responsabilidad del servicio de aplicacion, no del repositorio.

### Indices vectoriales

- `ivfflat`: mas rapido de construir, precision aproximada. Aceptable para colecciones que cambian frecuentemente o en desarrollo.
- `hnsw`: mayor precision a igual velocidad de consulta. Recomendado para produccion con colecciones estables.

Crear el indice despues de insertar el volumen inicial de datos, no antes. Un indice HNSW sobre una tabla vacia no tiene el grafo construido correctamente y su rendimiento inicial es suboptimo.

```sql
-- Crear indice HNSW en produccion (tras carga inicial)
CREATE INDEX CONCURRENTLY idx_documentos_embedding
  ON documentos USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```
