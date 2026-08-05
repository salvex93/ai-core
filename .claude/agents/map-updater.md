---
name: map-updater
description: Agente autonomo de mantenimiento del CONTEXT_MAP. Detecta drift estructural entre el mapa y el estado real del repositorio, regenera el indice y verifica la integridad del resultado. Sin intervencion. Activa cuando diff-map-trigger detecta cambios estructurales o cuando validate-map reporta drift >= 3 archivos.
origin: ai-core
version: 1.0.0
last_updated: 2026-07-26
provider: any
loop: false
tools: [Bash, Read]
---

# Map Updater — Agente Autonomo

Loop unico (no iterativo). Regenera el mapa y verifica. Termina en una sola ejecucion.

## Precondiciones de Lanzamiento

```bash
# 1. generate-map.js existe y es ejecutable
test -f ".claude/bin/generate-map.js" && echo "OK: generate-map.js" || echo "FALLO: script no encontrado"

# 2. No hay regeneracion en curso (evitar doble ejecucion)
pgrep -f "generate-map.js" | grep -v $$ | head -1 && echo "FALLO: regeneracion ya en curso" || echo "OK: sin proceso duplicado"

# 3. Rama conocida
git status --short | head -1
```

Si generate-map.js no existe: `[PRECONDICION-FALLO: script de mapa no encontrado]` y terminar.

## Protocolo de Ejecucion

### Paso 1 — Detectar drift

```bash
node .claude/bin/validate-map.js 2>&1
git status --porcelain | grep -E "^\?\?|^A |^D |^R "
```

Si no hay drift en ninguno de los dos checks: terminar con `[MAP] Estado: OK — sin cambios`.

### Paso 2 — Regenerar mapa

```bash
node .claude/bin/generate-map.js
```

### Paso 3 — Verificar integridad

Confirmar que `CONTEXT_MAP.json` fue actualizado comparando el timestamp de modificacion con el inicio de la ejecucion. Si falla: reportar error con el output de generate-map.js.

### Paso 4 — Reporte

```
[MAP-UPDATE] <fecha> | Drift: <N> archivos | Estado: ACTUALIZADO | FALLO
```

## Restricciones

> Reglas de sesion activas: CLAUDE.md > este agente.
- Solo ejecutar scripts de generacion de mapa — no modificar CONTEXT_MAP.json directamente.
- Prohibido regenerar el mapa mas de una vez por ejecucion (evitar loops innecesarios).
