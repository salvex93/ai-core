# Roadmap de integracion y limpieza — 2026-11-24

Objetivo: dejar `main` como unica linea de trabajo, sin ramas muertas, sin estado regenerable versionado y con el backlog depurado, sin regresiones. Linea base verificada: `npm run quality-gate` en `main` (899926d) cumple 9/9.

## Principios

- Un cambio por PR; cada fase termina con `npm run quality-gate` en verde antes de pasar a la siguiente.
- Nada destructivo (borrar ramas remotas, cerrar issues, push) sin confirmacion explicita del usuario en esa fase.
- Antes de borrar una rama: confirmar 0 commits propios contra `main` y que existe el SHA de respaldo anotado en este documento.

## Fase 0 — Linea base y respaldo (sin riesgo)

1. Quality-gate en `main`: cumple 9/9 (hecho).
2. SHAs de respaldo: `fix/harness-health` 41b4a12, `feature/self-evolution-20261031-132646` 71d7aac, `origin/feat/contexto-dinamico` b6f804c, `ai-core/checkpoints` 609fdcb.
3. Cuarentenas del guard de inyeccion (subagente `test`): fixtures de la suite de tests, confirmadas por el usuario.

## Fase 1 — Integrar `fix/harness-health` (riesgo bajo)

Merge simulado contra `main`: sin conflictos. Contenido: drift de `last_updated` por git, dejar de versionar `memory-vault/.wiki` e `index.json`, test nuevo, entrada de CHANGELOG.

1. Quality-gate en el worktree `ai-core-fix`.
2. Respaldar con `git stash` los cambios locales de `.claude/memory-vault` y `AIOPS_SCORE_HISTORY.json` en `main`, porque la rama elimina esos archivos del indice.
3. Push de la rama, PR a `main`, merge; `git stash drop` tras comprobar que el vault se regenera.
   - Criterio de exito: `git status` sin archivos del vault modificados tras una sesion completa; quality-gate 9/9.

## Fase 2 — Limpieza de ramas ya integradas (riesgo bajo)

Ramas con 0 commits propios contra `main`: `chore/market-reverify-2026-11`, `chore/pending-docs-and-reverify`, `fix/audit-round-3`, `fix/audit-state-and-guardians`, `fix/hook-permissions-and-secrets`.

1. Verificar `git rev-list --count main..<rama>` = 0 en cada una.
2. Borrar local y remoto, previa confirmacion.
3. Eliminar el worktree `ai-core-fix` tras la Fase 1.

## Fase 3 — Depuracion del backlog (riesgo bajo)

1. Cerrar como datos de prueba los issues #257-#262.
2. Revisar #263-#265, #267, #268: si el fallo no reproduce en `main`, cerrar con referencia al commit que lo corrige.
3. Priorizar #266 (clon fresco en Windows sin `node_modules`/`CONTEXT_MAP.json`): un PR propio con test.
4. #269 (OpenAI como segunda opinion) y #270 (skill `dev-games`): features; planificar despues de la Fase 5.

## Fase 4 — Publicar el release (riesgo bajo)

1. Convertir `[Unreleased]` del CHANGELOG en version 3.41.0 con la nota de migracion del vault.
2. Subir version en `package.json`, tag y release.
   - Criterio de exito: `validate-globals` sin drift de version.

## Fase 5 — Ramas divergentes (riesgo alto, decision individual)

### `origin/feat/contexto-dinamico` (39 adelante, 37 atras)

Aporta `file-size-guard`, `standards-guard` a 300 lineas, sobre firmado de attest con cumplimiento por regla y benchmark. El merge simulado conflicta en `MARKET_STANDARDS.json`, `hooks-events-session.js`, `hooks-permissions.js` y decenas de `SKILL.md` que `main` ya actualizo.

Estrategia: no mergear la rama completa. Crear `feat/file-size-guard` desde `main`, portar con `cherry-pick` los commits de guards (7bed8c9, 1f24a4e) y attest (9173783), resolver `hooks-permissions.js` a mano y descartar los cambios de skills y mercado. Un PR con tests de camino feliz y de error.

### `feature/self-evolution-20261031-132646` (2 adelante, 35 atras, 1 conflicto)

Sprint 1-2 (contratos, TypeScript, Zod, lazy-loading piloto). Estrategia: rebase sobre `main` en una rama nueva, resolver el conflicto, correr quality-gate y decidir con el usuario si el piloto TypeScript se adopta; si no, archivar con tag `archive/self-evolution` y borrar.

### `ai-core/checkpoints`

Rama de respaldo automatico. No se integra ni se toca.

## Fase 6 — Higiene de raiz (riesgo bajo)

1. Anadir `dist/` y `.DS_Store` al `.gitignore` si `dist/` es artefacto de build (verificar `package.json`).
2. Pendientes de memoria previa: `npm audit`, rotacion del PAT filtrado (fuera de este repo).

## Orden y dependencias

Fase 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6. Las fases 2 y 3 son independientes entre si tras la Fase 1. La Fase 5 va despues del release 3.41.0 para que el rebase parta de una base estable.

## Criterios de rollback

- Un quality-gate en rojo detiene la fase y se revierte el PR con `git revert` del merge.
- Ramas borradas se restauran desde los SHAs de la Fase 0 (`git branch <nombre> <sha>`).
