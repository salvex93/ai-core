# AI-CORE v3.41.2: Nucleo Multi-Agente

`ai-core` es un nucleo de configuracion y comportamiento para agentes IA. Se usa como submodulo Git en un proyecto existente o como repositorio independiente. Define reglas globales, 46 skills especializados, 6 agentes autonomos, un orquestador Mixture-of-Agents (Gemini + DeepSeek + Claude), un mecanismo de excepcion auditable (break-glass) para operaciones de riesgo real, y un ciclo de mejora continua por uso, sin acoplarse al stack del proyecto anfitrion.

`CLAUDE.md` es la unica fuente de verdad de reglas y enrutamiento de skills. Los skills lo referencian, no lo copian: si una regla cambia ahi, se propaga sin tocar ningun SKILL.md.

Funciona con Claude, Gemini, OpenAI, DeepSeek y Kimi via `ModelRegistry`. Agregar un proveedor nuevo es agregar su API key en `.env` — no hace falta tocar skills ni agentes.

---

## Instalacion

### Requisitos previos

| Requisito | Version minima | Verificar |
|---|---|---|
| Node.js | >= 22.13.0 | `node --version` |
| npm | >= 11 (bloquea install scripts no aprobados desde esa version) | `npm --version` |
| Claude Code CLI | cualquiera | `claude --version` |
| Git | cualquiera | `git --version` |
| gh CLI | cualquiera | `gh --version` |

`gh` es necesario para el issue-tracker. Instalar desde https://cli.github.com si falta.

npm >= 11 bloquea por defecto los scripts `preinstall`/`postinstall` de dependencias no aprobadas explicitamente. `package.json` ya declara `allowScripts` para las 2 dependencias transitivas que los usan (`protobufjs`, `@google/genai` — ambos scripts verificados como benignos, sin efectos de red ni escritura fuera de su propio paquete), asi que un `npm install` limpio no deberia mostrar advertencias. Si aparece una nueva, verificar el script antes de aprobar con `npm install-scripts approve <paquete>` — nunca aprobar a ciegas.

### Como repositorio independiente

```bash
# 1. Clonar
git clone git@github.com:salvex93/ai-core.git
cd ai-core

# 2. Dependencias y configuracion local
npm install
npm run setup    # adapta settings.json a tu ruta exacta (cross-platform)

# 3. Verificar que todo funciona
npm test         # debe terminar: 1411 pass, 1 skipped, 0 fail

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

Esto corre `git pull`, regenera `settings.json` (purga automaticamente cualquier hook de una version anterior que referencie un script eliminado o renombrado — el objeto de hooks se construye desde cero y sobreescribe el archivo completo, nunca mergea, con la definicion compartida en `hooks-definition.js`), corre los 1414 tests, aplica migraciones de version, valida los 46 skills y los 6 agentes, y reporta que cambio. Si un test falla, el comando se detiene ahi.

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
OPENAI_API_KEY=    # opcional, GPT-5.6 (Sol/Terra/Luna)
DEEPSEEK_API_KEY=  # opcional, DeepSeek V4 (Flash/Pro)
KIMI_API_KEY=      # opcional, Kimi K3, 1M de contexto
```

Sin la clave, el proveedor simplemente no se usa, no hay errores. `OPENAI_API_KEY` y `DEEPSEEK_API_KEY` cumplen doble funcion: proveedor de costo bajo y verificador cross-model independiente de Claude (ver seccion Cross-Model Verifier mas abajo). `DEEPSEEK_API_KEY` tiene ademas un tercer uso: worker `SyntaxDrafting` del orquestador MoA (ver seccion Arquitectura Multi-Agente). Sin `GEMINI_API_KEY` y `DEEPSEEK_API_KEY` simultaneamente, el fan-out MoA no se activa — el guard de disponibilidad lo salta sin error.

### GitHub Secrets para el job de evals en CI

El `.env` local es independiente de los secrets de GitHub Actions — configurar una clave en `.env` no la hace disponible en el CI. El job "Correr evals de skills de mayor riesgo" (`.github/workflows/ci.yml`) necesita `GEMINI_API_KEY` como GitHub Secret del repositorio:

```bash
# Configurar (una vez, requiere permisos de administrador del repo):
gh secret set GEMINI_API_KEY --repo <owner>/<repo>
# pega el valor cuando lo pida, o usa < archivo / variable de entorno

# Verificar que quedo registrado (nunca muestra el valor):
gh secret list --repo <owner>/<repo>
```

Sin este secret, el job de evals falla o se salta en cada corrida de CI, independientemente de que `.env` local este completo.

### Verificar el CI remoto tras cada push (no confiar solo en el resultado local)

`npm test` en verde local no garantiza que el mismo commit pase en CI: los runners de GitHub Actions pueden tener diferencias de entorno (line-endings CRLF/LF segun `windows-latest` vs el checkout local, versiones de dependencias del sistema, disponibilidad de secrets) que un test sensible al sistema de archivos puede exponer solo ahi. Confirmar siempre el run real despues de pushear:

```bash
gh run list --repo <owner>/<repo> --limit 1
# Si "in_progress"/"queued": esperar y volver a consultar
# Si "completed failure":
gh run view <run-id> --repo <owner>/<repo> --log-failed
```

### Verificar que el issue-tracker esta activo

```bash
gh auth status
# Esperado: "Logged in to github.com as <tu-usuario>"
```

