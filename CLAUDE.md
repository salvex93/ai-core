# AI-CORE v2.6.0 — Estándar Supremo de Desarrollo

**Autor: salvex93**

Sistema de normalización automática de entornos de desarrollo para Claude Code. Sincronización multiplataforma, validación de symlinks y blindaje de estándares de desarrollo.

---

## Características Principales

- **Multiplataforma**: Soporte completo para Windows, macOS y Linux
- **Sincronización Automática**: Git pull origen main con validación previa
- **Symlink Validation**: Normalizador automático de enlaces simbólicos
- **Rule Injection**: Inyección automática de estándares en nuevos proyectos
- **Session Purging**: Limpieza automática de sesiones caducadas (Regla 2 - Sin Iconos)
- **Portabilidad Dinámica**: Autodiscovery de rutas via `__dirname` y `os.homedir()`

---

## Cómo Llevar Mi Estándar a Cualquier Nuevo Proyecto

### Paso 1: Configuración Global (Una sola vez)

En tu máquina, ejecuta este comando **desde el directorio del proyecto nuevo** para establecer el hook SessionStart global:

**Windows (PowerShell Admin):**
```powershell
node "C:/Users/arimac/Documents/Proyectos - MarIA/ai-core/.claude/bin/norm-harness.js"
```

**macOS/Linux:**
```bash
node /Users/arimac/Documents/Proyectos\ -\ MarIA/ai-core/.claude/bin/norm-harness.js
```

### Paso 2: Validación de Symlinks

El script verificará y creará automáticamente:
- `.claude/CLAUDE.md` → enlace a `ai-core/CLAUDE.md`
- `.claude/skills` → enlace a `ai-core/.claude/skills`

### Paso 3: Comportamiento Automático

Cada vez que abras una sesión en Claude Code:
- Sincronización automática del repositorio
- Validación de symlinks
- Inyección de reglas de proyecto (permissions)
- Purga de sesiones antiguas

**Mensaje de éxito esperado:**
```
[SUCCESS] AI-CORE v2.6.0 | Arquitectura por salvex93 | Entorno Sincronizado.
```

---

## Reglas Heredadas

- **Regla 2 - Sin Iconos**: Nunca emojis en producción
- **Regla 18 - Brevedad**: Respuestas concisas y directas
- **Regla 22 - Sensor de Eficiencia**: Monitoreo continuo de contexto

---

## Errores Comunes

### "Permisos insuficientes para crear enlaces simbolicos"
**Solución Windows**: Ejecuta PowerShell como Administrador y vuelve a ejecutar el script.

### Symlinks no se actualizan
**Solución**: Elimina manualmente `.claude/CLAUDE.md` y `.claude/skills`, luego vuelve a abrir Claude Code.

---

## Arquitectura Interna

### norm-harness.js
- Validación de repositorio git previa a sync
- Detección automática de OS para rutas correctas
- Junctions vs symlinks según plataforma
- Inyección de permisos en `settings.json` de nuevos proyectos

### settings.json
- Hook SessionStart que ejecuta norm-harness.js
- Hook Stop para limpieza de sesiones

---

**v2.6.0 — AI-CORE está blindado y listo para escala global.**
