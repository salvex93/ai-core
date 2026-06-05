# AI-CORE v3.3.0: Nucleo Multi-Agente Universal

`ai-core` es un nucleo de configuracion y comportamiento para agentes IA distribuible como submodulo Git o repositorio independiente. Inyecta reglas globales inmutables, 32 skills especializados y una herramienta maestra de actualizacion en cualquier proyecto, sin acoplar su logica al stack del anfitrion.

**Una sola fuente de verdad:** `CLAUDE.md` define las reglas globales. Los 32 skills las referencian — no las copian. Si una regla cambia en `CLAUDE.md`, los 32 skills se actualizan automaticamente sin tocar ningun archivo.

---

## Instalacion

### Como repositorio independiente (uso propio)

```bash
git clone git@github.com:salvex93/ai-core.git
cd ai-core
npm install
npm run setup    # adapta settings.json a tu ruta local (cross-platform)
npm test         # verifica 269 assertions — debe pasar 100%
claude           # inicia Claude Code con el nucleo cargado
```

### Como submodulo Git (proyectos de equipo)

```bash
cd /ruta/a/tu-proyecto
git submodule add https://github.com/salvex93/ai-core .claude/ai-core
git submodule update --init --recursive
cd .claude/ai-core && npm install && cd ../..
node .claude/ai-core/.claude/bin/norm-harness.js  # genera settings.json y CLAUDE.md
claude
```

### Actualizar a la ultima version

```bash
npm run update
```

Un solo comando que ejecuta: `git pull` → regenera `settings.json` con tus rutas locales → corre los 269 tests → valida los 32 skills → muestra que cambio. Funciona en Linux, macOS y Windows.

---

## Comandos de referencia

```bash
npm install                               # instalar dependencias
npm test                                  # 269 tests, Node nativo, sin deps externas
npm run setup                             # regenerar settings.json con rutas locales
npm run update                            # actualizacion one-command desde GitHub
npm run validate-globals                  # auditar conformidad de los 32 skills
npm run validate-globals -- --fix-drift   # corregir last_updated desincronizado
npm run token-metrics                     # medir reduccion de consumo de tokens
npm run dry-run                           # simular 5 turnos con calculo de costo
npm run map                               # regenerar CONTEXT_MAP.json
```

---

## Que incorpora v3.3.0

### Herramienta maestra de gobernanza

- **`validate-globals.js`**: auditor de conformidad. Verifica que los 32 skills tengan la referencia inmutable, las secciones obligatorias, frontmatter completo y sin emojis. Detecta y corrige drift de `last_updated` con `--fix-drift`. Exit code 1 si hay hallazgos criticos — bloquea CI.
- **`update.js`**: actualizacion one-command cross-platform. Reporta version anterior vs nueva, que cambio y si hay breaking changes que requieran accion manual.
- **GitHub Actions CI** (`.github/workflows/ci.yml`): corre `npm test` + `validate-globals` en Linux, macOS y Windows con Node 18/20/22 en cada push a `main` y en cada PR. Un PR que rompa la conformidad de un skill no puede mergear.
- **Fuente unica de verdad**: los 32 skills referencian `CLAUDE.md` con jerarquia declarada `CLAUDE.md > skill`. Sin copias — sin drift.

### 32 Skills especializados (Auto-Routing)

| Contexto detectado | Skills activados |
|---|---|
| Diseño de sistema, arquitectura, nuevos modulos | `backend-architect`, `data-engineer` |
| Integracion LLM, Claude API, prompts | `prompt-engineer`, `ai-integrations`, `claude-api` |
| Infraestructura, Docker, CI/CD | `devops-infra`, `release-manager` |
| Seguridad, auditoria, CVEs | `security-auditor`, `attack-surface-analyst` |
| Fallos silenciosos, catch vacios, resilencia | `silent-failure-hunter` |
| Agentes, MCP, flujos automatizados | `managed-agents-specialist`, `mcp-server-builder` |
| Testing de agentes, loops, eficiencia | `agent-testing` |
| Orquestacion multi-agente, fan-out/fan-in | `workflow-orchestrator` |
| Gemini 2.5 directo, thinking budgets, Live API | `gemini-2-5-specialist` |
| Scraping web, anti-bot (Cloudflare/Datadome/Imperva), Stagehand, Crawlee | `web-scraping-specialist` |
| Vision, imagenes, PDFs, extraccion multimodal | `multimodal-engineer` |
| Frontend, componentes, bundle, contrato API | `tech-lead-frontend` |
| SEO tecnico, Core Web Vitals, Schema.org, sitemap | `seo-sem-specialist` |
| SEM: Google Ads, Meta Ads, GA4, UTMs, ROAS | `seo-sem-specialist` |
| Design system, brand identity, tokens, WCAG 2.2 | `ux-visual-designer` |
| Motion design, Framer Motion, GSAP, handoff | `ux-visual-designer`, `tech-lead-frontend` |
| Documentos HTML/PDF para clientes | `doc-builder` |
| Calidad, tests, cobertura, contract testing | `qa-engineer` |
| RAG, embeddings, recuperacion semantica | `rag-specialist` |
| Costo excesivo de tokens, seleccion de modelo | `cost-optimizer` |
| Evals, LLM-as-judge, metricas de outputs | `llm-evals`, `llm-observability` |
| Proteccion LLM, prompt injection, PII | `ai-guardrails` |
| Voice AI, streaming de audio, speech | `audio-voice-engineer` |
| Agentes autonomos con SDK, OAuth MCP | `claude-agent-sdk` |
| Flutter/Dart, mobile, BLoC/Riverpod | `mobile-engineer` |
| BD en produccion: queries, migraciones, pooling | `database-ops` |