Si no esta autenticado, los eventos se acumulan en `.claude/EVENTS_QUEUE.json` y se envian en la proxima sesion donde `gh` este disponible. No se pierden.

---

## Comandos de referencia

```bash
npm install                               # instalar dependencias (corre postinstall -> npm run setup)
npm test                                  # 2044 tests (2042 pass, 2 skip), Node nativo, sin deps externas
npm run setup                             # regenerar settings.json con rutas locales (ya corre solo via postinstall)
npm run update                            # actualizacion one-command desde GitHub
npm run validate-globals                  # auditar conformidad de los 46 skills (incluye schema agentskills.io)
npm run validate-globals -- --fix-drift   # corregir last_updated desincronizado
npm run validate-agents                   # auditar conformidad de los 6 agentes con CLAUDE.md
npm run validate-agents -- --fix-drift    # corregir last_updated desincronizado en agentes
npm run token-metrics                     # medir reduccion de consumo de tokens
npm run dry-run                           # simular 5 turnos con calculo de costo
npm run map                               # regenerar CONTEXT_MAP.json
npm run audit-market                      # auditar vigencia de skills vs. dominios en MARKET_STANDARDS.json
npm run audit-market -- --only-stale      # silencioso salvo hallazgo -- usado en el Protocolo de Arranque de cada sesion
npm run scan-secrets-history               # escanear TODO el historial de git (no solo el working tree) por credenciales
npm run verify-audit-log                  # verificar integridad del hash-chain de BREAK_GLASS_LOG.jsonl
npm run score                             # scoring 0-10 por 6 dimensiones del arnes
npm run score-report                      # historial completo de scores con delta
npm run migrate                           # aplicar migraciones de version manualmente
npm run migrate-dry                       # simular migraciones sin aplicar cambios
npm run rollback-skill -- <nombre> <ver>  # revertir un skill especifico a una version anterior (sin commitear)
npm run memory-index                      # indexar vault de memoria semantica
npm run memory-query "<terminos>"         # buscar en vault (BM25)
npm run memory-status                     # estado del vault
npm run agent-report                      # resumen de metricas de la sesion actual
npm run agent-report-full                 # historial de metricas de todas las sesiones
npm run eval-skills                       # correr los 43 evals de conformidad de skills (promptfoo)
```

---

## Flujo de trabajo con Claude CLI

Patrones de uso directo del binario `claude` fuera de la sesion interactiva. Cada flag listada abajo esta verificada contra `claude --help` de la version instalada — antes de adoptar cualquier flag nueva, confirmar que existe en la salida real de ese comando, no solo en documentacion de terceros.

```bash
# Modo one-shot: imprime la respuesta y termina, util para pipes/scripts
claude -p "resume los cambios sin commitear" < /dev/null

# Encadenar con otras herramientas via stdin/stdout
git diff | claude -p "revisa este diff en busca de bugs obvios"

# Continuar la conversacion mas reciente del directorio actual (no ingesta un archivo, retoma la sesion previa)
claude -c

# Dar acceso a directorios adicionales sin cambiar el cwd de la sesion
claude --add-dir ../otro-proyecto

# Resumir un fallo de build en una linea, sin abrir sesion interactiva
npm run build 2>&1 | claude -p "resume el fallo y el archivo a corregir en una linea"

# Generar un commit message a partir del worktree actual (revisar antes de usar, no aplicar ciego)
claude -p "genera un commit message semantico basado en el diff en stage, devuelve solo el string" < /dev/null

# Procesamiento silencioso tipo filtro UNIX: stdin -> stdout, sin ruido de sesion
claude -p "traduce este JSON a ingles" < data.json > output.json
```

No existe una flag `--clear` en el CLI — para limpiar contexto dentro de una sesion interactiva se usa el comando `/clear`, no un flag de arranque.

Ademas de las flags de arranque, `--bg`/`--background` lanza la sesion directamente en background desde la linea de comandos (libera la terminal de inmediato, imprime un id que `claude attach/logs/stop/rm` usan) -- es el equivalente CLI del comando `/background` de abajo.

## Slash commands utiles dentro de sesion interactiva

Distinto de la seccion anterior: estos NO son flags de arranque (no aparecen en `claude --help`), son comandos que se escriben dentro de una sesion ya abierta. Verificados contra `code.claude.com/docs/en/commands` (fuente oficial, fetch 2026-09-22) -- la lista completa de Claude Code tiene mas de 80 comandos; aqui solo los que aportan valor real al operar ai-core. Para la lista completa, `/help` dentro de sesion.

