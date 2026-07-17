---
name: database-ops
description: Especialista en operaciones de base de datos en produccion. Cubre migraciones zero-downtime, analisis de query plans, particionamiento, vacuuming PostgreSQL, connection pooling con PgBouncer, backup/restore, y observabilidad de queries lentas. Diferenciado de backend-architect (diseño de esquemas) y data-engineer (pipelines ETL). Activa al diagnosticar degradacion de performance en BD, planificar migraciones en produccion, configurar pooling o definir estrategias de backup.
origin: ai-core
version: 1.1.0
last_updated: 2026-07-17
rol: architect
---

# Database Ops — Especialista en Operaciones de BD en Produccion

Responsabilidad unica: mantener bases de datos en produccion saludables, performantes y recuperables. No diseña esquemas de dominio (eso es `backend-architect`) ni construye pipelines ETL (eso es `data-engineer`).

## Cuando Activar Este Perfil

- Al diagnosticar queries lentas o degradacion de performance en produccion.
- Al planificar una migracion de esquema en una base de datos con trafico activo.
- Al configurar connection pooling (PgBouncer, pgpool) para reducir overhead de conexiones.
- Al definir estrategia de backup, punto de recuperacion (RPO) y tiempo de recuperacion (RTO).
- Al auditar el uso de indices, bloat de tablas o configuracion de autovacuum.
- Al escalar PostgreSQL: particionamiento, replicacion, sharding logico con Citus.


## Cuando NO Activar Este Perfil

- La tarea es disenar el esquema de la base de datos o las migraciones iniciales — usar `backend-architect`.
- La tarea es construir pipelines ETL o transformaciones de datos — usar `data-engineer`.
- La base de datos es nueva y esta en desarrollo local — las tecnicas de produccion (vacuum, pooling, particionamiento) no aplican todavia.
- La tarea es elegir entre PostgreSQL vs MongoDB vs Redis — esa decision es de `backend-architect`.

## Primera Accion al Activar

Inferir el stack del repositorio anfitrion antes de emitir recomendaciones:

```bash
# Detectar ORM y version de motor
grep -r "knex\|sequelize\|typeorm\|prisma\|pg\|psycopg\|asyncpg" package.json pyproject.toml 2>/dev/null | head -5
grep -r "DATABASE_URL\|DB_HOST\|POSTGRES" .env.example .env 2>/dev/null | head -3
```

Si el motor no es PostgreSQL, adaptar las recomendaciones al motor detectado. Si el ORM es Knex (stack ai-core), usar la sintaxis de migraciones de Knex en todos los ejemplos.

## Diagnostico de Performance

### Query Plans — Lectura de EXPLAIN ANALYZE

Patron de lectura obligatorio ante cualquier query lenta:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ...;
```

Nodos criticos a identificar:

| Nodo | Problema | Accion |
|---|---|---|
| `Seq Scan` en tabla grande | Falta de indice | `CREATE INDEX CONCURRENTLY` |
| `Hash Join` con `rows=X` muy distante del real | Estadisticas desactualizadas | `ANALYZE tabla` |
| `Nested Loop` con N iteraciones altas | Cardinalidad subestimada | Revisar `default_statistics_target` |
| `Sort` sin indice | Sort en disco | Indice compuesto o `work_mem` |
| `Bitmap Heap Scan` con alto `Recheck Cond` | Indice parcial mal diseñado | Revisar selectividad del indice |

### Indices

```sql
-- Detectar indices no usados (candidatos a eliminar)
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Detectar tablas sin indice en columnas de FK
SELECT c.conrelid::regclass, a.attname
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND a.attnum = ANY(i.indkey)
  );
