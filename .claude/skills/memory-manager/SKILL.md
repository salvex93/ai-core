---
name: memory-manager
description: Gestiona la memoria semantica persistente del arnés ai-core via vault BM25. Indexa conocimiento en .claude/memory-vault/.raw/, sintetiza en .wiki/ y recupera contexto relevante antes de cada sesion. Resuelve el context rot entre sesiones sin depender de bases de datos externas — plain markdown, git-compatible. Activa al iniciar sesion para recuperar contexto previo, al cerrar sesion para indexar aprendizajes nuevos, o cuando se necesita recuperar informacion de sesiones anteriores.
origin: ai-core
version: 1.0.0
last_updated: 2026-07-06
---

# Memory Manager — Vault BM25

Gestiona la memoria semantica del arnés entre sesiones. Implementa el patron LLM Wiki (Karpathy) adaptado: fuentes planas en `.raw/`, síntesis indexada en `.wiki/`, recuperacion BM25 sin dependencias externas.

Complementos: `dev-loop` (los artefactos de fases completadas van al vault), `aiops-engineer` (detecta cuando el vault necesita poda).

---

## Cuando Activar Este Perfil

- Al inicio de sesion cuando hay contexto de sesiones anteriores relevante para la tarea.
- Al cierre de sesion (Stop hook) para indexar aprendizajes, decisiones y artefactos nuevos.
- Cuando el usuario pregunta sobre trabajo previo, decisiones pasadas o contexto de otro proyecto.
- Al detectar que Claude esta repitiendo razonamiento ya ejecutado en sesiones anteriores.
- Cuando un artefacto de dev-loop (Spec, Design, Plan) debe persistir entre sesiones.

## Cuando NO Activar Este Perfil

- La informacion a guardar es efimera (estado de una sesion, resultado de un comando de diagnostico).
- La informacion ya esta en el CONTEXT_MAP o en el codigo del repositorio — no duplicar.
- La tarea no involucra conocimiento que deba recuperarse en sesiones futuras.
- El vault tiene mas de 50 archivos en `.raw/` sin poda — ejecutar limpieza primero.

## Primera Accion al Activar

**Al inicio de sesion (recuperacion):**

```bash
node .claude/bin/memory-index.js status
node .claude/bin/memory-index.js query "<tema de la tarea actual>"
```

Si hay resultados relevantes (score > 0.5), incluirlos como contexto antes de responder.
Si el indice no existe, ejecutar `node .claude/bin/memory-index.js index` primero.

**Al cierre de sesion (indexacion):**

Evaluar si la sesion produjo algun item que deba persistir:
- Decisiones de arquitectura no derivables del codigo.
- Artefactos de dev-loop aprobados (Spec, Design, Plan).
- Feedback del usuario sobre comportamiento del arnés.
- Contexto de proyecto con fecha y motivacion.

## Directiva de Interrupcion

Ante estas condiciones, insertar la directiva y detener:

- El vault supera 50 archivos en `.raw/` sin poda reciente — riesgo de index inflado.
- Se detecta informacion sensible (credenciales, tokens, PII) en un archivo candidato a indexar.
- El indice tiene mas de 30 dias sin regenerarse — puede estar desincronizado del codigo.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

---

## Estructura del Vault

```
.claude/memory-vault/
├── .raw/           — fuentes originales (una entrada por concepto, max 800 palabras)
│   ├── proyecto-X.md
│   ├── decision-auth.md
│   └── feedback-commits.md
├── .wiki/          — fragmentos sintetizados con backlinks (generado automaticamente)
│   └── *.md
└── index.json      — indice invertido BM25 (regenerado en Stop hook)
```

### Formato de archivo en `.raw/`

```markdown
---
tipo: [decision|aprendizaje|artefacto|feedback|contexto]
fecha: YYYY-MM-DD
proyecto: [nombre del proyecto o "ai-core"]
tags: [lista, de, terminos, clave]
---

# Titulo descriptivo (sustantivo + contexto)

Contenido en prosa. Maximo 800 palabras.
Incluir: que se decidio, por que, y como aplicarlo en el futuro.

## Por que
[motivacion o restriccion que genero esta entrada]

## Como aplicar
[en que contexto usar este conocimiento en sesiones futuras]
```

---

## Protocolo de Indexacion (Stop hook)

Al final de cada sesion, el hook Stop ejecuta `memory-index.js index` automaticamente. El flujo manual es:

```bash
# 1. Guardar nuevo conocimiento en .raw/
# 2. Regenerar indice
node .claude/bin/memory-index.js index

# 3. Verificar
node .claude/bin/memory-index.js status
```

### Que guardar en el vault

| Guardar | No guardar |
|---|---|
| Decisiones arquitectonicas con motivacion | Estado efimero de sesion |
| Feedback del usuario sobre comportamiento | Resultados de comandos de diagnostico |
| Artefactos dev-loop aprobados | Contenido ya en el codigo o CONTEXT_MAP |
| Restricciones de proyecto con fecha | Informacion derivable de git log |
| Patrones que se repiten entre proyectos | Configuracion especifica de entorno |

---

## Protocolo de Recuperacion (inicio de sesion)

```bash
# Busqueda por tema de la tarea
node .claude/bin/memory-index.js query "autenticacion JWT tokens"

# Resultado esperado — top 5 fragmentos con score BM25:
# --- [decision-auth#1] score: 3.241
# JWT de acceso en memory (variable JS), refresh en HttpOnly cookie.
# Razon: localStorage es accesible via XSS...
```

**Umbral de relevancia:**
- Score > 2.0 → incluir en contexto activo antes de responder.
- Score 0.5–2.0 → disponible si el usuario pregunta sobre ese tema.
- Score < 0.5 → descartar para esta sesion.

---

## Politica de Poda

El vault crece con el tiempo. Poda cuando `.raw/` supera 50 archivos:

1. Identificar archivos con fecha > 90 dias y sin referencias en `.wiki/` recientes.
2. Archivar (mover a `.raw/archive/`) en lugar de eliminar.
3. Regenerar el indice tras la poda.
4. Ejecutar `node .claude/bin/memory-index.js status` para confirmar reduccion.

---

## Integracion con el Sistema de Memoria Existente

El vault BM25 coexiste con el sistema de memoria de Claude Code en `/home/cyber/.claude/projects/`:

| Sistema | Proposito | Cuando usar |
|---|---|---|
| `/home/cyber/.claude/projects/.../memory/` | Memoria de Claude Code (tipos: user, feedback, project, reference) | Preferencias de usuario, estado de proyecto, referencias externas |
| `.claude/memory-vault/.raw/` | Vault BM25 de ai-core | Artefactos de dev-loop, decisiones tecnicas, patrones de sesion |

No duplicar entre sistemas. Si una entrada encaja en ambos, preferir el sistema de Claude Code para persistencia entre proyectos, y el vault para artefactos especificos de ai-core.

---

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables.

Restricciones adicionales:
- Nunca guardar credenciales, tokens, PII o URLs de produccion en el vault.
- Nunca duplicar en `.raw/` contenido que ya existe en el codigo o en el CONTEXT_MAP.
- El indice debe regenerarse tras cada escritura en `.raw/` — un indice desactualizado es peor que no tenerlo.
- Los archivos de `.raw/` son plain markdown git-compatible — no usar formatos propietarios.
- La poda es responsabilidad del operador (Andrew) — el skill no elimina archivos sin confirmacion.