### Motor de ahorro de tokens

- **Guard Read** (`guard-read.js`): bloquea lectura directa de archivos > 200 lineas — fuerza delegacion a Gemini tier 0.
- **Validate Map** (`validate-map.js`): regenera `CONTEXT_MAP.json` si hay drift >= 3 archivos — evita discovery por I/O ciego.
- **Modo Neanderthal**: max 3 lineas de prosa cuando el rol es Coder — elimina relleno narrativo.
- **Compact/Clear automatico**: aviso a turno 6, detencion a turno 15.
- **`token-metrics.js`**: mide la reduccion real por sesion. Linea base sin optimizacion: ~15,000 tokens. Con el motor activo: ~8,000 tokens (reduccion ~47%).

### Stack tecnico del motor

- **Model Router**: jerarquia Gemini free (tier 0) → Haiku → Sonnet → Opus. Gemini prioridad absoluta para lecturas, resumenes y analisis.
- **Anthropic Bridge** (`scripts/anthropic-bridge.js`): Prompt Caching de 3 puntos, ventana deslizante de historial.
- **Health-Check System**: autodiagnostico al inicio de sesion. Detecta path drift y autocorrige.
- **Error Repair Loop**: ciclo deteccion → diagnostico → reparacion con LoopGuard (3 stopping conditions).
- **Syntax Check Hook**: `node --check` en cada `.js` editado — sin dependencias externas.

### Stacks soportados por el detector automatico

| Stack | Manifesto detectado | Permisos agregados |
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

### Variables de entorno requeridas

Agregar al `.env` del proyecto anfitrion:

```bash
# Gemini 2.5 Flash (free tier, 1500 req/dia, 1M tokens/req)
GEMINI_API_KEY=<tu-api-key>

# Anthropic (fallback y Model Router)
ANTHROPIC_API_KEY=<tu-api-key>
```

```bash
echo ".env" >> .gitignore
```

### Vinculacion por Symlinks (alternativa para desarrollo centralizado)

Para proyectos que comparten el mismo ai-core local sin submodulo:

**Linux/Mac:**
```bash
rm -f ./CLAUDE.md
ln -s /ruta/a/ai-core/CLAUDE.md ./CLAUDE.md
```

**Windows PowerShell (Administrador):**
```powershell
New-Item -ItemType SymbolicLink -Path './CLAUDE.md' -Target 'C:/ruta/a/ai-core/CLAUDE.md' -Force
```

| Criterio | Symlinks | Submodulos |
|---|---|---|
| Desarrollo centralizado del nucleo | Recomendado | No recomendado |
| Distribucion a terceros / CI | No recomendado | Recomendado |
| Multiples proyectos en la misma maquina | Recomendado | Alternativa |

---

## Arquitectura v3.3.0

### Mapa de modulos

