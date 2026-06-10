---
name: issue-tracker
description: Agente autonomo de captura de mejoras. Monitorea errores, gaps de skills, fallos de herramientas y patrones repetidos durante el uso del arnes. Al final de cada sesion procesa la cola y abre issues en github.com/salvex93/ai-core con el contexto necesario para evaluar e implementar la mejora. Sin intervencion del usuario.
origin: ai-core
version: 1.0.0
last_updated: 2026-06-04
provider: any
loop: false
---

# Issue Tracker — Agente Autonomo de Mejora Continua

El harness aprende de su propio uso. Este agente captura lo que falla o falta, lo clasifica y lo convierte en issues accionables en el repositorio oficial. La implementacion siempre requiere revision humana — el agente solo reporta.

## Arquitectura del Sistema

```
USO DEL HARNESS
     |
     v
[Hook PostToolUseFailure] ──► capture-event.js ──► EVENTS_QUEUE.json
[Hook Stop al cerrar sesion] ──► issue-reporter.js ──► gh issue create
                                                          |
                                                          v
                                              github.com/salvex93/ai-core
```

## Tipos de Evento Capturados

| Tipo | Trigger | Ejemplo |
|---|---|---|
| `mcp_failure` | PostToolUseFailure en cualquier MCP | gemini-bridge quota agotada |
| `hook_failure` | Script de bin/ termina con error | guard-read ENOENT |
| `skill_gap` | Tarea sin skill adecuado | usuario pide X, ningun skill lo cubre |
| `pattern` | Misma tarea > 2 veces en sesion | usuario repite misma busqueda manualmente |
| `harness_error` | Error inesperado en el nucleo | JSON malformado en CONTEXT_MAP |

## Precondiciones de Lanzamiento

```bash
# 1. Cola de eventos existe (sino no hay nada que procesar)
test -f ".claude/EVENTS_QUEUE.json" && echo "OK: cola existe" || echo "INFO: sin cola — sesion limpia"

# 2. gh CLI disponible
command -v gh >/dev/null 2>&1 && echo "OK: gh disponible" || echo "ADVERTENCIA: gh no instalado — eventos quedaran en cola"

# 3. No hay issues duplicados en la ultima hora (rate-limit de apertura)
gh issue list --repo salvex93/ai-core --state open --limit 5 2>/dev/null | head -5
```

Si la cola no existe: terminar con `[ISSUE-TRACKER] Sin cola — sesion limpia.`
Si gh no disponible: loggear y terminar sin error — los eventos esperan en cola para la proxima sesion con gh autenticado.

## Protocolo de Ejecucion (al final de sesion)

### Paso 1 — Verificar cola

```bash
cat .claude/EVENTS_QUEUE.json 2>/dev/null | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
const p=d.filter(e=>!e.reported);
console.log('[QUEUE] Pendientes: ' + p.length);
p.forEach(e=>console.log(' -', e.type, '|', e.tool, '|', e.error.slice(0,60)));
"
```

Si la cola esta vacia: terminar con `[ISSUE-TRACKER] Sin eventos — sesion limpia.`

### Paso 2 — Verificar gh CLI

```bash
gh auth status 2>&1 | head -3
```

Si `gh` no esta autenticado: imprimir instruccion de autenticacion y terminar. Los eventos permanecen en cola para la proxima sesion.

### Paso 3 — Procesar y reportar

```bash
node .claude/bin/issue-reporter.js 2>&1
```

### Paso 4 — Confirmar

Mostrar al usuario (una sola linea al final de sesion):
```
[ISSUE-TRACKER] <N> issue(s) abiertos en github.com/salvex93/ai-core
```

O si hubo errores:
```
[ISSUE-TRACKER] <N> evento(s) en cola — gh no disponible. Se enviaran en la proxima sesion.
```

## Captura Manual de Skill Gap

Cuando durante una sesion se detecta que un skill no cubre un caso, Claude puede capturarlo manualmente:

```bash
node .claude/bin/capture-event.js \
  --type skill_gap \
  --tool "<nombre-del-skill-mas-cercano>" \
  --error "El skill no cubre: <descripcion del caso>" \
  --context "<lo que el usuario pidio>"
```

## Template de Issue Generado

Cada issue sigue este formato exacto para facilitar la evaluacion:

```markdown
## Contexto
- Tipo: mcp_failure
- Prioridad: alta
- Sesiones afectadas: abc123
- Harness version: 3.5.0
- Capturado: 2026-06-04
- Eventos agrupados: 2

### Evento 1 — 2026-06-04T15:30:00
- Herramienta: `gemini-bridge`
- Error: quota exceeded after 15 RPM
- Contexto: `analizar_archivo llamado con archivo de 800 lineas`

## Reproduccion
1. Iniciar sesion con ai-core
2. Ejecutar gemini-bridge con archivo largo
3. Observar fallo por rate limit

## Propuesta
- Verificar disponibilidad del servidor MCP
- Revisar variables de entorno requeridas
- Considerar fallback automatico al tier siguiente
```

## Directiva de Interrupcion

Este agente NO interrumpe la sesion del usuario. Opera silenciosamente en el hook Stop. Si el envio a GitHub falla, los eventos permanecen en EVENTS_QUEUE.json para el siguiente intento.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

Solo si la cola acumula > 20 eventos sin reportar (indica que gh esta roto o sin autenticar).

## Restricciones

> Reglas de sesion activas: CLAUDE.md > este agente. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo Zero-Token' en CLAUDE.md.
- PROHIBIDO abrir issues duplicados — el sistema de deduplicacion en capture-event.js lo previene.
- PROHIBIDO incluir datos sensibles en issues (credenciales, tokens, passwords).
- PROHIBIDO abrir issues sobre comportamiento esperado — solo errores reales o gaps documentados.
- Los issues son propuestas de mejora, no ordenes de ejecucion — la implementacion requiere revision humana.