| Comando | Uso en ai-core |
|---|---|
| `/background` (alias `/bg`) | Desasocia la sesion actual a background y libera la terminal -- util para dejar corriendo una tarea larga (ej. `npm run quality-gate` vigilado por el agente) sin bloquear el uso interactivo. |
| `/memory` | Edita `CLAUDE.md` directamente, o revisa/activa el auto-memory de la sesion -- alternativa a editar el archivo a mano cuando el cambio es chico. |
| `/btw` | Pregunta lateral sin agregarla al historial de la conversacion -- util para no inflar contexto con dudas que no son parte de la tarea (ver Protocolo de Ahorro de Tokens). |
| `/loop` (alias `/proactive`) | Ejecuta un prompt repetidamente mientras la sesion sigue abierta -- usado por el flujo `/loop` de este mismo arnes para tareas de ritmo propio. |
| `/rewind` | Retrocede codigo y conversacion a un checkpoint anterior -- capa adicional a `agent-snapshot.js` y `npm run rollback-agent`, pero a nivel de sesion completa, no de un archivo individual. |
| `/context` | Muestra el uso de contexto actual como grilla -- mas preciso que el conteo heuristico de turnos de CLAUDE.md, util para decidir si vale la pena `/compact` ya. |
| `/agents` | Recordatorio/atajo para crear o editar subagentes -- los 6 agentes de `.claude/agents/` se siguen editando como archivo, esto es solo el disparador desde sesion. |
| `/hooks` | Visualiza los hooks activos y su configuracion -- util para confirmar en vivo que un guard (`destructive-op-guard.js`, `jailbreak-guard.js`, etc.) esta realmente cargado. |
| `/cost` (alias de `/usage`) | Muestra tokens y costo de la sesion actual -- complementa `npm run token-metrics` con una lectura instantanea sin correr el script. |
| `/security-review` | Revisa el diff actual en busca de vulnerabilidades -- complementa, no reemplaza, al agente `security-scanner`. |
| `/diff` | Revisa cambios en el working tree (incluyendo ediciones de Claude hasta ahora) antes de decidir si hace falta `/rewind`. |

No documentados aqui por no aportar valor especifico a ai-core (uso general de Claude Code, cubiertos por `/help`): `/theme`, `/color`, `/mobile`, `/chrome`, `/keybindings`, `/screenshot`, `/dataviz`, `/design*`, `/passes`, `/insights`, entre otros.

## Perfil de configuracion recomendado (`/config`)

Esto NO es un archivo del repo ni se aplica via CLAUDE.md -- son ajustes de la app Claude Code (menu `/config`), propios de cada instalacion local. Se documenta aqui solo como referencia del perfil usado en el desarrollo de ai-core, para replicarlo en otra maquina si hace falta.

```
Auto-compact: true
Continue automatically at usage limit: false
Switch models when a message is flagged: Ask each time
Show tips: false
Claude-drafted feedback: off
Reduce motion: false
Thinking mode: false
Prompt suggestions: false
Session recap: false
Rewind code (checkpoints): true
Dynamic workflows: false
Ultracode keyword trigger: false
Dynamic workflow size: medium (default)
Artifacts: false
Verbose output: false
Terminal progress bar: true
Show turn duration: true
Time format: auto
Default permission mode: Manual
Worktree base ref: fresh
Use auto mode during plan: false
Respect .gitignore in file picker: true
Skip the /copy picker: false
Copy on select: true
Auto-scroll: true
Open agents view by default: false
← opens agents: true
Auto-update channel: latest
Theme: Dark mode
Local notifications: Auto
Push when actions required: false
Push when Claude decides: false
Output style: default
Language: Default (English)
Editor mode: normal
Question auto-continue timeout: never
Show last response in external editor: false
Show PR status footer: true
Model: sonnet
Auto-connect to IDE (external terminal): false
Claude in Chrome enabled by default: false
Enable Remote Control for all sessions: default
Dialog expiry: 60s
Messages from your other sessions: refuse
Project instructions · agents-md: claude-md-or-agents-md
```

Puntos que refuerzan el resto de este documento: `Default permission mode: Manual` es coherente con el human-in-the-loop obligatorio de `CLAUDE.md`; `Dynamic workflows: false` evita duplicar la capa de skills/agents propia del arnes; `Auto-compact: true` complementa (no reemplaza) el aviso de turnos del Protocolo de Ahorro de Tokens; `Switch models when flagged: Ask each time` evita que un cambio de modelo automatico rompa la jerarquia de costo de `ModelRegistry.js`.

---

## Que trae cada version

### v3.41.2 — checkpoints sin credenciales

`checkpoint-branch.js` excluye llaves privadas, certificados y archivos de entorno del respaldo automatico, para que no entren al historial de la rama de checkpoints. Detalle en [CHANGELOG.md](CHANGELOG.md).

### v3.41.1 — guards de tamano bloqueantes y arranque sin mapa