```
.claude/ai-core/
├── scripts/
│   ├── services/
│   │   ├── ModelRouter.js       Enrutamiento Gemini/Haiku/Sonnet/Opus por herramienta y tokens
│   │   ├── AgentRoles.js        Perfiles Architect/Coder/Auditor con system prompts
│   │   ├── IntentClassifier.js  Infiere herramienta y modelo desde el mensaje crudo del usuario
│   │   ├── ContextIndex.js      Indice CONTEXT_MAP.json — resolucion de rutas sin I/O ciego
│   │   └── ErrorRepairLoop.js   Ciclo deteccion→diagnostico→reparacion de errores
│   ├── anthropic-bridge.js      Bridge Anthropic SDK con Prompt Caching y Model Router
│   ├── mcp-gemini.js            Servidor MCP stdio — 5 herramientas de analisis via Gemini
│   ├── gemini-bridge.js         CLI de respaldo para analisis Gemini sin MCP
│   ├── context-monitor.js       Monitor de uso de contexto y alertas de compactacion
│   ├── init-backlog.js          Crea BACKLOG.md en proyecto anfitrion si no existe
│   ├── query-backlog.js         Filtra BACKLOG.md sin cargarlo en contexto
│   ├── session-close.js         Persiste last_session.md al cerrar sesion
│   └── dry-run-cost-sim.js      Simulador de costo sin llamadas reales
├── .claude/
│   ├── settings.json            Template hooks + config MCP server
│   ├── bin/
│   │   ├── health-check.js      Autodiagnostico, path drift detection y autocorreccion al inicio
│   │   ├── health-report.js     Generador de reporte estructurado de estado del sistema
│   │   ├── health-sync.js       Checks sincronos: deps, skills, MCPs
│   │   ├── health-worker.js     Worker detached para checks HTTP asincronos
│   │   ├── detect-stack.js      Infiere stack del anfitrion via manifiestos; sin leer archivos
│   │   ├── validate-map.js      Valida y regenera CONTEXT_MAP.json si hay drift >= 3 archivos
│   │   ├── guard-read.js        Hook PreToolUse: bloquea Read > 200 lineas, fuerza Gemini
│   │   ├── norm-harness.js      Setup automatico: settings.json + permisos por stack + CLAUDE.md
│   │   ├── norm-harness.ps1     Equivalente PowerShell (rutas dinamicas via $PSScriptRoot)
│   │   ├── setup-settings.js    Regenera settings.json con rutas locales (cross-platform)
│   │   ├── validate-globals.js  Auditor de conformidad de skills vs CLAUDE.md
│   │   ├── generate-map.js      Genera CONTEXT_MAP dual host/core con seccion stack
│   │   ├── detox.js             Limpia archivos legacy que contaminan contexto
│   │   └── benchmark-fernet.js  Testea cifrado Fernet (PII)
│   └── skills/                  32 skills especializados (ver tabla Auto-Routing)
├── scripts/
│   └── update.js                Actualizacion one-command: pull + setup + test + validate
├── tests/
│   ├── harness.test.js          269 assertions sobre harness y conformidad de skills
│   └── token-metrics.js         Mide reduccion de consumo de tokens por sesion
├── .github/
│   └── workflows/ci.yml         CI en Linux/Mac/Windows x Node 18/20/22
├── CLAUDE.md                    Autoridad unica: reglas globales, 32 skills, enrutamiento
├── package.json                 v3.3.0 — Node >= 18.0.0
└── .env.example                 Plantilla de variables de entorno
```

### Flujo de datos entre modulos

```
Claude Code
    └─ invoca herramienta MCP
          │
          ▼
mcp-gemini.js  (servidor MCP stdio, JSON-RPC 2.0)
    ├── analizar_archivo     → si > 500 lineas/50KB: Gemini 2.5 Flash
    ├── analizar_contenido   → Gemini 2.5 Flash
    ├── analizar_repositorio → lee 11 manifiestos, Gemini 2.5 Flash
    ├── resumir_backlog      → Gemini 2.5 Flash
    └── buscar_web           → Google Search grounding
          │
          └─ [Circuit Breaker] fallo de cuota → fallback
                │
                ▼
anthropic-bridge.js  (fallback + bridge primario)
    ├── ContextIndex.resolver()        → rutas via CONTEXT_MAP.json
    ├── ModelRouter.route()            → Haiku / Sonnet / Opus
    ├── AgentRoles.inferirRol()        → coder / auditor / architect
    ├── AgentRoles.systemPromptParaRol() → system prompt del rol
    ├── buildSystemBlocks()            → 3 puntos de cache ephemeral
    └── client.messages.create()      → API Anthropic

ErrorRepairLoop.js  (middleware de reparacion + LoopGuard)
    ├── clasificarError()              → severidad + categoria
    ├── buildPromptDiagnostico()       → prompt para AUDITOR (Sonnet)
    ├── buildPromptReparacion()        → prompt para ARCHITECT (Opus)
    ├── ejecutarCicloReparacion()      → completar() x2 (diagnostico + reparacion)
    └── LoopGuard                      → stopping conditions para loops autonomos
          ├── registrarCheckpoint()    → evalua avance + error por iteracion
          └── _evaluar()              → PRESUPUESTO_EXCEDIDO | SIN_AVANCE | ERROR_REPETIDO

ModelRouter.js  (nodo hoja — sin dependencias internas)
    └── route(herramienta, tokens)     → { modelo, tier, razon }
    └── estimarCosto(modelo, in, out, cacheHit) → { costoUSD, desglose }

ContextIndex.js
    └── carga CONTEXT_MAP.json (repo anfitrion > ai-core local)
    └── resolver() / leerSiIndexado() → rutas absolutas sin I/O ciego

AgentRoles.js
    └── importa MODELOS de ModelRouter
    └── ROLES, MODELO_POR_ROL, HERRAMIENTA_A_ROL
```

---

## Instructivo de Uso — Como Invocar Cada Rol

El nucleo opera con tres roles especializados. El rol se selecciona automaticamente via `AgentRoles.inferirRol(herramienta)` al llamar al `anthropic-bridge`. A continuacion se detalla como invocar cada rol directamente y que comportamiento esperar.

### Rol ARCHITECT (Opus 4.7)

**Proposito:** Diseño de sistemas, analisis de repositorios, busqueda web, refactorizacion de arquitectura. Produce especificaciones tecnicas accionables con rutas de archivo y numeros de linea.

