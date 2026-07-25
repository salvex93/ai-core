# session-2026-07-06-upgrade-aaa — wiki [general]
> Generado: 2026-07-24 | Fragmentos: 14

# Sesión 2026-07-06 — Upgrade AAA + Auditoría Post-Release

## Realizado

### 6 mejoras AAA implementadas

1. **ponytail-check.js** — hook PreToolUse Write|Edit con escalera YAGNI de 5 capas. 9 tests.
2. **dev-loop skill v1.0.0** — ciclo Spec→Design→Plan→Build→Review. Basado en Superpowers (Jesse Vincent/obra) y agent-skills (Addy Osmani). 8 tests.
3. **memory-index.js + memory-manager skill** — motor BM25 zero-deps en `.claude/memory-vault/`. Auto-index en Stop hook. Umbral score >2.0 para contexto activo. 10 tests.
4. **agent-metrics.js** — observabilidad por tool call (herramienta, status, tokens, duración). Basado en agent-house (Addy Osmani). 7 tests.
5. **subagent-review.js** — validación adversarial en SubagentStop: Auditor + Adversario + Pragmático. Exit 1 en CRITICO. Basado en adverse (Addy Osmani). 5 tests.
6. **ux-visual-designer v2.0.0 + tech-lead-frontend v4.0.0** — reescritos con 10 paradigmas 2026, tokens W3C, WCAG 2.2 AA nuevos criterios, Motion v11+ import correcto (`motion/react`).

### Auditoría post-release (5 correcciones)

- `claude-opus-4-7` → `claude-opus-4-8` en ModelRouter.js y mcp-anthropic.js
- `health-sync.js`: parsing de skills corregido (formato tabla markdown, no línea legacy)
- `aiops-score.js`: subagent-review.js excluido del scan — score 10/10 real
- `CLAUDE.md` línea 4: version string v3.9.1 → v3.10.0
- `@anthropic-ai/sdk`: 0.104.1 → 0.110.0

### Sincronización de coherencia

- Todos los archivos actualizados a 34 skills / 342 tests (README, CLAUDE.md, update.js, ci.yml, aiops-score.js)
- Node engines: >=18 → >=20 (Node 18 EOL)
- CI matrix: Node 18 eliminado
- DOCS_MAESTRA.md legacy v2.6.4 eliminado del repo

### Fix crítico de portabilidad

`setup-settings.js` y `norm-harness.js` generaban settings.json con solo 2 hooks (versión v3.9.0). Reescritos completos — ahora producen los 22 hooks del harness actual.

### Documentación

- CHANGELOG.md: entrada v3.10.0 con nota de migración para proyectos existentes
- ROADMAP_AAA.md: 6 mejoras marcadas COMPLETADO + arquitectura arnes-manager decidida
- README.md: actualizado a v3.10.0 con todos los comandos y novedades

## Aprendido

### Bugs silenciosos frecuentes al actualizar harness

Los scripts de bootstrap (`setup-settings.js`, `norm-harness.js`) son los primeros en desincronizarse cuando se agregan hooks nuevos — porque no hay test que valide que su output coincide con el `settings.json` real. Detectado solo por auditoría manual.

**Patrón a vigilar:** cada vez que se modifique `settings.json` directamente, verificar que `setup-settings.js` y `norm-harness.js` producen el mismo resultado.

### Falsos positivos en aiops-score

Scripts que contienen regex como *datos* (patrones de auditoría en strings) activan el scanner de seguridad del scorer. La lista `EXCLUIR` en `aiops-score.js` debe actualizarse cada vez que se agregue un script con este patrón.

### health-sync.js — formato legacy

`health-sync.js:checkSkills()` buscaba la línea `"Skills disponibles: ..."` que existió hasta v3.7. Desde v3.8 el formato es tabla markdown. El bug llevaba ~3 versiones sin detectarse porque el reporte de health no bloquea nada (solo informa).

### Flujo de migración para submodulos

El paso `node .claude/ai-core/.claude/bin/norm-harness.js` en el proyecto anfitrión NO es automático. Es el único paso manual que no corre `npm run update`. Documentado en CHANGELOG pero candidato a automatizar en el futuro.

## Pendiente

### arnes-manager (próximo proyecto)

Gestor remoto de arneses. Arquitectura decidida:

```
arnes-manager/
  api/          → Express/Fastify
  agents/
    harness-updater    → clona repo, npm run update, abre PR
    skill-auditor      → detecta skills obsoletos
    dependency-watcher → CVEs, versiones deprecadas
  dashboard/    → UI web
  cli/          → npx arnes-manager init
```

Deploy: Railway.app. Instalable via `npx arnes-manager init`.
Base técnica: claude-session-driver (obra/Jesse Vincent) para workers paralelos JSONL.

### Automatizar norm-harness en proyectos anfitriones

Considerar agregar un hook post-update en `update.js` que detecte si se ejecuta desde un submodulo y corra `norm-harness.js` automáticamente en el proyecto padre.

### Vault de memoria vacío al inicio de sesión

El protocolo de arranque consulta el vault, pero si no hay entradas `.raw/` el índice no existe. Considerar incluir una entrada de bootstrap en el vault con el estado del harness para que la primera consulta siempre tenga resultados.

### Test de coherencia setup-settings vs settings.json

Agregar un test en `harness.test.js` que ejecute `setup-settings.js` y compare su output con el `settings.json` existente — para detectar inmediatamente cuando quedan desincronizados.