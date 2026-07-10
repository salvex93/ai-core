# AI-CORE v3.11.0: Nucleo Multi-Agente Universal

`ai-core` es un nucleo de configuracion y comportamiento para agentes IA. Se usa como submodulo Git en un proyecto existente o como repositorio independiente. Define reglas globales, 36 skills especializados, 6 agentes autonomos y un ciclo de mejora continua por uso, sin acoplarse al stack del proyecto anfitrion.

`CLAUDE.md` es la unica fuente de verdad de reglas y enrutamiento de skills. Los skills lo referencian, no lo copian: si una regla cambia ahi, se propaga sin tocar ningun SKILL.md.

Funciona con Claude, Gemini, OpenAI, DeepSeek y Kimi via `ModelRegistry`. Agregar un proveedor nuevo es agregar su API key en `.env` — no hace falta tocar skills ni agentes.

---

## Instalacion

### Requisitos previos

| Requisito | Version minima | Verificar |
|---|---|---|
| Node.js | >= 18.0.0 | `node --version` |
| Claude Code CLI | cualquiera | `claude --version` |
| Git | cualquiera | `git --version` |
| gh CLI | cualquiera | `gh --version` |

`gh` es necesario para el issue-tracker. Instalar desde https://cli.github.com si falta.

### Como repositorio independiente

```bash
# 1. Clonar
git clone git@github.com:salvex93/ai-core.git
cd ai-core

# 2. Dependencias y configuracion local
npm install
npm run setup    # adapta settings.json a tu ruta exacta (cross-platform)

# 3. Verificar que todo funciona
npm test         # debe terminar: 379 pass, 0 fail

# 4. Autenticar gh CLI para el issue-tracker (una sola vez por maquina)
gh auth login    # GitHub.com -> HTTPS -> Login with a web browser
gh auth status   # confirmar: "Logged in to github.com"

# 5. Variables de entorno
cp .env.example .env
# Minimo obligatorio: GEMINI_API_KEY (gratis en aistudio.google.com/app/apikey)

# 6. Iniciar
claude
```

### Como submodulo Git en un proyecto existente

```bash
# 1. Agregar ai-core como submodulo
cd /ruta/a/tu-proyecto
git submodule add https://github.com/salvex93/ai-core .claude/ai-core
git submodule update --init --recursive

# 2. Instalar dependencias del nucleo
cd .claude/ai-core && npm install && cd ../..

# 3. Normalizar el entorno (genera settings.json y CLAUDE.md con rutas locales)
node .claude/ai-core/.claude/bin/norm-harness.js

# 4. Autenticar gh CLI si no lo hiciste ya
gh auth login
gh auth status

# 5. Variables de entorno, en la raiz del proyecto anfitrion
cp .claude/ai-core/.env.example .env
# Editar .env con tus claves

# 6. Iniciar
claude
```

### Actualizar el arnes

Repositorio independiente:

```bash
npm run update
```

Esto corre `git pull`, regenera `settings.json`, corre los 379 tests, aplica migraciones de version, valida los 36 skills, y reporta que cambio. Si un test falla, el comando se detiene ahi.

Instalado como submodulo:

```bash
cd .claude/ai-core
npm run update
cd ../..
node .claude/ai-core/.claude/bin/norm-harness.js
```

`norm-harness.js` corrige rutas hardcodeadas de una version anterior si el proyecto anfitrion tiene un `settings.json` propio.

### Activar proveedores adicionales de IA

Gemini (gratuito) y Anthropic funcionan desde el primer momento. El resto se activa agregando la clave en `.env`:

```bash
GEMINI_API_KEY=    # obligatorio, gratuito en aistudio.google.com
ANTHROPIC_API_KEY= # ya configurado por Claude Code
OPENAI_API_KEY=    # opcional, GPT-4o / o1 / o3
DEEPSEEK_API_KEY=  # opcional, DeepSeek-V3 / R1
KIMI_API_KEY=      # opcional, Kimi K2, 256k de contexto
```