**Herramientas que lo activan automaticamente:**
- `analizar_repositorio`
- `buscar_web`
- `refactorizar_arquitectura`
- `disenar_sistema`

**Invocacion directa via `anthropic-bridge`:**

```js
const { completar } = require('.claude/ai-core/scripts/anthropic-bridge');

const resultado = await completar({
  herramienta: 'disenar_sistema',          // activa rol ARCHITECT → Opus 4.7
  mensajeUsuario: 'Diseña el schema de base de datos para un sistema multi-tenant.',
  historial: [],                           // array de turnos previos {role, content}
  skills: ['backend-architect'],           // skills inyectados en el system prompt
  sessionId: 'sesion-001'                  // trazabilidad de costos (opcional)
});

console.log(resultado.respuesta);
console.log(`Modelo: ${resultado.modelo} | Razon: ${resultado.razonRouting}`);
console.log(`Tokens: input=${resultado.uso.input_tokens} output=${resultado.uso.output_tokens}`);
```

**Comportamiento esperado:**
- Respuestas en formato estructurado con rutas relativas y numeros de linea.
- Evalua trade-offs explicitamente antes de emitir una recomendacion.
- Escala automaticamente a Opus si `tokensContexto >= 60000` sin importar la herramienta.

**Escalamiento manual desde Claude Code:**

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
Diseña el sistema de autenticacion multi-factor integrando OAuth 2.0 y TOTP.
```

---

### Rol CODER (Haiku 4.5 — Modo Neanderthal)

**Proposito:** Parseo de datos, resumen de backlogs, analisis de contenido, reparacion de errores simples. Responde exclusivamente con codigo o comandos de shell — sin explicaciones ni confirmaciones.

**Herramientas que lo activan automaticamente:**
- `resumir_backlog`
- `analizar_contenido`
- `reparar_error`

**Invocacion directa via `anthropic-bridge`:**

```js
const { completar } = require('.claude/ai-core/scripts/anthropic-bridge');

const resultado = await completar({
  herramienta: 'resumir_backlog',          // activa rol CODER → Haiku 4.5
  mensajeUsuario: contenidoDelBacklog,
  historial: [],
  skills: []
});

// La respuesta es unicamente el JSON del backlog parseado
const backlog = JSON.parse(resultado.respuesta);
```

**Comportamiento esperado:**
- Output exclusivamente codigo o comandos. Cero texto narrativo.
- Si `tokensContexto >= 12000` y la herramienta esta en TIER_HAIKU, el router escala automaticamente a Sonnet.
- Latencia minima — prioritario para tareas de alta frecuencia.

**Invocacion via CLI de npm:**

```bash
# Desde la raiz del ai-core
npm run init-backlog
npm run query-backlog
npm run dry-run
```

---

### Rol AUDITOR (Sonnet 4.6)

**Proposito:** Analisis de archivos, diagnostico de errores, auditoria de seguridad. Clasifica hallazgos por severidad (CRITICO / ALTO / MEDIO / BAJO) y genera ordenes de reparacion accionables.

**Herramientas que lo activan automaticamente:**
- `analizar_archivo`
- `auditar_seguridad_critica`
- `diagnosticar_error`

**Invocacion directa via `anthropic-bridge`:**

```js
const { completar } = require('.claude/ai-core/scripts/anthropic-bridge');

const resultado = await completar({
  herramienta: 'analizar_archivo',         // activa rol AUDITOR → Sonnet 4.6
  mensajeUsuario: `Analiza el siguiente error de produccion:\n${stderr}`,
  historial: historialPrevio,
  skills: ['security-auditor'],
  sessionId: req.sessionId
});
```

**Comportamiento esperado:**
- Cada hallazgo incluye: severidad, categoria, causa raiz, archivos afectados, accion correctiva.
- Si la severidad detectada es CRITICO, emite `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]` automaticamente para escalar a ARCHITECT.

**Invocacion via Error Repair Loop (ciclo completo):**

```js
const { ejecutarCicloReparacion } = require('.claude/ai-core/scripts/services/ErrorRepairLoop');

// Ciclo automatico: AUDITOR diagnostica → ARCHITECT genera la reparacion
const resultado = await ejecutarCicloReparacion({
  error: err,
  herramienta: 'analizar_archivo',
  exitCode: process.exitCode,
  stderr: stderrCapturado,
  sessionId: 'sesion-001'
});

console.log('Diagnostico:', resultado.diagnostico);
// { causa_raiz, archivos_afectados, accion_correctiva, prevencion, severidad, categoria }

console.log('Reparacion propuesta:', resultado.reparacion);
// Codigo o comando ejecutable con ruta y linea como comentario inicial

console.log('Modelos usados:', resultado.modelo_usado);
// { diagnostico: 'claude-sonnet-4-6', reparacion: 'claude-opus-4-7' }
```

**Uso de LoopGuard en scrapers autonomos:**

```js
const { LoopGuard } = require('.claude/ai-core/scripts/services/ErrorRepairLoop');