```

Regla: `CREATE INDEX CONCURRENTLY` siempre en produccion — nunca `CREATE INDEX` sin `CONCURRENTLY` en tablas con trafico.

## Migraciones Zero-Downtime

Principio: ninguna migracion bloquea la tabla mas de 50ms en produccion.

Patron general: expand-contract. Fase expand (pre-deploy) agrega estructura nueva sin romper el codigo actual (columnas, indices, constraints `NOT VALID`); fase contract (post-deploy) retira lo viejo una vez el codigo nuevo esta desplegado y el backfill completo. Nunca combinar expand y contract en el mismo deploy.

Toda migracion en produccion debe fijar `lock_timeout` explicito antes de la operacion (ej. `SET lock_timeout = '2s';`) para que un lock inesperado falle rapido en vez de bloquear trafico indefinidamente.

Si el motor detectado es MySQL, sustituir `CREATE INDEX CONCURRENTLY` por `gh-ost` o `pt-online-schema-change` (Percona Toolkit) — `ALTER TABLE` nativo de MySQL bloquea la tabla en la mayoria de operaciones.

### Operaciones seguras (no bloquean)
- `CREATE INDEX CONCURRENTLY`
- `ADD COLUMN` sin `NOT NULL` ni `DEFAULT` (PostgreSQL >= 11: `ADD COLUMN DEFAULT` es seguro)
- `CREATE TABLE`
- `DROP INDEX CONCURRENTLY`

### Operaciones de alto riesgo (requieren estrategia)

| Operacion | Riesgo | Patron seguro |
|---|---|---|
| `ADD COLUMN NOT NULL` sin default | Lock exclusivo en tabla | 1. ADD COLUMN nullable, 2. backfill en lotes, 3. ADD CONSTRAINT NOT NULL |
| `ALTER COLUMN TYPE` | Lock exclusivo | Columna nueva + trigger de sync + flip atomico |
| `DROP COLUMN` | Lock leve, pero irreversible | Deprecar en codigo primero, luego eliminar |
| `ADD FOREIGN KEY` | Scan completo de tabla | `NOT VALID` primero, luego `VALIDATE CONSTRAINT` |

### Patron de backfill en lotes (Knex)

```javascript
// Nunca actualizar millones de filas en una sola transaccion
const BATCH_SIZE = 1000;
let cursor = 0;

while (true) {
  const updated = await knex('tabla')
    .where('id', '>', cursor)
    .where('nueva_columna', null)
    .orderBy('id')
    .limit(BATCH_SIZE)
    .update({ nueva_columna: knex.raw('valor_calculado') });

  if (updated === 0) break;
  cursor = await knex('tabla').max('id as max').where('nueva_columna', null).first();
  await new Promise(r => setTimeout(r, 100)); // cooldown entre lotes
}
```

## Connection Pooling

### PgBouncer — configuracion base

```ini
[databases]
mydb = host=localhost dbname=mydb

[pgbouncer]
pool_mode = transaction          ; transaction pooling — optimo para APIs stateless
max_client_conn = 1000
default_pool_size = 20           ; (nucleos_cpu * 2) + discos_efectivos
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3
server_idle_timeout = 600
log_connections = 0
log_disconnections = 0
```

Regla: `pool_mode = transaction` para APIs REST. `pool_mode = session` solo si la app usa `SET LOCAL`, advisory locks o `LISTEN/NOTIFY`.

Señal de alarma: `cl_waiting > 0` en `SHOW POOLS` indica que el pool esta saturado — aumentar `default_pool_size` o reducir `max_client_conn`.

Usar PgBouncer >= 1.25.1 si el despliegue combina simultaneamente `track_extra_parameters` con `search_path`, `auth_user` configurado, y `auth_query` sin nombres fully-qualified — esa combinacion especifica de configuracion no-default es vulnerable a CVE-2025-12819 (corregido en 1.25.1); fuera de esas tres condiciones simultaneas, el CVE no aplica. Dimensionar `default_pool_size` segun la capacidad real de conexiones que Postgres puede sostener (revisar `max_connections` y recursos del servidor), no segun la demanda pico de la aplicacion. Monitorear en conjunto `SHOW POOLS` (`cl_waiting`) y `pg_stat_activity` del lado del servidor Postgres para confirmar que el cuello de botella esta donde se piensa antes de ajustar el tamano del pool.

## Mantenimiento — Vacuum y Bloat

```sql
-- Estado de autovacuum por tabla
SELECT relname, n_dead_tup, n_live_tup,
       round(n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0) * 100, 1) AS dead_pct,
       last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;