Sin la clave, el proveedor simplemente no se usa, no hay errores. `OPENAI_API_KEY` y `DEEPSEEK_API_KEY` cumplen doble funcion: proveedor de costo bajo y verificador cross-model independiente de Claude (ver seccion Cross-Model Verifier mas abajo).

### Verificar que el issue-tracker esta activo

```bash
gh auth status
# Esperado: "Logged in to github.com as <tu-usuario>"
```

Si no esta autenticado, los eventos se acumulan en `.claude/EVENTS_QUEUE.json` y se envian en la proxima sesion donde `gh` este disponible. No se pierden.

---

## Comandos de referencia

```bash
npm install                               # instalar dependencias
npm test                                  # 379 tests, Node nativo, sin deps externas
npm run setup                             # regenerar settings.json con rutas locales
npm run update                            # actualizacion one-command desde GitHub
npm run validate-globals                  # auditar conformidad de los 36 skills
npm run validate-globals -- --fix-drift   # corregir last_updated desincronizado
npm run token-metrics                     # medir reduccion de consumo de tokens
npm run dry-run                           # simular 5 turnos con calculo de costo
npm run map                               # regenerar CONTEXT_MAP.json
npm run score                             # scoring 0-10 por 6 dimensiones del arnes
npm run score-report                      # historial completo de scores con delta
npm run migrate                           # aplicar migraciones de version manualmente
npm run migrate-dry                       # simular migraciones sin aplicar cambios
npm run memory-index                      # indexar vault de memoria semantica
npm run memory-query "<terminos>"         # buscar en vault (BM25)
npm run memory-status                     # estado del vault
npm run agent-report                      # resumen de metricas de la sesion actual
npm run agent-report-full                 # historial de metricas de todas las sesiones
```

---

## Que trae cada version

### v3.11.0 — Proteccion contra prompt injection y vigencia de skills

**injection-guard** — hook `SubagentStop` que detecta indirect prompt injection en el output de subagentes: contenido externo (archivos, resultados de Gemini, paginas web) que intenta hacerse pasar por una instruccion nueva del sistema. Advierte, no bloquea — la decision final es del operador. Ver `.claude/bin/injection-guard.js`.