const guard = new LoopGuard({ maxIntentos: 5 });

while (true) {
  let avance = false;
  let errorMsg = null;

  try {
    await ejecutarIteracion();
    avance = true;
  } catch (err) {
    errorMsg = err.message;
  }

  const { escalar, razon } = guard.registrarCheckpoint({ avance, error: errorMsg });

  if (escalar) {
    logger.error({ nivel: 'CRITICO', razon, contexto: 'loop-scraper' });
    break; // escalar a operador o ErrorRepairLoop
  }
}
```

**Clasificacion automatica de errores:**

| Pattern detectado | Severidad | Categoria |
|---|---|---|
| `ENOENT`, `no such file` | ALTO | sistema_de_archivos |
| `ECONNREFUSED`, `ETIMEDOUT` | CRITICO | red_conectividad |
| `SyntaxError`, `JSON.parse` | MEDIO | parseo_json |
| `TypeError`, `undefined.*null` | ALTO | tipo_datos |
| `EACCES`, `permission denied` | CRITICO | permisos |
| `quota`, `rate.?limit`, `429` | MEDIO | api_quota |
| `401`, `403`, `Unauthorized` | CRITICO | autenticacion |

---

### Invocacion del Model Router de forma independiente

```js
const { route, estimarCosto, MODELOS } = require('.claude/ai-core/scripts/services/ModelRouter');

// Decidir modelo antes de hacer la llamada
const { modelo, tier, razon } = route('analizar_archivo', 8000);
// → { modelo: 'claude-sonnet-4-6', tier: 'sonnet', razon: 'herramienta en TIER_SONNET' }

// Estimar costo de una llamada
const costo = estimarCosto(MODELOS.SONNET, 5000, 800, 3000);
// → { costoUSD: 0.0195, desglose: { ... } }
// Los 3000 tokens de cache hit se facturan al 10% del precio de input

console.log(`Costo estimado: $${costo.costoUSD.toFixed(4)}`);
```

---

### Consulta del Context Index

```js
const { resolver, leerSiIndexado, diagnostico } = require('.claude/ai-core/scripts/services/ContextIndex');

// Resolver ruta via indice (evita readFileSync ciego)
const ruta = resolver('src/domain/services/chat/faqFlow.js');
// → '/ruta/absoluta/al/repo/src/domain/services/chat/faqFlow.js' o null

// Leer directamente si esta indexado
const resultado = leerSiIndexado('scripts/services/ModelRouter.js');
if (resultado) {
  console.log(resultado.contenido);  // string del archivo
  console.log(resultado.rutaAbsoluta);
}

// Estado del indice
const estado = diagnostico();
// → { estado: 'ok', version: '...', total_archivos: 602, raiz_resuelta: '...' }
```

---

### Herramientas MCP expuestas por `mcp-gemini.js`

El servidor MCP se activa automaticamente cuando Claude Code esta configurado con `mcp-gemini` en `.claude/settings.json`. Las herramientas son invocadas por el agente segun Regla 9 — no requieren instruccion explicita del usuario.

| Herramienta | Parametros | Umbral de delegacion | Schema de retorno |
|---|---|---|---|
| `analizar_archivo` | `ruta`, `mision` | > 500 lineas o > 50 KB | `{ resumen, hallazgos_clave, recomendaciones, advertencias }` |
| `analizar_contenido` | `contenido`, `mision` | Siempre delega | Igual que `analizar_archivo` |
| `analizar_repositorio` | `mision`, `ruta_raiz?` | Siempre — lee 11 manifiestos | `{ stack, dependencias_ia, variables_entorno, convenciones, resumen }` |
| `resumir_backlog` | `ruta_backlog?` | Siempre | `{ tareas_abiertas[], total_abiertas, resumen }` |
| `buscar_web` | `consulta`, `mision` | Siempre — Google grounding | `{ respuesta, fuentes[], queries_ejecutadas[] }` |

**Ejemplo de uso directo via `analizar_archivo` (para archivos debajo del umbral):**

Cuando el archivo es menor al umbral (≤ 500 lineas y ≤ 50 KB), `analizar_archivo` retorna el contenido directamente con `delegado: false`. Esto permite que el agente principal procese el contexto sin latencia de Gemini.

**CLI de respaldo (sin servidor MCP activo):**

```bash
# Analisis con salida JSON
node .claude/ai-core/scripts/gemini-bridge.js \
  --mission "Identifica patrones de acoplamiento entre modulos" \
  --file ./src/services/user.service.ts \
  --format json

# Analisis con salida Markdown
node .claude/ai-core/scripts/gemini-bridge.js \
  --mission "Extrae todos los endpoints y sus contratos" \
  --file ./docs/api-reference.md \
  --format markdown
