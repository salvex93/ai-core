---
name: memory-manager
description: Gestiona la memoria semantica persistente del arnés ai-core via vault BM25+ (stemming español, boost por campo, query expansion de sinonimos de dominio). Indexa conocimiento en .claude/memory-vault/.raw/, sintetiza en .wiki/ y recupera contexto relevante antes de cada sesion. Resuelve el context rot entre sesiones sin depender de bases de datos externas — plain markdown, git-compatible. Activa al iniciar sesion para recuperar contexto previo, al cerrar sesion para indexar aprendizajes nuevos, o cuando se necesita recuperar informacion de sesiones anteriores.
origin: ai-core
version: 1.1.0
last_updated: 2026-08-03
rol: architect
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

El vault crece con el tiempo. Poda cuando `.raw/` supera 50 archivos.

`memory-vault-prune-check.js` (hook `Stop`, tras `memory-index-stop.js`) cuenta los archivos en `.raw/` en cada cierre de sesion y avisa por stdout si se cruzo el umbral — nunca mueve ni elimina nada, solo detecta y notifica. La poda en si sigue siendo manual:

1. Identificar archivos con fecha > 90 dias y sin referencias en `.wiki/` recientes.
2. Archivar (mover a `.raw/archive/`) en lugar de eliminar.
3. Regenerar el indice tras la poda.
4. Ejecutar `node .claude/bin/memory-index.js status` para confirmar reduccion.

---

## Integracion con el Sistema de Memoria Existente

El vault BM25 coexiste con el sistema de memoria de Claude Code, ubicado en el directorio de configuracion de usuario del harness (`~/.claude/projects/<proyecto>/memory/` en Linux/macOS, `%USERPROFILE%\.claude\projects\<proyecto>\memory\` en Windows — la ruta exacta depende del SO, no asumir una fija):

| Sistema | Proposito | Cuando usar |
|---|---|---|
| Memoria de Claude Code (`~/.claude/projects/<proyecto>/memory/`) | Memoria de Claude Code (tipos: user, feedback, project, reference) | Preferencias de usuario, estado de proyecto, referencias externas |
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

---

## Modulo — Interoperabilidad con Memory Tool Nativo (Anthropic)

### Principio fundamental

El vault BM25+ no es la unica capa de memoria persistente del ecosistema — es la que ai-core controla y audita directamente, sin depender de infraestructura del lado del proveedor. Antes de indexar o recuperar cualquier fragmento, el operador declara de que fuente proviene ese conocimiento y hacia que capa de memoria esta destinado. Si no se puede declarar en una frase por que esta entrada vive en `.raw/` y no en memoria de Claude Code o en el memory tool nativo de Anthropic (`memory_20250818`), la entrada no esta lista para indexarse.

### Identidad de la entrada — declarar antes de indexar

Igual que el Modulo 14 de `tech-lead-frontend` exige una `IDENTIDAD 3D:` antes de codear, ninguna entrada nueva se escribe en `.raw/` sin declarar primero:

```
IDENTIDAD DE ENTRADA:
  Tipo de conocimiento: [decision arquitectonica | aprendizaje de sesion | artefacto dev-loop | feedback de usuario | contexto de proyecto]
  Capa de destino: [vault BM25 (.raw/) | memoria de Claude Code (~/.claude/projects/.../memory/) | ninguna — es efimero]
  Horizonte de vida: [permanente mientras el proyecto exista | expira en N dias | vale solo para esta sesion]
  Motivo de persistencia en una linea: [ej. "decision de auth no derivable del codigo, se repetira en proximos proyectos con el mismo stack"]
```

Si la entrada no supera la pregunta de "capa de destino" con una respuesta especifica, no se indexa — se descarta como efimera segun la tabla de la seccion "Que guardar en el vault".

### Prohibido — patrones reconocibles de indexacion sin criterio

- Indexar el resultado crudo de un comando de diagnostico (`npm test`, `git log`, stack traces) como si fuera "aprendizaje" — eso es estado efimero, no conocimiento.
- Crear una entrada nueva en `.raw/` que parafrasea informacion que ya vive en el CONTEXT_MAP o es derivable leyendo el codigo — duplicacion que infla el indice sin agregar recall.
- Escribir una entrada de mas de 800 palabras esperando que BM25+ "ya la va a recortar" — el limite es de autoria, no de recuperacion.
- Indexar feedback del usuario parafraseado en tercera persona ("el usuario prefiere X") en lugar de la restriccion operativa concreta que ese feedback implica.
- Guardar una entrada sin campo `tags` o con tags genericos (`general`, `nota`, `misc`) que no aportan señal a la query expansion de sinonimos de dominio.
- Duplicar la misma decision en `.raw/` y en la memoria de Claude Code simultaneamente "por si acaso" — la tabla de integracion ya resuelve cual capa usar, no es una decision de cobertura doble.

### Gate de calidad medible

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Precision del top-5 en query de prueba | El fragmento mas relevante conocido aparece en las primeras 5 posiciones | `node .claude/bin/memory-index.js query "<tema conocido>"` contra una entrada ya indexada de contenido verificado |
| Score BM25 de una entrada recien indexada contra su propia query tematica | >= 2.0 (umbral de "contexto activo" ya definido en Protocolo de Recuperacion) | Ejecutar la query inmediatamente despues de indexar; si no supera 2.0, revisar `tags` y densidad de terminos clave del titulo |
| Tamano de `.raw/` sin poda | < 50 archivos | `node .claude/bin/memory-index.js status` — el conteo ya lo reporta el comando existente |
| Antiguedad del indice respecto al ultimo cambio en `.raw/` | 0 sesiones de desfase — el indice se regenera en el mismo Stop hook que escribio la entrada | Comparar timestamp de `index.json` contra el timestamp del archivo `.raw/` mas reciente |
| Palabras por entrada nueva | <= 800 palabras (limite ya declarado en el formato de archivo) | Conteo de palabras del archivo `.md` antes de commitear a `.raw/` |

### Vigencia — memory tool nativo de Anthropic

Verificado contra fuente oficial (`platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool`) en esta misma tarea: Anthropic expone un memory tool nativo del lado de la Messages API, tipo `memory_20250818`, con disponibilidad general (sin header beta) en todos los modelos Claude 4 y posteriores. Es client-side: Claude solicita operaciones de archivo (`view`, `create`, `str_replace`, `insert`, `delete`, `rename`) bajo el prefijo `/memories`, y la aplicacion que lo invoca ejecuta esas operaciones contra su propio almacenamiento — Anthropic no aloja los archivos.

Distincion operativa con el vault BM25+ de este skill: el memory tool nativo resuelve persistencia de estado para agentes que consumen la Messages API directamente (patron "notas de progreso para sobrevivir un reset de contexto"), sin busqueda semantica ni ranking — es lectura/escritura de archivos plana, la relevancia la decide Claude leyendo el directorio, no un algoritmo de scoring. El vault de ai-core resuelve un problema distinto: recuperacion rankeada por BM25+ con stemming en español y expansion de sinonimos de dominio, pensada para el harness de Claude Code (que no pasa por la Messages API cruda con ese parametro `tools`). Ambos pueden coexistir sin conflicto porque operan en capas distintas del stack — no son sustitutos uno del otro en este arnes.

Orientativo, no verificado contra fuente oficial en esta tarea: si existe o no un limite de tamano de archivo individual o de directorio total impuesto por el propio protocolo del memory tool (mas alla del limite generico de 16.000 caracteres por vista de texto que documenta el `view`) — no asumir un techo especifico sin revisar la documentacion vigente antes de dimensionar una integracion que dependa de ese dato.
