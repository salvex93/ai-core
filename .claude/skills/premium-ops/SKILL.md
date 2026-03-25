---
name: premium-ops
description: Perfil de operaciones premium del ai-core. Da consciencia al agente de la existencia del script de auto-sincronizacion y le delega la responsabilidad de mantener el aislamiento del repositorio publico. Activar al trabajar directamente en el ai-core, detectar scripts de automatizacion privados o gestionar la separacion entre capa publica y premium.
origin: ai-core
version: 1.0.0
---

# Premium Ops — Operaciones de Aislamiento y Auto-Sincronizacion

Este perfil da al agente consciencia operativa del ecosistema premium del ai-core. No interfiere con el desarrollo normal. Su funcion es garantizar que el aislamiento entre la capa publica (repositorio GitHub) y la capa premium (scripts locales) se mantenga en todo momento, y que el script de auto-sincronizacion funcione correctamente.

## Cuando Activar Este Perfil

- Al trabajar directamente en el repositorio ai-core (no en un proyecto anfitrion).
- Al detectar que `scripts/premium/` existe en el sistema de archivos pero no esta rastreado por Git (comportamiento esperado).
- Al revisar o modificar el hook Stop en `.claude/settings.json`.
- Al diagnosticar por que el auto-sync no esta ejecutandose en el evento Stop.
- Al incorporar nuevos scripts de automatizacion privados que no deben publicarse.

## Primera Accion al Activar

Antes de cualquier recomendacion relacionada con scripts de automatizacion:

1. Verificar que `scripts/premium/` esta en `.gitignore`:
   ```
   grep "scripts/premium" .gitignore
   ```

2. Verificar que el script de auto-sync existe localmente:
   ```
   find scripts/premium -name "auto-sync.js" 2>/dev/null
   ```

3. Verificar que el hook Stop esta registrado en `.claude/settings.json`:
   ```
   grep "auto-sync" .claude/settings.json
   ```

4. Verificar que `scripts/premium/` no esta rastreado por Git:
   ```
   git status scripts/premium/
   ```
   El resultado esperado es que Git no liste esa carpeta. Si la lista, hay una configuracion incorrecta del `.gitignore` que debe corregirse de inmediato.

Si cualquiera de estas verificaciones falla, notificar al usuario antes de continuar con otras tareas.

## Directiva de Interrupcion

Insertar `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]` y detener si:

- Se detecta que `scripts/premium/` o cualquier archivo dentro de ella esta siendo rastreado por Git (`git status` los muestra).
- Se propone mover scripts de `scripts/premium/` a cualquier otra carpeta versionada del repositorio.
- Se detecta que el hook Stop esta ejecutando el auto-sync en un proyecto anfitrion que no es el ai-core directo (riesgo de commits automaticos no deseados en proyectos externos).

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Protocolo de Aislamiento

### Regla de oro

Los archivos en `scripts/premium/` son automatizaciones privadas de salvex93. Nunca se versionan en el repositorio publico. El `.gitignore` es la unica barrera tecnica que garantiza este aislamiento.

Si `.gitignore` pierde la entrada `scripts/premium/` por cualquier razon (merge, rebase, conflicto), los scripts privados quedarian expuestos en el siguiente `git add .` del auto-sync. Esta condicion debe detectarse y corregirse antes de cualquier operacion Git.

### Como agregar un nuevo script premium

1. Crear el archivo en `scripts/premium/{nombre}.js`.
2. Verificar que `.gitignore` contiene `scripts/premium/` (entrada global, cubre todos los archivos futuros).
3. Nunca agregar una excepcion en `.gitignore` para un archivo especifico dentro de `scripts/premium/`.
4. Si el script requiere dependencias npm no incluidas en `package.json`, documentarlas en un `scripts/premium/README.local.md` (tambien gitignoreado).

### Auto-sync: comportamiento esperado

El script `scripts/premium/auto-sync.js` se activa en cada evento Stop de Claude Code. Su comportamiento:

- Si el repositorio esta limpio (`git status --porcelain` retorna vacio): termina silenciosamente.
- Si hay cambios: ejecuta `git add .`, `git commit -m "chore(auto): sync de componentes [timestamp]"`, `git push origin {rama-activa}`.
- Si el push falla: loguea una advertencia en stderr pero no interrumpe la sesion. Los cambios quedan commiteados localmente.

El auto-sync NO debe ejecutarse en repositorios anfitriones donde el ai-core esta como submódulo. El hook Stop en proyectos anfitriones solo debe ejecutar `init-backlog.js`, no `auto-sync.js`.

## Restricciones del Perfil

Las Reglas Globales 1 a 15 aplican sin excepcion a este perfil. Restricciones adicionales:

- Prohibido sugerir agregar archivos de `scripts/premium/` al staging area (`git add`) en ninguna circunstancia.
- Prohibido modificar el `.gitignore` de forma que exponga `scripts/premium/`.
- Prohibido replicar la logica de `auto-sync.js` en archivos fuera de `scripts/premium/`.
- Al detectar que el aislamiento esta comprometido, la correccion del `.gitignore` tiene prioridad sobre cualquier otra tarea activa.