```

---

### Normalizar el entorno (norm-harness)

`norm-harness.js` se ejecuta en el hook `SessionStart`. Realiza tres operaciones en orden:

1. **Detox** — elimina archivos legacy de la BLACKLIST que contaminan la memoria del agente.
2. **Symlinks** — si `CLAUDE.md` no existe en el proyecto anfitrion, crea el symlink al del nucleo.
3. **Purga de sesiones** — limpia sesiones antiguas de Claude (`~/.claude/sessions/`).

Para ejecutar manualmente:

```bash
node .claude/ai-core/.claude/bin/norm-harness.js
```

En Windows, el equivalente PowerShell usa rutas dinamicas via `$PSScriptRoot` — es portable a cualquier equipo:

```powershell
.\.claude\ai-core\.claude\bin\norm-harness.ps1
```

---

## Protocolo Gemini Bridge

El LLM Routing Bridge externaliza lecturas de archivos grandes como proceso separado via el servidor MCP. Esta es una politica de COSTO, no de capacidad.

### Cuando se activa (Regla 9 — automatico)

- El archivo analizado supera 500 lineas o 50 KB.
- La tarea requiere leer multiples documentos externos de forma simultanea.
- La tarea demandaria mas del 30% del context window disponible.

### Circuit Breaker

Si Gemini agota su cuota (error `429` / `quota`), el sistema:
1. Detecta el fallo en el catch del dispatcher MCP.
2. Activa `capturarError()` del Error Repair Loop.
3. Degrada a `grep`/`find` en el contexto principal (Regla 14).
4. Activa `anthropic-bridge.js` como fallback con modelo segun el Model Router.

### Schema de salida estandar

```json
{
  "resumen": "<sintesis ejecutiva>",
  "hallazgos_clave": ["<hallazgo 1>"],
  "recomendaciones": ["<recomendacion 1>"],
  "advertencias": ["<advertencia critica>"],
  "metadatos": {
    "archivo_analizado": "<nombre>",
    "modelo": "<model-id>",
    "timestamp": "<ISO 8601>"
  }
}
```

---

## Orquestacion de Modelos

### Triada de ejecucion

| Capa | Modelo | Rol | Activacion |
|---|---|---|---|
| Gatekeeper | `claude-haiku-4-5-20251001` | Decisiones rapidas: CRUD, busquedas, parseo, resumen | TIER_HAIKU o tareas triviales |
| Ejecutor | `claude-sonnet-4-6` | 80% de tareas complejas: codigo, refactor, debug, analisis | TIER_SONNET o escalamiento por tokens |
| Arquitecto | `claude-opus-4-7` | Diseño de sistemas, auditoria critica, reparacion compleja | TIER_OPUS o `tokensContexto >= 60000` |

### Logica de escalamiento del Model Router

```
route(herramienta, tokensContexto):
  si tokensContexto >= 60000  → Opus  (override total)
  si herramienta en TIER_OPUS → Opus
  si herramienta en TIER_SONNET → Sonnet
  si herramienta en TIER_HAIKU:
    si tokensContexto >= 12000 → escala a Sonnet
    sino                       → Haiku
  fallback                    → Sonnet
