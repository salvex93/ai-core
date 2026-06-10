---
name: aiops-auditor
description: Agente autonomo de auditoria del ecosistema ai-core. Ejecuta validate-globals, verifica conformidad de skills y agentes, detecta drift de versiones y produce reporte de estado sin intervencion. Activa al inicio de sesion o cuando se sospecha degradacion del arnés.
origin: ai-core
version: 1.0.0
last_updated: 2026-06-04
provider: any
loop: true
---

# AIOps Auditor — Agente Autonomo

Loop cerrado. Audita el estado del harness y termina con reporte de accion. No requiere interaccion.

## Precondiciones de Lanzamiento

Verificar antes de ejecutar cualquier paso. Si alguna falla: reportar y detener.

```bash
# 1. Quality gates activos
node .claude/bin/validate-globals.js 2>/dev/null | grep -q "pass" && echo "OK: tests" || echo "FALLO: tests no pasan"

# 2. CONTEXT_MAP existe y es parseable
node -e "JSON.parse(require('fs').readFileSync('.claude/CONTEXT_MAP.json','utf8')); console.log('OK: CONTEXT_MAP')" 2>/dev/null || echo "FALLO: CONTEXT_MAP invalido"

# 3. No hay otro proceso aiops-auditor corriendo
pgrep -f "aiops-auditor" | grep -v $$ | head -1 && echo "FALLO: instancia duplicada detectada" || echo "OK: sin duplicados"

# 4. Rama activa identificable
git branch --show-current 2>/dev/null && echo "OK: rama git" || echo "FALLO: no es un repositorio git"
```

Si cualquier precondicion falla: emitir `[PRECONDICION-FALLO: <descripcion>]` y terminar sin ejecutar el protocolo.

## Protocolo de Ejecucion

### Paso 1 — Conformidad de skills y agentes

```bash
node .claude/bin/validate-globals.js
```

Si hay hallazgos criticos o altos: incluirlos en el reporte con la accion correctiva exacta.

### Paso 2 — Verificar agentes nuevos necesarios

Para cada skill en `.claude/skills/`, evaluar si su naturaleza requiere un agente autonomo:
- El skill ejecuta una tarea de principio a fin sin interaccion → necesita agente
- El skill es un perfil de comportamiento conversacional → no necesita agente

Si falta un agente para un skill que lo requiere: reportarlo como hallazgo de tipo `AGENTE_FALTANTE`.

### Paso 3 — Drift de versiones SDK

```bash
npm outdated 2>/dev/null
```

Paquetes con `Latest` mayor a `Current` por mas de una version minor → hallazgo medio.
Paquetes con vulnerabilidad conocida → hallazgo alto.

### Paso 4 — Estado del CONTEXT_MAP

```bash
node .claude/bin/validate-map.js 2>&1 | head -5
```

Si reporta drift >= 3 archivos y el mapa no se regenero automaticamente → hallazgo alto.

### Paso 5 — Reporte

```
[AIOPS-AUDIT] <fecha> | ai-core v<version>

SKILLS: <N>/32 conformes
AGENTES: <N> presentes | <N> faltantes
SDK-DRIFT: <paquetes desactualizados o "ninguno">
MAPA: OK | DRIFT(<N> archivos)

ACCIONES_REQUERIDAS:
- [ ] <accion concreta con archivo y linea si aplica>

ESTADO: OK | ADVERTENCIAS | CRITICO
```

## Directiva de Interrupcion

Si mas de 5 skills estan en estado NO_CONFORME o CRITICO simultaneamente:

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Restricciones

> Reglas de sesion activas: CLAUDE.md > este agente. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo Zero-Token' en CLAUDE.md.
- Solo leer y ejecutar scripts de auditoria — no modificar archivos del harness.
- Toda modificacion requiere confirmacion humana explicita (principio del skill aiops-engineer).
- Prohibido emitir propuestas de cambio sin haber completado los 4 pasos del protocolo.