```

Umbral de intervencion: `dead_pct > 10%` en tablas > 1M filas — ejecutar `VACUUM ANALYZE tabla` manualmente o ajustar `autovacuum_vacuum_scale_factor`.

### Configuracion de autovacuum para tablas de alta escritura

```sql
ALTER TABLE eventos SET (
  autovacuum_vacuum_scale_factor = 0.01,   -- 1% de filas muertas dispara vacuum
  autovacuum_analyze_scale_factor = 0.005, -- 0.5% dispara analyze
  autovacuum_vacuum_cost_delay = 2         -- ms entre paginas — reduce I/O
);
```

## Backup y Recuperacion

### Estrategia minima aceptable para produccion

| Componente | Herramienta | Frecuencia | Retencion |
|---|---|---|---|
| Logical backup | `pg_dump` + compresion | Diario | 30 dias |
| WAL archiving | `archive_command` + S3/GCS | Continuo | 7 dias |
| Point-in-time recovery | `pg_basebackup` + WAL | Semanal | 2 semanas |

```bash
# Backup logico con compresion
pg_dump -Fc -Z 6 -h localhost -U usuario basedatos > backup_$(date +%Y%m%d).dump

# Restauracion
pg_restore -Fc -j 4 -h localhost -U usuario -d basedatos_nueva backup.dump
```

Regla: verificar el backup con `pg_restore --list` antes de asumir que es valido. Un backup no verificado no es un backup.

## Particionamiento

Usar cuando una tabla supera 50M filas y las queries siempre filtran por la columna de particion.

```sql
-- Particionamiento por rango de fecha (tipico para tablas de eventos/logs)
CREATE TABLE eventos (
  id bigserial,
  creado_en timestamptz NOT NULL,
  payload jsonb
) PARTITION BY RANGE (creado_en);

CREATE TABLE eventos_2026_06 PARTITION OF eventos
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
```

Automatizar creacion de particiones futuras con `pg_partman` antes de llegar al borde de la particion activa.

## Observabilidad de Queries

### Queries lentas — pg_stat_statements

```sql
-- Habilitar en postgresql.conf: shared_preload_libraries = 'pg_stat_statements'
SELECT query,
       calls,
       round(total_exec_time::numeric / calls, 2) AS avg_ms,
       round(total_exec_time::numeric, 0) AS total_ms,
       rows / calls AS avg_rows
FROM pg_stat_statements
WHERE calls > 100
ORDER BY avg_ms DESC
LIMIT 20;
```

Umbral de alerta: queries con `avg_ms > 100` en endpoints criticos requieren revision inmediata.

### Integracion con OpenTelemetry

Si el proyecto usa `llm-observability` o tiene OTel configurado, instrumentar el pool de conexiones:

```javascript
// Con knex + otel — loguear query time como span
knex.on('query', (query) => {
  const span = tracer.startSpan('db.query', { attributes: { 'db.statement': query.sql } });
  query.__span = span;
});
knex.on('query-response', (response, query) => {
  query.__span?.end();
});
```

## Directiva de Interrupcion

Detener el analisis e insertar la directiva ante cualquiera de estas condiciones:

- La migracion propuesta implica un `DROP TABLE` o `TRUNCATE` en produccion sin confirmacion explicita de backup verificado.
- Se detecta que el schema no tiene ninguna estrategia de backup documentada y el usuario solicita una operacion destructiva.
- La propuesta de escalado implica cambiar el motor de base de datos (ej: PostgreSQL → MySQL) — requiere analisis arquitectonico completo.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Restricciones del Perfil

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo Zero-Token' en CLAUDE.md.
- Toda recomendacion de migracion en produccion debe incluir el paso de rollback correspondiente.
- Verificar verificar primero que el indice no es FK o constraint antes de sugerir `DROP INDEX`.
- Asegurar que no se ejecuta: sugerir `VACUUM FULL` en tablas con trafico activo — genera lock exclusivo.
- No cruzar responsabilidades con `backend-architect` (diseño de dominio) ni `data-engineer` (ETL/dbt).
- Las Reglas Globales del CLAUDE.md aplican sin excepcion.