```

### Prompt Caching — tres puntos ephemeral

```
system[0]: CLAUDE.md completo           → cache_control: ephemeral  (PUNTO A)
system[1]: SKILL.md de skills activos   → cache_control: ephemeral  (PUNTO B)
system[2]: Definicion de herramientas   → cache_control: ephemeral  (PUNTO C)
system[3]: System prompt del rol        → sin cache (varia por herramienta)
messages:  Historial + turno actual     → dinamico
```

Ahorro esperado: 90% en tokens de input desde el segundo turno. Los cache hits se facturan al 10% del precio normal de input.

### Ventana deslizante de historial

El historial se trunca a los ultimos 6 pares user/assistant (`MAX_TURNS_WINDOW = 6`) antes de cada llamada. El ultimo mensaje user sin respuesta se preserva siempre.

---

## Tabla de Comandos Sentinel — CLI del Nucleo

Todos los comandos se ejecutan desde la raiz del proyecto anfitrion.

| Comando | Ruta | Proposito |
|---|---|---|
| `npm run init-backlog` | `scripts/init-backlog.js` | Crea `BACKLOG.md` de 12 columnas si no existe |
| `npm run query-backlog` | `scripts/query-backlog.js` | Filtra tareas activas sin cargar el archivo completo |
| `npm run dry-run` | `scripts/dry-run-cost-sim.js` | Simula costos sin llamadas reales al API |
| `npm run mcp-gemini` | `scripts/mcp-gemini.js` | Inicia servidor MCP manualmente |
| `npm run gemini-bridge` | `scripts/gemini-bridge.js` | CLI de analisis Gemini |
| `npm run anthropic-bridge` | `scripts/anthropic-bridge.js` | CLI del bridge Anthropic |
| `node .claude/bin/norm-harness.js` | `.claude/bin/norm-harness.js` | Normaliza entorno: detox + symlinks + purga |
| `node .claude/bin/generate-map.js` | `.claude/bin/generate-map.js` | Regenera `CONTEXT_MAP.json` |
| `node .claude/bin/detox.js` | `.claude/bin/detox.js` | Limpia archivos legacy de memoria del agente |

---

## Flujo de Trabajo y Memoria

### BACKLOG.md — persistencia entre sesiones

El `BACKLOG.md` es el artefacto de persistencia de contexto entre sesiones. Todo hallazgo o decision arquitectonica que no se registre aqui se pierde al cerrar la sesion (Regla 7).

Columnas inmutables:

| #Tarea | Notas / Contexto | cTipo | Descripcion | Responsable | Fecha inicio (Real) | Fecha Fin (Real) | Estatus | Jerarquia | Estimacion | Planner | Compromiso |

Valores validos para `cTipo`: `Feat`, `Fix`, `Infra`, `Refactor`, `Docs`, `Test`, `Chore`.
Valores validos para `Estatus`: `Pendiente`, `En Progreso`, `Bloqueado`, `Terminado`.

Protocolo Regla 7:
- "ejecuta el cierre de tarea" → agente busca la tarea activa y cambia `Estatus` a `Terminado`.
- Todo esfuerzo tecnico no visible en la instruccion original se registra como nueva fila obligatoriamente.

---

## Orquestacion de Skills

### Auto-Routing (Regla 20)

El agente mapea automaticamente el dominio tecnico de la solicitud contra 29 skills especializados. Confidence > 85% = activacion inmediata sin instruccion explicita.

| Skill | Palabras clave de activacion | Modelo base |
|---|---|---|
| `tech-lead-frontend` | componente, estado, bundle, CSS, React, Vue, Angular, WCAG, ortografia UI, seguridad frontend, tests componentes | Sonnet |
| `cost-optimizer` | token, costo, presupuesto, quema, modelo, batch, cache, presupuesto LLM | Sonnet |
| `claude-agent-sdk` | agente, subagente, hook, SDK, autonomo, tool_use | Opus |
| `managed-agents-specialist` | agente gestionado, tools Anthropic, loop de agente | Sonnet |
| `workflow-orchestrator` | fan-out, fan-in, retry, checkpoint, orquestacion multi-agente | Sonnet |
| `ai-integrations` | LLM, streaming, fallback, proveedor, costos, token, interleaved thinking, task budgets | Sonnet |
| `claude-api` | anthropic SDK, prompt caching, tool use, Batch API, Files API, Citations API | Sonnet |
| `prompt-engineer` | prompt, few-shot, system message, chain-of-thought, prefill, versionado, thinking_level | Sonnet |
| `mcp-server-builder` | MCP, servidor, JSON Schema, stdio, SSE, OAuth MCP remoto | Sonnet |
| `llm-evals` | eval, benchmark, calidad LLM, golden dataset, metrica, gate de release | Sonnet |
| `llm-observability` | tracing, dashboard, costo LLM, latencia, Grafana, Langfuse | Sonnet |
| `rag-specialist` | RAG, vector, embedding, retrieval, indexacion, Citations API, re-ranking | Sonnet |
| `backend-architect` | API, schema, migracion, query, BD, ORM, Knex, SQL, tests unitarios backend, tests integracion | Sonnet |
| `audio-voice-engineer` | voice, audio, streaming, speech, latencia, Gemini live, TTS, STT | Sonnet |
| `mobile-engineer` | Flutter, BLoC, Riverpod, Firebase, iOS, Android, flutter_riverpod, Impeller | Sonnet |
| `release-manager` | release, branching, deploy, CI/CD, rollback, SemVer, Merge Queue | Sonnet |
| `qa-engineer` | test, jest, pytest, vitest, cobertura, contract testing | Sonnet |
| `security-auditor` | seguridad, CVE, OWASP, secreto, password, compliance | Sonnet |
| `devops-infra` | Kubernetes, IaC, Terraform, Docker, networking | Sonnet |
| `data-engineer` | pipeline, dbt, Medallion, airflow, dagster, linaje | Sonnet |
| `ai-guardrails` | guardrail, filtro, input validation, jailbreak, prompt injection, PII, Model Armor | Sonnet |
| `attack-surface-analyst` | superficie, exposicion, credencial, subdominio | Sonnet |
| `aiops-engineer` | auditoria, skill, ai-core, Anthropic changelog | Sonnet |
| `doc-builder` | propuesta, documento HTML, PDF, entregable, cliente | Sonnet |
| `gemini-2-5-specialist` | Gemini 2.5 Pro/Flash, thinking budget, Flash-Lite, Live API, image gen, TTS nativo | Sonnet |
| `web-scraping-specialist` | scraping, Playwright, Puppeteer, OCR, CAPTCHA, proxy, precio, marketplace | Sonnet |
| `multimodal-engineer` | vision, imagen, PDF, factura, contrato, extraccion estructurada, Citations API, embeddings visuales, multimodal | Sonnet |
| `agent-testing` | test de agente, mock MCP, infinite loop, tool call efficiency, promptfoo agente | Sonnet |
| `silent-failure-hunter` | catch vacio, excepcion tragada, error silencioso, log sin contexto, resilencia scraper, fallo sin traza | Sonnet |

Jerarquia de conflicto (Regla 21): `security-auditor > backend-architect > devops-infra > release-manager`.

---

## Reglas Globales — Referencia Rapida

Las reglas globales son inmutables. Aplican a todos los perfiles sin excepcion. El detalle completo esta en `CLAUDE.md`.

| # | Nombre | Efecto observable |
|---|---|---|
| 1 | Idioma y Tono | Espanol estricto. Mentor Senior: tecnico y directo. |
| 2 | Restriccion Visual | Sin emojis, iconos ni adornos. Solo texto y codigo. |
| 3 | Exploracion Dinamica | Lee manifiestos del anfitrion antes de emitir recomendaciones. |
| 4 | Minimo Cambio | No inventa logica no solicitada. |
| 5 | Precision Quirurgica | Toda modificacion incluye ruta relativa y numero de linea exacto. |
| 6 | Enrutamiento Dinamico | Triada Haiku/Sonnet/Opus. Escala a Opus bajo `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]`. |
| 7 | Persistencia | Registra hallazgos en BACKLOG.md. Registra trabajo oculto. |
| 8 | Git Flow Universal | Ramas aisladas. Conventional Commits. Pipeline verde antes de merge. |
| 9 | Delegacion de Analisis Masivo | Delega > 500 lineas / > 50 KB via MCP. Circuit Breaker activo. |
| 10 | UI/UX Pro Max | Atomic Design + WCAG AA + Mobile First en frontend. |
| 11 | Project Superpower | Auditoria preventiva autonoma. Corrige cuellos de botella al detectarlos. |
| 12 | Everything Claude Code | Actualiza `package.json`, `.env.example` tras cambios que lo requieran. |
| 13 | Duda Activa | Se detiene y pide contexto ante instrucciones ambiguas con riesgo de romper dependencias. |
| 14 | Eficiencia de Busqueda | `grep`/`find` antes de leer archivos completos. |
| 15 | Documentacion Viva | Toda modificacion del nucleo exige actualizar README + commit + push. |
| 16 | Higiene de Contexto | `/compact` al llegar al 50% del context window. `/clear` al cerrar tarea. |
| 17 | Versionado de Skills | Toda modificacion de SKILL.md actualiza `version` y `last_updated` en el mismo commit. |
| 18 | Brevedad de Respuesta | Sin frases de confirmacion ni resumenes post-tarea. Silencio Positivo como norma. |
| 19 | Disciplina de Sesion | Una sesion = una tarea. Leer memoria antes que archivos. |
| 20 | Dispatcher Unificado | Mapeo automatico de dominio a skill especializado (confidence > 85%). |
| 21 | Subordinacion de Skills | Todos los skills subordinados a R18 (Brevedad) y R4 (Minimo Cambio). |
| 22 | Sensor de Eficiencia | `wc -l` antes de Read. Si > 300 lineas: invocar `analizar_archivo`. Tareas simples: forzar Haiku. |

---

## Mantenimiento y Evolucion Autonoma

Para auditar el ecosistema, escribir la siguiente instruccion al agente en Claude Code:

```
skill aiops-engineer
Tu tarea: audita el ecosistema. Analiza nuevas especificaciones de Anthropic y Gemini.
Lee los archivos SKILL.md y propón refactorizaciones para eficiencia.
Identifica si necesitamos un nuevo skill basado en tendencias actuales.
```

Nota: los skills de ai-core no son slash commands de Claude Code. Se invocan escribiendo
`skill <nombre>` como instruccion al agente, o activando el skill via la interfaz de Claude Code.

El agente leera su propio codigo, propondra las mejoras y tras aprobacion ejecutara el commit automatico (Regla 15).

---

## Como Contribuir: Crear un Nuevo Skill

1. Crear carpeta `.claude/skills/{nombre-en-kebab-case}/`.
2. Crear `SKILL.md` con frontmatter YAML: `name`, `description`, `version`, `last_updated`, `origin: ai-core`.
3. Incluir obligatoriamente: "Cuando Activar Este Perfil", "Primera Accion al Activar", "Directiva de Interrupcion", "Restricciones del Perfil".
4. No sobreescribir ninguna Regla Global.
5. Actualizar `CLAUDE.md`, seccion "Skills Disponibles".
6. `git add . && git commit && git push` (Regla 15).

---

## Autoridad Unica: CLAUDE.md

`README.md` = instalacion, arquitectura y uso. `CLAUDE.md` = sistema operativo completo (reglas, triada, 29 skills, tablas de enrutamiento, politicas de escalamiento).

---

## Licencia

**MIT License.** Usa, modifica y distribuye libremente en proyectos comerciales. Autoria permanece en historial git.

**Enterprise/Consultoría:** Contacta a salvex93@gmail.com para configuracion privada o asesoria tecnica.