**Correccion de vigencia (2026-06)** — la referencia de modelo `claude-sonnet-4-6` en 16 archivos (CLAUDE.md, ModelRegistry.js, mcp-anthropic.js y 12 skills) actualizada a `claude-sonnet-5`, vigente desde el 30 de junio de 2026. `security-auditor` actualizado de OWASP Top 10:2021 a OWASP Top 10:2025 (SSRF fusionado en Control de Acceso Roto, Security Misconfiguration sube a #2, categorias nuevas Software Supply Chain Failures y Mishandling of Exceptional Conditions).

**Migracion a la familia Gemini 3.x (2026-07-10)** — la familia Gemini 2.5 fue reemplazada por 3.1/3.5 en el ecosistema de Google (verificado contra `deepmind.google` y `ai.google.dev`). 8 skills actualizados con detalle verificado contra fuente oficial: `rag-specialist`, `cost-optimizer`, `mobile-engineer`, `workflow-orchestrator`, `multimodal-engineer`, `audio-voice-engineer`, `prompt-engineer` y el renombrado `gemini-2-5-specialist` -> `gemini-3-specialist`. Hallazgos relevantes: el tier "Lite" no sigue el mismo numero de version que "Flash" (heredero real es `gemini-3.1-flash-lite`, no `gemini-3.5-flash-lite`, que no existe); `thinking_budget` fue reemplazado por `thinking_level` (low/medium/high) y ambos son mutuamente excluyentes (error 400 si se combinan); el modelo vigente de Live API (`gemini-3.1-flash-live-preview`) tiene una regresion confirmada de feature — no soporta Affective Dialog, que si estaba disponible en `gemini-2.5-flash-live-preview` (apagado 2025-12-09). Se agrego el "Protocolo de Vigencia Tecnologica" en `CLAUDE.md` para sistematizar este tipo de verificacion en el futuro. Tambien se documento el release candidate del Model Context Protocol (`2026-07-28`, protocolo stateless, headers `Mcp-Method`/`Mcp-Name` obligatorios) en `mcp-server-builder`.

**379 tests, 36 skills.**

### v3.10.0 — Verificacion Cross-Model y AAA

**Cross-Model Verifier** — antes de aceptar el veredicto `APROBADO` de `code-reviewer`, `cross-verify-gate.js` dispara una segunda opinion con un proveedor de IA distinto al que genero el cambio (nunca el mismo modelo que hizo el fix). Motivado por evidencia de que verificar con el mismo modelo detecta pocas regresiones self-consistentes. Ver `docs/OPUSPLAN-cross-model-verifier.md` para el diseño completo.

**Ponytail enforcement** — hook `PreToolUse` en `Write`/`Edit` con una escalera de 5 capas que corre antes de cada escritura: detecta reimplementaciones de stdlib, funciones con mas de 3 parametros y bloques de mas de 200 lineas.

**Dev-loop** — ciclo de desarrollo con 5 gates obligatorios: Spec, Design, Plan, Build, Review. Sin el artefacto de la fase anterior, la siguiente no arranca.

**Memoria semantica BM25** — vault en `.claude/memory-vault/` con motor BM25 propio, sin dependencias externas. Se indexa automaticamente al cerrar sesion y se consulta al abrir la siguiente. Resuelve la perdida de contexto entre sesiones sin base de datos externa.

**Observabilidad de agentes** — `agent-metrics.js` registra cada tool call con herramienta, status, tokens estimados y duracion. `npm run agent-report` muestra el resumen de la sesion.

**Validacion adversarial de subagentes** — el hook `SubagentStop` corre `subagent-review.js`, que evalua el output de cada subagente desde tres perspectivas (auditor, adversario, pragmatico) antes de integrarlo al padre. Sale con exit 1 si encuentra hallazgos criticos.

**mcp-registry-navigator** — evalua servidores MCP de terceros antes de instalarlos: transporte, seguridad de inputs, mantenimiento del repo, calidad del schema, riesgo operativo.

**372 tests, 36 skills, 5 agentes.**

### v3.9.0

Skills reescritos con seccion "Cuando NO Activar Este Perfil" en todos, sistema de migracion automatica (`DEPRECATIONS.json` + `migrator.js`), y `aiops-score.js` con scoring 0-10 en el hook Stop.

---

## Arquitectura Skills vs Agents

| Capa | Directorio | Que hace | Cuando se activa |
|---|---|---|---|
| Skills | `.claude/skills/` (36) | Perfil de comportamiento — como piensa Claude en un dominio | Claude lo adopta como rol dentro de la conversacion |
| Agents | `.claude/agents/` (5+) | Loop autonomo que ejecuta una tarea completa sin intervencion | Claude Code lo lanza como subagente con contexto cero |

Un skill se convierte en agente solo si cumple los tres criterios a la vez: autonomia real (sin interaccion por turno), salida estructurada verificable, y uso recurrente. Si falta uno, se queda como skill.

| Agente | Funcion |
|---|---|
| `code-reviewer` | Revisa el diff completo contra main, clasifica hallazgos, produce veredicto APROBADO/REQUIERE_CAMBIOS/BLOQUEADO |
| `security-scanner` | Escanea credenciales expuestas, CVEs, secrets en git, permisos excesivos |
| `aiops-auditor` | Audita conformidad de skills, detecta agentes faltantes, drift de SDK |
| `map-updater` | Regenera CONTEXT_MAP ante drift estructural del repo |
| `issue-tracker` | Captura errores y gaps, los envia como issues a GitHub al cerrar sesion |
| `mcp-registry-navigator` | Evalua servidores MCP de terceros antes de instalar (INSTALAR/EVALUAR/RECHAZAR) |

La lista completa de skills, sus triggers de activacion y la logica de enrutamiento por contexto viven unicamente en `CLAUDE.md`, seccion "Seleccion de Skills". No se duplica aqui a proposito — mantenerla en dos archivos es lo que produce drift.

---

## Sistema de gobierno y mejora continua

**`process-guard.js`** — limita a 4 scripts del harness en paralelo, con timeout de 8s por proceso. Evita saturacion de memoria en sesiones largas.

**`standards-guard.js`** — revisa en tiempo real cada archivo que Claude escribe: emojis en codigo, `Co-Authored-By`, archivos de mas de 300 lineas, funciones de mas de 20 lineas, secrets hardcodeados, commits que mencionan IA.

**`git-queue-advisor.js`** — antes de cada `git push` muestra los eventos pendientes en cola; despues de cada `git pull` avisa si hay trabajo de harness pendiente. Nunca bloquea, solo informa.

**`capture-event.js` + `issue-reporter.js`** — el ciclo completo:

```
Error durante uso -> capture-event.js -> EVENTS_QUEUE.json
git push (aviso)  -> decides si actuar antes
Cierre de sesion  -> issue-reporter.js -> github.com/salvex93/ai-core
Vos revisas el issue -> decidis si implementar la correccion
```

### ModelRegistry — abstraccion multi-proveedor

`scripts/services/ModelRegistry.js` expone `chat(provider, messages, options)` con patron adapter:

```js
const { chat, listProviders } = require('./scripts/services/ModelRegistry');

listProviders().forEach(p => console.log(p.provider, p.available ? 'OK' : 'sin key'));

await chat('gemini',    messages);  // gratis, tier 0 para lecturas y resumenes
await chat('anthropic', messages);  // Claude Haiku / Sonnet / Opus / Fable
await chat('openai',    messages);  // GPT-4o, o1
await chat('deepseek',  messages);  // DeepSeek-V3 / R1
await chat('kimi',      messages);  // Kimi K2, 256k de contexto
```

Agregar un proveedor nuevo es agregar su config en `PROVIDER_CONFIGS` y su key en `.env`. No toca CLAUDE.md ni skills.

### Cross-Model Verifier

`scripts/services/CrossVerifier.js` fuerza que la verificacion de un diff corra con un proveedor distinto al que genero el cambio — nunca el mismo modelo se audita a si mismo. Recibe solo el diff y la tarea original, nunca el razonamiento del que hizo el fix.

```js
const { verificar } = require('./scripts/services/CrossVerifier');

const resultado = await verificar({
  diff: gitDiffDelCambio,
  tarea: 'descripcion de la tarea original',
  proveedorActor: 'anthropic',
});
// { pass: boolean, hallazgos: [...], proveedor: 'deepseek' | 'openai' | 'gemini' }
```

Se dispara automaticamente en el hook `SubagentStop` cuando `code-reviewer` marca `APROBADO`. Si no hay proveedor distinto configurado en `.env`, se omite sin bloquear la sesion.

### Herramientas de gobernanza

- **`validate-globals.js`**: verifica que los 36 skills tengan la referencia inmutable a CLAUDE.md, las secciones obligatorias, frontmatter completo y ningun emoji. `--fix-drift` corrige `last_updated` desincronizado. Sale con exit 1 si hay hallazgos criticos o altos.
- **`update.js`**: actualizacion cross-platform en un comando. Reporta version anterior vs nueva y si hay breaking changes que requieran accion manual.
- **CI** (`.github/workflows/ci.yml`): corre tests y `validate-globals` en Linux, macOS y Windows con Node 20/22 en cada push a `main` y cada PR.

---

## Motor de ahorro de tokens

- **Guard Read** (`guard-read.js`): bloquea la lectura directa de archivos de mas de 200 lineas, fuerza delegacion a Gemini.
- **Validate Map** (`validate-map.js`): regenera `CONTEXT_MAP.json` si detecta drift de 3 archivos o mas — evita exploracion ciega del repo.
- **Modo Neanderthal**: en el rol Coder, maximo 3 lineas de prosa.
- **Compact/Clear automatico**: aviso al turno 6, detencion al turno 15.
- **`token-metrics.js`**: mide la reduccion real de consumo por sesion.

### Stack del motor

- **Model Router** (`scripts/services/ModelRouter.js`): jerarquia Gemini free -> Haiku -> Sonnet -> Opus/Fable, con Gemini como prioridad para lecturas y resumenes. Incluye un tier separado para el Cross-Model Verifier que no sigue la jerarquia de costo Anthropic — delega la seleccion de proveedor a `CrossVerifier.seleccionarVerificador()`.
- **Anthropic Bridge** (`scripts/anthropic-bridge.js`): prompt caching de 3 puntos, ventana deslizante de historial.
- **Health-Check System**: autodiagnostico al inicio de sesion, detecta path drift y autocorrige.
- **Error Repair Loop** (`scripts/services/ErrorRepairLoop.js`): ciclo deteccion -> diagnostico -> reparacion, con `LoopGuard` limitando intentos.
- **Syntax Check Hook**: `node --check` en cada `.js` editado.

### Stacks detectados automaticamente

| Stack | Manifiesto detectado | Permisos agregados |
|---|---|---|
| Node.js | `package.json` | `npx*`, `yarn*` |
| Python | `pyproject.toml`, `requirements.txt`, `setup.py` | `python*`, `pip*`, `pytest*`, `uv*` |
| Go | `go.mod` | `go*` |
| Rust | `Cargo.toml` | `cargo*` |
| Java | `pom.xml`, `build.gradle` | `mvn*`, `gradle*`, `java*` |
| PHP | `composer.json` | `composer*`, `php*` |
| Ruby | `Gemfile` | `bundle*`, `rails*`, `ruby*` |
| Docker | `Dockerfile`, `docker-compose.yml` | `docker*`, `docker-compose*` |
| Makefile | `Makefile` | `make*` |
| Terraform | `.terraform/` | `terraform*` |
| Serverless | `serverless.yml` | `serverless*`, `sls*` |
| Kubernetes | `k8s/`, `helm/` | `kubectl*`, `helm*` |
| Monorepo | `turbo.json`, `nx.json`, `pnpm-workspace.yaml` | `turbo*`, `nx*`, `pnpm*` |

### Vinculacion por symlinks (alternativa a submodulo)

Para proyectos que comparten el mismo ai-core local sin usar submodulo Git:

**Linux/Mac:**
```bash
rm -f ./CLAUDE.md
ln -s /ruta/a/ai-core/CLAUDE.md ./CLAUDE.md
```

**Windows PowerShell (administrador):**
```powershell
New-Item -ItemType SymbolicLink -Path './CLAUDE.md' -Target 'C:/ruta/a/ai-core/CLAUDE.md' -Force
```

| Criterio | Symlinks | Submodulos |
|---|---|---|
| Desarrollo centralizado del nucleo | Recomendado | No recomendado |
| Distribucion a terceros / CI | No recomendado | Recomendado |
| Multiples proyectos en la misma maquina | Recomendado | Alternativa |

---

## Mapa de modulos

```
.claude/ai-core/
├── scripts/
│   ├── services/
│   │   ├── ModelRouter.js       Enrutamiento Gemini/Haiku/Sonnet/Opus/Fable por herramienta y tokens
│   │   ├── ModelRegistry.js     Adapter multi-proveedor: chat(provider, messages, options)
│   │   ├── CrossVerifier.js     Verificacion ciega de diffs con proveedor distinto al actor
│   │   ├── AgentRoles.js        Perfiles Architect/Coder/Auditor con system prompts
│   │   ├── IntentClassifier.js  Infiere herramienta y modelo desde el mensaje crudo del usuario
│   │   ├── ContextIndex.js      Indice CONTEXT_MAP.json — resolucion de rutas sin I/O ciego
│   │   └── ErrorRepairLoop.js   Ciclo deteccion->diagnostico->reparacion de errores
│   ├── anthropic-bridge.js      Bridge Anthropic SDK con prompt caching y Model Router
│   ├── mcp-gemini.js            Servidor MCP stdio — 5 herramientas de analisis via Gemini
│   ├── mcp-anthropic.js         Servidor MCP stdio — bridge Anthropic como herramienta MCP
│   ├── init-backlog.js          Crea BACKLOG.md en el proyecto anfitrion si no existe
│   ├── query-backlog.js         Filtra BACKLOG.md sin cargarlo completo en contexto
│   ├── dry-run-cost-sim.js      Simulador de costo sin llamadas reales
│   └── migrator.js              Aplica migraciones de version desde DEPRECATIONS.json
├── .claude/
│   ├── settings.json            Hooks + config de servidores MCP (generado, no editar a mano)
│   ├── bin/
│   │   ├── setup-settings.js    Genera settings.json con rutas locales (fuente del archivo anterior)
│   │   ├── health-check.js      Autodiagnostico y path drift al inicio de sesion
│   │   ├── detect-stack.js      Infiere el stack del anfitrion via manifiestos
│   │   ├── validate-map.js      Valida y regenera CONTEXT_MAP.json si hay drift
│   │   ├── guard-read.js        Hook PreToolUse: bloquea Read de mas de 200 lineas
│   │   ├── norm-harness.js      Setup: settings.json + permisos por stack + symlink CLAUDE.md
│   │   ├── validate-globals.js  Auditor de conformidad de skills contra CLAUDE.md
│   │   ├── generate-map.js      Genera CONTEXT_MAP con seccion de stack detectado
│   │   ├── security-check.js    Hook PostToolUse: escanea secretos/eval/catch vacio
│   │   ├── secrets-guard.js     Hook UserPromptSubmit: detecta credenciales en el prompt
│   │   ├── aiops-score.js       Hook Stop: scoring 0-10 por 6 dimensiones
│   │   ├── memory-index.js      Motor BM25 del vault de memoria semantica
│   │   ├── subagent-review.js   Hook SubagentStop: validacion adversarial de 3 perspectivas
│   │   └── cross-verify-gate.js Hook SubagentStop: segunda opinion cross-model tras code-reviewer
│   └── skills/                  36 skills — enrutamiento completo vive en CLAUDE.md
├── tests/
│   └── harness.test.js          372 assertions sobre harness y conformidad de skills
├── .github/workflows/ci.yml     CI en Linux/Mac/Windows x Node 20/22
├── CLAUDE.md                    Autoridad unica: reglas globales, skills, enrutamiento
├── DEPRECATIONS.json            Contrato de migracion por version
├── package.json                 v3.11.0, Node >= 18
└── .env.example                 Plantilla de variables de entorno
```

---

## Como contribuir

### Crear un skill nuevo

1. Crear `.claude/skills/{nombre-en-kebab-case}/SKILL.md`.
2. Frontmatter obligatorio: `name`, `description`, `origin: ai-core`, `version`, `last_updated`.
3. Secciones obligatorias: "Cuando Activar Este Perfil", "Cuando NO Activar Este Perfil", "Primera Accion al Activar", "Directiva de Interrupcion", "Restricciones del Perfil" con la referencia inmutable a CLAUDE.md.
4. Evaluar si cumple los tres criterios de agente. Si los cumple, crear tambien el `.md` correspondiente en `.claude/agents/`.
5. Agregar la fila correspondiente en la tabla "Seleccion de Skills" de `CLAUDE.md` — es la unica tabla que existe, no se duplica en README.
6. `npm run validate-globals` debe terminar en 0 criticos y 0 altos.
7. Commit y push.

### Crear un agente nuevo

Frontmatter obligatorio:
```yaml
---
name: nombre-del-agente
description: descripcion concisa para auto-discovery
origin: ai-core
version: 1.0.0
last_updated: YYYY-MM-DD
provider: any
loop: true|false
---
```

### Agregar un proveedor de IA

1. Config en `PROVIDER_CONFIGS` de `scripts/services/ModelRegistry.js`.
2. Adapter propio solo si el proveedor no es OpenAI-compatible (si lo es, reutilizar `chatOpenAICompat`).
3. Documentar la variable en `.env.example`.

### Reportar un problema

El issue-tracker captura errores automaticamente y los sube a GitHub al cerrar sesion. Para reportar algo manualmente:

```bash
node .claude/bin/capture-event.js \
  --type skill_gap \
  --tool "<skill-mas-cercano>" \
  --error "<descripcion del gap>" \
  --context "<lo que se pidio y no fue cubierto>"
```

---

## Mantenerse actualizado

| Fuente | Que monitorear | Frecuencia |
|---|---|---|
| [Anthropic Changelog](https://www.anthropic.com/changelog) | Modelos nuevos, capacidades de hooks, cambios en MCP | Semanal |
| [Claude Code Docs](https://docs.anthropic.com/en/docs/claude-code) | Hooks nuevos, cambios en settings.json | Semanal |
| [Google DeepMind Models](https://deepmind.google/models/) | Familia Gemini vigente, modelos "coming soon" vs disponibles | Semanal |
| [Gemini API Docs](https://ai.google.dev/gemini-api/docs) | Pricing, free tier, nombres exactos de modelo, deprecaciones | Semanal |
| [Gemini Deprecations](https://ai.google.dev/gemini-api/docs/deprecations) | Fechas de apagado y modelo de reemplazo obligatorio | Mensual |
| [MCP Blog](https://blog.modelcontextprotocol.io/) | Release candidates y cambios de protocolo | Mensual |
| [MCP Spec Changelog](https://modelcontextprotocol.io/changelog) | Transportes, primitivas, politica de deprecacion | Mensual |
| [npm: @anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) | Versiones, breaking changes | Por release |
| [npm: @google/generative-ai](https://www.npmjs.com/package/@google/generative-ai) | Versiones de Gemini, cambios de API | Por release |

Cuando aparezca una capacidad nueva: `npm outdated` para ver si el SDK ya la trae, `npm run update` si hay version nueva, revisar si afecta hooks o `settings.json`, y documentar en `CHANGELOG.md` con la version que la habilita. El detalle del proceso de verificacion (fuentes aceptadas, orden de pasos, alcance de la actualizacion) vive en `CLAUDE.md`, seccion "Protocolo de Vigencia Tecnologica" — no se duplica aqui.

El agente `aiops-auditor` detecta drift de SDK y skills faltantes. Lanzarlo cuando se sospeche degradacion del arnes.

### Variables de entorno — referencia rapida

```bash
GEMINI_API_KEY     # Gemini 3.5 Flash / 3.1 Flash-Lite, gratuito, tier 0
ANTHROPIC_API_KEY  # Claude Haiku/Sonnet/Opus/Fable
OPENAI_API_KEY     # GPT-4o, o1, o3 — opcional, tambien verificador cross-model
DEEPSEEK_API_KEY   # DeepSeek-V3 / R1 — opcional, tambien verificador cross-model
KIMI_API_KEY       # Kimi K2, 256k de contexto — opcional
DOCS_PATH          # ruta a documentacion interna para RAG local
```

---

## Autoridad unica: CLAUDE.md

`README.md` cubre instalacion, arquitectura y uso. `CLAUDE.md` es el sistema operativo completo: reglas, roles, skills y tablas de enrutamiento. Ante cualquier discrepancia entre ambos, `CLAUDE.md` gana.

---

## Licencia

MIT. Usa, modifica y distribuye libremente, incluso en proyectos comerciales. La autoria queda en el historial de git.

Consultoria o configuracion privada: salvex93@gmail.com.
