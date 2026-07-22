# session-2026-07-06-media-prioridad — wiki [general]
> Generado: 2026-07-22 | Fragmentos: 11

# Sesion 2026-07-06 — Items de media prioridad completados

## Realizado

### 1. Test de coherencia setup-settings vs settings.json (harness.test.js)

Agregado test `el output de setup-settings es coherente con settings.json en disco` al bloque
`setup-settings.js` en `tests/harness.test.js`. Verifica:
- Todos los hook keys presentes (PreToolUse, PostToolUse, Stop, SubagentStop, PostToolUseFailure, UserPromptSubmit)
- Numero de grupos por hook consistente entre ejecuciones
- mcpServers gemini-bridge y anthropic-router presentes

### 2. Hook post-update norm-harness en proyectos anfitriones (update.js)

Agregado PASO 6 condicional al final de `scripts/update.js`. Detecta si ai-core se ejecuta como
submodulo verificando:
- Existe `../../CLAUDE.md` (proyecto padre tiene su propio CLAUDE.md)
- NO existe `../../package.json` (el padre no es otro modulo Node)

Si se confirma submodulo: ejecuta `norm-harness.js` en el cwd del padre.
Si es standalone: informa y omite el paso.

### 3. Skill mcp-registry-navigator (nuevo)

Creado `.claude/skills/mcp-registry-navigator/SKILL.md` — evaluador de MCPs de terceros.
Creado `.claude/agents/mcp-registry-navigator.md` — agente autonomo de evaluacion.

5 criterios de evaluacion con puntuacion 0-10:
- Transporte (stdio/SSE/HTTP)
- Seguridad de inputs (eval/exec/shell sin sanitizar)
- Mantenimiento del repositorio (ultimo commit, issues, licencia)
- Calidad del schema de herramientas (inputSchema completo)
- Riesgo operativo (dependencias, filesystem, APIs externas)

Decision: INSTALAR (>=8) / EVALUAR (5-7) / RECHAZAR (<5).
Registro persistente en `.claude/MCP_REGISTRY.md`.

### 4. claude-sonnet-5 en ModelRouter

Verificado via API live: `claude-sonnet-5` es GA desde 2026-06-29.
Capacidades: max_input_tokens 1M, max_tokens 128k, thinking adaptativo, code execution, structured outputs.
Pricing: mismo tier que sonnet-4-6 ($3/$15 por MTok).

Actualizado `scripts/services/ModelRouter.js`:
- `MODELOS.SONNET: 'claude-sonnet-5'` (reemplaza `claude-sonnet-4-6`)

## Conteos actualizados

- Skills: 34 → 35
- Tests: 342 → 351 (9 nuevos: 1 de coherencia setup-settings + 8 de conformidad del skill nuevo)

## Archivos modificados

- `tests/harness.test.js` — test de coherencia setup-settings
- `scripts/update.js` — paso 6 norm-harness + conteos actualizados
- `scripts/services/ModelRouter.js` — SONNET: claude-sonnet-5
- `.claude/skills/mcp-registry-navigator/SKILL.md` — skill nuevo
- `.claude/agents/mcp-registry-navigator.md` — agente nuevo
- `CLAUDE.md` — entrada mcp-registry-navigator en tabla de skills + conteos 35/351
- `README.md` — conteos actualizados

## Aprendizajes

- **Verificar contexto antes de corregir:** El vault marcaba referencias a `claude-sonnet-4-6` en skills como pendiente de corrección. Al leerlos en contexto real, todas eran correctas (tier de produccion general). El hallazgo del vault era un falso positivo registrado antes de verificar. Lección: siempre leer el archivo antes de actuar sobre un pendiente de memoria.

- **`claude-sonnet-5` es GA desde 2026-06-29:** Confirmado via `client.models.list()` en vivo. max_input_tokens 1M, thinking adaptativo, code execution. Mismo pricing que sonnet-4-6. El models-cache.json lo tenia registrado pero ModelRouter no lo habia incorporado.

- **Detección de submodulo en update.js:** El patron `../../CLAUDE.md existe AND ../../package.json NO existe` es suficientemente robusto para distinguir submodulo de standalone sin depender de `.git/modules/`.

- **Skills nuevos requieren 4 secciones obligatorias:** `Restricciones del Perfil`, `Directiva de Interrupcion`, `Primera Accion al Activar` y el marcador `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]`. El test suite lo detecta inmediatamente — util como gate de calidad al crear skills.

- **sed en múltiples archivos puede introducir bugs parciales:** El `sed -i` que actualizó conteos dejó `342/351` (combinacion incorrecta) en update.js. Siempre verificar cada reemplazo individual cuando se usan patrones genericos en archivos con logica.

## Pendiente / Deuda tecnica

### Alta prioridad

- **arnes-manager** — proyecto principal. Arquitectura decidida (ver session-2026-07-06).
  Al arrancar: instalar MCP Memory como parte del setup inicial.

### Media prioridad (remanente)

Todos los items de media prioridad de session-2026-07-07 fueron completados o descartados.
No hay items de media prioridad pendientes al cierre de esta sesion.

### Baja prioridad

Todos los items de baja prioridad resueltos o descartados.