`file-size-guard` y `standards-guard` bloquean antes de escribir archivos de codigo de mas de 300 lineas, `pretest` genera `CONTEXT_MAP.json` en un clon fresco (issue #266) y `npm audit fix` deja 0 vulnerabilidades. Detalle en [CHANGELOG.md](CHANGELOG.md).

### v3.41.0 — gobierno verificable, guards endurecidos y estado de tests aislado

Reune lo acumulado desde v3.40.1: audit trail y gobierno de licencias de dependencias, guards nuevos y endurecidos contra evasiones, recorte de contexto fijo, auditoria de errores silenciosos y reverificacion de vigencia de mercado. La suite de tests ya no deja cuarentenas de `injection-guard` en el estado real, y el estado regenerable de `.claude/memory-vault` deja de versionarse. Nota de migracion y detalle completo en `CHANGELOG.md`.

### v3.40.1 — fix de CI en POSIX + barrido completo de vigencia de mercado

El fake `gh` CLI usado en `issue-reporter-js-camino-gh-disponible.test.js` se creaba siempre como `gh.exe`, nombre que `execFileSync` sin shell nunca busca en Linux/macOS (ahi resuelve el nombre exacto `gh`, sin extension). Esto rompio CI en `ubuntu-latest` y `macos-latest` tras el push que agrego el test -- el fake nunca se activaba y 5/7 subtests fallaban. Fix: nombre del binario condicional a `process.platform` (`gh.exe` en Windows, `gh` con `chmod 0o755` en POSIX). Confirmado verde en CI real tras el push.

Cierre de todos los hallazgos `STALE`/`DRIFT` pendientes en `MARKET_STANDARDS.json`: numeracion OWASP LLM Top 10 2026 corregida (mapeo cruzado real en `ai-guardrails` y `security-auditor`), specs de Meta Ads actualizadas (feed 1440x1800 4:5, Stories/Reels zona segura real 14%/35%/6%, regla de texto <20% retirada por Meta desde 2020), y duracion del token Turnstile confirmada contra la referencia tecnica exacta (300s, un solo uso). No quedan pendientes de vigencia externa conocidos.

### v3.40.0 — wizard interactivo de configuracion

`npm run wizard` consolida en un solo comando interactivo la configuracion de API keys (con validacion activa via `ModelRegistry`, no solo formato), token de GitHub, alias de host SSH (nunca lee la clave privada), chequeo de integridad del harness y auditoria de bypass de `ModelRegistry.js`. Corregido ademas el hallazgo `STALE_MERCADO` de OWASP GenAI LLM Top 10 2026 (numeracion confirmada en v3.40.1).

---


## Arquitectura Skills vs Agents

| Capa | Directorio | Que hace | Cuando se activa |
|---|---|---|---|
| Skills | `.claude/skills/` (46) | Perfil de comportamiento — como piensa Claude en un dominio | Claude lo adopta como rol dentro de la conversacion |
| Agents | `.claude/agents/` (6) | Loop autonomo que ejecuta una tarea completa sin intervencion | Claude Code lo lanza como subagente con contexto cero |

Un skill se convierte en agente solo si cumple los tres criterios a la vez: autonomia real (sin interaccion por turno), salida estructurada verificable, y uso recurrente. Si falta uno, se queda como skill.

| Agente | Funcion |
|---|---|
| `code-reviewer` | Revisa el diff completo contra main, clasifica hallazgos, produce veredicto APROBADO/REQUIERE_CAMBIOS/BLOQUEADO |
| `security-scanner` | Escanea credenciales expuestas, CVEs, secrets en git, permisos excesivos |
| `aiops-auditor` | Audita conformidad de skills, detecta agentes faltantes, drift de SDK |
| `issue-tracker` | Captura errores y gaps, los envia como issues a GitHub al cerrar sesion |
| `mcp-registry-navigator` | Evalua servidores MCP de terceros antes de instalar (INSTALAR/EVALUAR/RECHAZAR) |
| `self-healing-agent` | Diagnostica errores repetidos via el ciclo AUDITOR/ARCHITECT de ErrorRepairLoop.js y propone un fix — nunca lo aplica sin confirmacion humana |

La lista completa de skills, sus triggers de activacion y la logica de enrutamiento por contexto viven unicamente en `CLAUDE.md`, seccion "Seleccion de Skills". No se duplica aqui a proposito — mantenerla en dos archivos es lo que produce drift.

---

## Sandboxing opcional por contenedor

`npm run sandbox` levanta una sesion de Claude Code aislada en Docker (`docker/Dockerfile` + `docker/docker-compose.yml`), montando el proyecto anfitrion como volumen en vez de operar directo sobre el filesystem del host. Capacidad **opcional** — el uso normal sin Docker sigue funcionando exactamente igual, nada cambia por default.

Cuando usarlo: agentes autonomos sobre codigo no confiable, pruebas de comandos potencialmente destructivos, o cualquier tarea de mayor riesgo donde se prefiera aislamiento de proceso real ademas de los guards de patron de comando (que siguen activos dentro del contenedor tambien — son capas complementarias, no alternativas). Requiere Docker instalado; si no esta disponible, el script falla con mensaje explicativo, nunca degrada silenciosamente. Detalle tecnico en `docker/Dockerfile`.

---

## Sistema de gobierno y mejora continua

**`process-guard.js`** — limita a 4 scripts del harness en paralelo, con timeout de 8s por proceso. Evita saturacion de memoria en sesiones largas.

**`standards-guard.js`** — revisa en tiempo real cada archivo que Claude escribe: emojis en codigo (excepto fixtures dentro de `tests/`), archivos de mas de 300 lineas, funciones de mas de 20 lineas, secrets hardcodeados. El chequeo de `Co-Authored-By`/menciones a IA aplica solo a `COMMIT_EDITMSG` — un chequeo generico anterior sobre cualquier archivo disparaba falso positivo al documentar la regla (ej. en este mismo README).

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
await chat('openai',    messages);  // GPT-5.6 (Sol / Terra / Luna)
await chat('deepseek',  messages);  // DeepSeek V4 (Flash / Pro)
await chat('kimi',      messages);  // Kimi K3, 1M de contexto
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

- **`validate-globals.js`**: verifica que los 46 skills tengan la referencia inmutable a CLAUDE.md, las secciones obligatorias, `rol:` valido en frontmatter, ningun emoji, y conformidad con el schema abierto [agentskills.io](https://agentskills.io/specification) (`name` coincide con la carpeta, formato, limites de longitud). `--fix-drift` corrige `last_updated` desincronizado. Sale con exit 1 si hay hallazgos criticos o altos.
- **`validate-agents.js`**: hermano de `validate-globals.js` para los 6 agentes de `.claude/agents/` — mismo criterio de referencia inmutable, copia literal de las 11 reglas del ANCLA (compartidas entre ambos validadores), emojis y drift de `last_updated`. Sale con exit 1 si hay hallazgos criticos o altos.
- **`agent-tools-guard.js`**: enforcement real de scope de herramientas por subagente (Gobierno de Agentes, regla 2 de CLAUDE.md) — hook `PreToolUse` que lee `agent_type` del evento (presente cuando la tool call se origina dentro de un subagente) y deniega (`permissionDecision:"deny"`) si la herramienta usada no esta en el `tools:` declarado del `AGENT.md` correspondiente. Los 6 agentes de `.claude/agents/` declaran su scope; `self-healing-agent` no tiene `Write`/`Edit` en el suyo, consistente con que nunca aplica un fix por si solo.
- **`lib/break-glass.js`**: excepcion auditable de un solo uso para guards de riesgo real (`destructive-op-guard.js`, `mutating-action-guard.js`, `code-exec-guard.js`, `secrets-guard.js`). Al bloquear, genera un id de 8 hex con TTL de 5 min; el humano lo confirma respondiendo `CONFIRMAR-<id>` en su siguiente mensaje (`jailbreak-guard.js` lo intercepta en `UserPromptSubmit`), y solo entonces el REINTENTO EXACTO de esa misma accion pasa — nunca autoriza acciones futuras distintas. Cada uso exitoso queda registrado en `.claude/BREAK_GLASS_LOG.jsonl` (append-only, gitignored).
- **`update.js`**: actualizacion cross-platform en un comando. Reporta version anterior vs nueva y si hay breaking changes que requieran accion manual.
- **CI** (`.github/workflows/ci.yml`): corre tests y `validate-globals` en cada push a `main` y cada PR. Matriz: Ubuntu, Windows y macOS, Node 22 unicamente (Node 20 removido de toda la matriz -- el sandboxing con Permission Model exige Node >= 22.13.0, ya no existe estable en la rama 20.x). El step de tests usa `node --test` sin patrones de glob explicitos — descubrimiento automatico nativo, no depende de que el shell (PowerShell en Windows) expanda argumentos (ver CHANGELOG v3.17.3).

---

## Arquitectura Multi-Agente (MoA)

`scripts/services/ModelDispatcher.js` reparte sub-tareas entre proveedores segun su naturaleza, en vez de resolver todo con un unico modelo:

```js
const { executeMoATask } = require('./scripts/services/ModelDispatcher');

const { resultado, fallos } = await executeMoATask('implementa la funcion X');
// resultado: string combinado con seccion ContextGathering + seccion SyntaxDrafting
// fallos: [] si ambos workers resolvieron, o el detalle del worker que fallo
```

| Sub-tarea | Proveedor | Rol |
|---|---|---|
| `ContextGathering` | Gemini | Mapea el terreno — manejo masivo de tokens, tier gratuito |
| `SyntaxDrafting` | DeepSeek | Genera un borrador de sintaxis de bajo costo |
| `SurgicalEdit` | Claude | Aplica el cambio quirurgico final, con el contexto y el borrador ya resueltos |

`executeMoATask` ejecuta `ContextGathering` y `SyntaxDrafting` en paralelo con `Promise.allSettled` — un worker caido (timeout, rate limit, key ausente) no aborta al otro; el orquestador nunca rechaza, solo degrada la seccion afectada a un marcador de contexto vacio.

**Conexion al flujo de conversacion**: `.claude/bin/moa-context-gatherer.js` invoca `executeMoATask` en el hook `UserPromptSubmit`, antes de que Claude procese el prompt. Guard de disponibilidad: si falta `GEMINI_API_KEY` o `DEEPSEEK_API_KEY`, no se hace ninguna llamada de red — evita pagar latencia en cada turno de cada sesion por un worker condenado a fallar en cualquier entorno sin ambas keys configuradas (el caso mas comun, ya que DeepSeek no viene activado por defecto). El resultado se escribe en `.claude/moa_context.md`, estado efimero que el siguiente turno sobrescribe.

Categoria de `process-guard.js` propia (`moa`, no `intent`): `moa-context-gatherer.js` y `detect-role.js` corren en el mismo array de hooks de `UserPromptSubmit` y ambos deben ejecutarse siempre — compartir categoria de lock haria que uno se saltara silenciosamente por colision.

---

## Motor de ahorro de tokens

- **Guard Read** (`guard-read.js`): bloquea la lectura directa de archivos de mas de 200 lineas, fuerza delegacion a Gemini — degrada con gracia (permite Read nativo) si `GEMINI_API_KEY` no esta disponible.
- **Web Search Guard** (`web-search-guard.js`): mismo patron para `WebSearch`/`WebFetch`, fuerza `buscar_web` (Gemini, tier 0 gratuito).
- **Validate Map** (`validate-map.js`): regenera `CONTEXT_MAP.json` ante cualquier drift real (umbral 1 archivo) — evita exploracion ciega del repo.
- **Modo Neanderthal**: en el rol Coder, maximo 3 lineas de prosa.
- **Compact/Clear automatico**: aviso al turno 6, detencion al turno 15 — proxy tanto para cuota de API por token como de sesion/semana de Plan Pro. `autoCompactWindow` fijado en `settings.json` (85% de una ventana tipica, por debajo del ~95% default nativo de Claude Code).
- **Presupuesto de subagentes** (`subagent-budget-guard.js`, `loop-alternante-guard.js`): techo de 40 llamadas por subagente y deteccion de patron alternante sin converger — evita runaway silencioso de tokens en un pipeline de subagentes.
- **`token-metrics.js`**: mide la reduccion real de consumo por sesion.

### Stack del motor

- **Model Router** (`scripts/services/ModelRouter.js`): jerarquia Gemini free -> Haiku -> Sonnet -> Opus/Fable, con Gemini como prioridad para lecturas y resumenes. Incluye un tier separado para el Cross-Model Verifier que no sigue la jerarquia de costo Anthropic — delega la seleccion de proveedor a `CrossVerifier.seleccionarVerificador()`.
- **Anthropic Bridge** (`scripts/anthropic-bridge.js`): prompt caching de 3 puntos, ventana deslizante de historial.
- **Health-Check System**: autodiagnostico al inicio de sesion, detecta path drift y autocorrige.
- **Error Repair Loop** (`scripts/services/ErrorRepairLoop.js`): ciclo deteccion -> diagnostico -> propuesta de fix, con `LoopGuard` limitando intentos. Conectado en el catch de `mcp-gemini.js` — solo genera texto de propuesta, nunca escribe a disco ni aplica el fix sin confirmacion humana explicita.
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
│   │   ├── ModelDispatcher.js   Router MoA entre proveedores (Command/Port): executeMoATask fan-out/fan-in
│   │   ├── model-adapters/      Adapters extraidos de ModelRegistry.js (SOLID, <300 lineas c/u)
│   │   │   ├── AnthropicAdapter.js    Claude Haiku/Sonnet/Opus/Fable via @anthropic-ai/sdk
│   │   │   ├── GeminiAdapter.js       Gemini 3.7 Flash (default) via @google/genai — timeout real 30s + retry con backoff ante SDK colgado
│   │   │   └── OpenAICompatAdapter.js OpenAI/DeepSeek/Kimi — maxTokensParam y soportaJSONMode por proveedor
│   │   ├── CrossVerifier.js     Verificacion ciega de diffs con proveedor distinto al actor (code-reviewer)
│   │   ├── SubagentGrader.js    Grader generico de calidad post-subagente via LLM-as-judge (Performance Outcomes) — output vacio se marca ALERTA, no silencio
│   │   ├── AgentRoles.js        Perfiles Architect/Coder/Auditor — lee rol: de skills, exige SEARCH/REPLACE en Coder
│   │   ├── IntentClassifier.js  Infiere herramienta y modelo desde el mensaje crudo del usuario
│   │   ├── ContextIndex.js      Indice CONTEXT_MAP.json — resolucion de rutas sin I/O ciego
│   │   ├── TokenManager.js      Conteo y truncado de tokens (Gemini input/output, estimacion de mensajes)
│   │   ├── GeminiApiClient.js   Cliente SDK de Gemini puro — auth, reintentos con backoff, timeout real 30s ante SDK colgado, parseo JSON, compactado
│   │   ├── McpServerHandlers.js Las 5 herramientas MCP de mcp-gemini.js (logica de negocio, sin protocolo)
│   │   ├── RateLimiter.js       Ventana deslizante de 60s contra limites de requests/tokens por minuto de la API Anthropic
│   │   ├── ResponseValidator.js Valida el output del modelo contra reglas criticas (emojis, ingles, frases prohibidas) antes de entregarlo
│   │   ├── StyleProfiler.js     Acumula fragmentos del usuario en sesion y extrae patrones de estilo para adaptar tono
│   │   └── ErrorRepairLoop.js   Ciclo deteccion->diagnostico->propuesta de fix, conectado en mcp-gemini.js — nunca auto-aplica, requiere confirmacion humana (ver self-healing-agent)
│   ├── anthropic-bridge.js      Bridge Anthropic SDK con prompt caching (<static_context>) y Model Router
│   ├── mcp-gemini.js            Servidor MCP stdio — shell JSON-RPC, delega a McpServerHandlers.js
│   ├── mcp-anthropic.js         Servidor MCP stdio — bridge Anthropic como herramienta MCP
│   ├── init-backlog.js          Crea BACKLOG.md en el proyecto anfitrion si no existe
│   ├── query-backlog.js         Filtra BACKLOG.md sin cargarlo completo en contexto
│   ├── dry-run-cost-sim.js      Simulador de costo sin llamadas reales
│   ├── migrator.js              Aplica migraciones de version desde DEPRECATIONS.json
│   └── rollback-skill.js        Revierte un skill especifico a una version anterior via git checkout acotado al archivo
├── .claude/
│   ├── settings.json            Hooks + config de servidores MCP (generado, no editar a mano)
│   ├── bin/
│   │   ├── setup-settings.js    Genera settings.json con rutas locales (fuente del archivo anterior)
│   │   ├── health-check.js      Autodiagnostico y path drift al inicio de sesion
│   │   ├── health-report.js     Genera el markdown del reporte de salud (SRP: solo formatea, no chequea)
│   │   ├── session-summary.js   Hook Stop: resumen de 2-3 lineas de la sesion (archivos, eventos, estado git)
│   │   ├── detect-stack.js      Infiere el stack del anfitrion via manifiestos
│   │   ├── validate-map.js      Valida y regenera CONTEXT_MAP.json si hay drift
│   │   ├── guard-read.js        Hook PreToolUse: bloquea Read de mas de 200 lineas
│   │   ├── norm-harness.js      Setup: settings.json + permisos por stack + symlink CLAUDE.md
│   │   ├── validate-globals.js  Auditor de conformidad de skills contra CLAUDE.md (incluye rol:)
│   │   ├── validate-agents.js   Auditor de conformidad de agentes contra CLAUDE.md (hermano de validate-globals.js)
│   │   ├── generate-map.js      Genera CONTEXT_MAP con seccion de stack detectado
│   │   ├── security-check.js    Hook PostToolUse: escanea secretos/eval/catch vacio
│   │   ├── standards-guard.js   Hook PostToolUse: bloquea (exit 2) emoji o prosa >150 palabras
│   │   ├── secrets-guard.js     Hook UserPromptSubmit: bloquea (exit 2) credenciales de alta confianza, advierte el resto
│   │   ├── detect-role.js       Hook UserPromptSubmit: clasifica rol y escribe .claude/.current_role
│   │   ├── moa-context-gatherer.js Hook UserPromptSubmit: fan-out MoA con guard de disponibilidad de keys
│   │   ├── pre-commit-tdd.js    Hook PreToolUse: bloquea (exit 2) codigo fuente sin test tocado en sesion
│   │   ├── dependency-tracer.js Hook PreToolUse: grafo de dependencias inverso (informativo)
│   │   ├── aiops-score.js       Hook Stop: scoring 0-10 por 6 dimensiones
│   │   ├── memory-index.js      Motor BM25 del vault de memoria semantica — namespacing por rol
│   │   ├── memory-index-stop.js Hook Stop: consume .current_role de forma destructiva e indexa por rol
│   │   ├── subagent-review.js   Hook SubagentStop: validacion adversarial de 3 perspectivas
│   │   ├── cross-verify-gate.js Hook SubagentStop: segunda opinion cross-model tras code-reviewer
│   │   ├── hooks-definition.js  Fuente unica de la seccion "hooks" de settings.json (usada por setup-settings.js y norm-harness.js)
│   │   ├── subagent-guard.js    Hook PreToolUse(Agent): bloquea recursion y exceso de subagentes paralelos
│   │   ├── subagent-budget-guard.js Hook PreToolUse (dentro de subagentes): techo de 40 llamadas a tools por subagente, red de seguridad final contra runaway
│   │   ├── loop-alternante-guard.js Hook PreToolUse (dentro de subagentes): detecta 2 tools alternando 6+ ciclos sin converger (argumentos distintos) — advierte, bloquea si persiste
│   │   ├── tool-repeat-guard.js Hook PreToolUse: bloquea (exit 2) la misma tool+argumentos identicos repetida mas de 3 veces (agente atascado reintentando)
│   │   ├── web-search-guard.js  Hook PreToolUse(WebSearch|WebFetch): fuerza buscar_web (Gemini) sobre busqueda nativa, degrada con gracia sin GEMINI_API_KEY
│   │   ├── agent-tools-guard.js Hook PreToolUse(Bash|Read|Write|Edit): bloquea herramientas fuera del scope `tools:` declarado por el subagente activo
│   │   ├── bash-verbosity-guard.js Hook PreToolUse(Bash): bloquea comandos de alto riesgo de output masivo
│   │   ├── destructive-op-guard.js Hook PreToolUse(Bash): bloquea rm -rf, git push --force, reset --hard, clean -f, branch -D, DROP TABLE/TRUNCATE — break-glass para 24 reglas sin alternativa segura (incluye push --mirror, dd/mkfs/shred, find -delete, DROP SCHEMA, kubectl delete ns, prune forzado y WHERE tautologico); desofusca el nombre del comando (r\m, "rm", ${IFS}) antes de evaluar
│   │   ├── approval-store-guard.js Hook PreToolUse(Bash|Write|Edit|NotebookEdit): impide al agente escribir en el almacen de locks (ai-core-locks: aprobaciones de break-glass y contadores de guards); la aprobacion solo nace del prompt del usuario. Barrera de patrones, no sandbox
│   │   ├── code-exec-guard.js   Hook PreToolUse(Write|Edit): bloquea eval/exec/shell antes de escribir (ASI05) — break-glass via lib/break-glass.js
│   │   ├── mcp-integrity-check.js Hash SHA-256 de servidores MCP propios contra baseline (ASI04, via health-check.js)
│   │   ├── mcp-lifecycle-check.js Valida estado Active/Deprecated/Removed de servidores MCP propios contra MCP_LIFECYCLE.json
│   │   ├── circuit-breaker.js   Hook PreToolUse(mcp__.*): avisa tras 3 fallos MCP consecutivos en 5 min (ASI08)
│   │   ├── subagent-grader.js   Hook SubagentStop: grader de calidad via SubagentGrader.js (Performance Outcomes)
│   │   ├── checkpoint-branch.js Hook PostToolUse(Write|Edit): auto-commit a rama de respaldo ai-core/checkpoints, nunca a la rama de trabajo real
│   │   ├── diff-map-trigger.js  Hook PostToolUse(Write|Edit|Bash): regenera CONTEXT_MAP.json ante archivos nuevos/renombrados/eliminados
│   │   ├── detox.js             Aparta a .claude/detox-cuarentena/ los .md legacy no trackeados de la raiz (TO_GEMINI.md, REPORT-*.md, AUDIT-*.md) que contaminan contexto entre sesiones; ya no los borra
│   │   ├── git-history-secrets-scan.js Escanea el HISTORIAL completo de git (no solo working tree) por credenciales commiteadas alguna vez
│   │   ├── lib/                 Modulos compartidos entre hooks
│   │   │   ├── hook-stdin.js         Lectura/parseo del JSON de evento que Claude Code entrega por stdin
│   │   │   ├── risky-code-patterns.js Patrones de ejecucion arbitraria compartidos con code-exec-guard.js
│   │   │   ├── aiops-scorers.js      Las 6 funciones de scoring de aiops-score.js
│   │   │   ├── bm25-engine.js        Motor BM25 de memory-index.js (tokenizacion, indice invertido)
│   │   │   ├── subagent-task-store.js Correlaciona PreToolUse/SubagentStop por session_id+prompt_id
│   │   │   ├── guard-report.js       Esquema tipado {guard,verdict,severity} en JSONL, opt-in por guard (secrets-guard, injection-guard, pre-commit-tdd)
│   │   │   ├── break-glass.js        Excepcion auditable de un solo uso (id, TTL 5min, log append-only) para guards de riesgo real
│   │   │   ├── permission-decision.js Formato permissionDecision:"deny" (JSON, exit 0) para guards de friccion operativa
│   │   │   ├── agent-frontmatter.js  Parser compartido del frontmatter de un AGENT.md (agentType -> scope de tools:)
│   │   │   ├── normalizar-texto.js   Normalizacion (NFKC, homoglifos, invisibles) antes de matchear regex en guards de deteccion textual
│   │   │   ├── patrones-secretos.js  Fuente unica de patrones de credenciales de alta confianza, usada por secrets-guard.js y git-history-secrets-scan.js
│   │   │   ├── deteccion-resolucion-previa.js Evalua lo que un comando PRODUCE al ejecutarse (decodificar base64/hex) antes de dejarlo pasar
│   │   │   ├── code-reviewer-veredicto.js Regla objetiva de veredicto del Paso 3 de code-reviewer.md como funcion pura testeable
│   │   │   ├── security-scanner-report-format.js Valida el contrato de formato del Paso 5 de security-scanner.md
│   │   │   ├── self-healing-agent-report-format.js Valida el contrato de formato del Paso 4 de self-healing-agent.md
│   │   │   └── contextual-retrieval-benchmark.js Mide recall@K real de BM25+ (con/sin Contextual Retrieval) sobre el corpus de SKILL.md
│   │   └── memory-vault-prune-check.js Hook Stop: avisa (sin borrar) cuando el vault supera 50 archivos
│   └── skills/                  46 skills — enrutamiento via frontmatter description (agentskills.io), reglas en CLAUDE.md
├── tests/                       2044 tests — tests/harness/*.test.js (dividido por modulo) + archivos dedicados
├── .github/workflows/ci.yml     CI: Ubuntu/Windows/macOS, Node 22 unicamente (sandboxing con Permission Model exige >= 22.13.0)
├── CLAUDE.md                    Autoridad unica: reglas globales, skills, enrutamiento
├── DEPRECATIONS.json            Contrato de migracion por version
├── package.json                 v3.41.2, Node >= 22.13.0
└── .env.example                 Plantilla de variables de entorno
```

---

## Como contribuir

### Crear un skill nuevo

1. Crear `.claude/skills/{nombre-en-kebab-case}/SKILL.md`.
2. Frontmatter obligatorio: `name`, `description`, `origin: ai-core`, `version`, `last_updated`, `rol` (`architect`, `coder` o `auditor` — asignado por criterio semantico real, no por keywords automaticos; determina el system prompt y el proveedor de modelo que hereda el skill).
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

Seccion "Restricciones" con la referencia inmutable a CLAUDE.md (`> Reglas de sesion activas: CLAUDE.md > este agente.`) — no copiar el texto de ninguna regla del ANCLA, solo referenciarla. `npm run validate-agents` debe terminar en 0 criticos y 0 altos.

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
| [npm: @google/genai](https://www.npmjs.com/package/@google/genai) | Versiones de Gemini, cambios de API | Por release |

Cuando aparezca una capacidad nueva: `npm outdated` para ver si el SDK ya la trae, `npm run update` si hay version nueva, revisar si afecta hooks o `settings.json`, y documentar en `CHANGELOG.md` con la version que la habilita. El detalle del proceso de verificacion (fuentes aceptadas, orden de pasos, alcance de la actualizacion) vive en `CLAUDE.md`, seccion "Protocolo de Vigencia Tecnologica" — no se duplica aqui.

El agente `aiops-auditor` detecta drift de SDK y skills faltantes. Lanzarlo cuando se sospeche degradacion del arnes.

### Variables de entorno — referencia rapida

```bash
GEMINI_API_KEY     # Gemini 3.6 Flash / 3.1 Flash-Lite, gratuito, tier 0. Tambien worker ContextGathering de MoA
ANTHROPIC_API_KEY  # Claude Haiku/Sonnet/Opus/Fable
OPENAI_API_KEY     # GPT-5.6 (Sol/Terra/Luna) — opcional, tambien verificador cross-model
DEEPSEEK_API_KEY   # DeepSeek V4 (Flash/Pro) — opcional, verificador cross-model y worker SyntaxDrafting de MoA
KIMI_API_KEY       # Kimi K3, 1M de contexto — opcional
DOCS_PATH          # ruta a documentacion interna para RAG local
```

---

## Autoridad unica: CLAUDE.md

`README.md` cubre instalacion, arquitectura y uso. `CLAUDE.md` es el sistema operativo completo: reglas, roles, skills y tablas de enrutamiento. Ante cualquier discrepancia entre ambos, `CLAUDE.md` gana.

---

## Licencia

MIT. Usa, modifica y distribuye libremente, incluso en proyectos comerciales. La autoria queda en el historial de git.

Consultoria o configuracion privada: salvex93@gmail.com.
