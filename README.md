# AI-CORE: Nucleo Multi-Agente Universal

`ai-core` es un nucleo de configuracion y comportamiento para agentes IA que se incorpora a cualquier repositorio como submódulo Git. Inyecta reglas globales inmutables y perfiles de comportamiento tecnico especializados (skills) sin acoplar su logica al stack del proyecto anfitrion. La lista autoritativa de reglas y skills esta en `CLAUDE.md`.

El sistema es framework-agnostic por diseño. No asume Node.js, Python, Go ni ningun otro lenguaje. Cada agente lee los manifiestos del repositorio anfitrion (`package.json`, `requirements.txt`, `go.mod`, etc.) al activarse y adapta sus recomendaciones al entorno real del proyecto.

Desde v2.6.3, el nucleo incorpora:

- **Model Router** (`scripts/services/ModelRouter.js`): enruta cada llamada al modelo optimo (Haiku/Sonnet/Opus) segun herramienta y volumen de contexto. Incluye estimacion de costo con descuento por cache hit.
- **Context Index** (`scripts/services/ContextIndex.js`): resuelve rutas via `CONTEXT_MAP.json` antes de ir al disco. Elimina lecturas ciegas en el repo anfitrion.
- **Agent Roles** (`scripts/services/AgentRoles.js`): asigna system prompt y modelo segun el rol inferido de la herramienta (Architect / Coder / Auditor).
- **Error Repair Loop** (`scripts/services/ErrorRepairLoop.js`): ciclo automatico de deteccion, diagnostico y reparacion de errores en tres fases.
- **Anthropic Bridge** (`scripts/anthropic-bridge.js`): fallback al API de Anthropic con Prompt Caching de tres puntos y ventana deslizante de historial.
- **LLM Routing Bridge** via Gemini 2.5 Flash: externaliza el analisis de archivos > 500 lineas / 50 KB como proceso separado, protegiendo el context window principal.
- **Hook de sesion**: `scripts/init-backlog.js` garantiza la presencia de `BACKLOG.md` antes de iniciar cualquier sesion de trabajo.

---

## Instalacion como Submodulo Git

### Paso 1A — Incorporar ai-core como submodulo (recomendado para distribucion)

```bash
cd /ruta/a/tu-proyecto
git submodule add https://github.com/salvex93/ai-core .claude/ai-core
git submodule update --init --recursive
```

El agente detecta el `CLAUDE.md` del nucleo automaticamente al iniciarse en el repositorio anfitrion.

Para mantener el nucleo actualizado:

```bash
git submodule update --remote .claude/ai-core
git add .claude/ai-core
git commit -m "chore: actualizar ai-core a la ultima version del nucleo"
```

### Paso 1B — Alternativa: Vincular ai-core via Symlinks (recomendado para desarrollo centralizado)

Para proyectos que necesitan sincronizacion inmediata de cambios en `CLAUDE.md` y `.claude/skills/` sin esperar actualizaciones de submodulo, usa symlinks. Este metodo garantiza heredancia fisica de las Reglas Globales.

**En Windows PowerShell (como Administrador):**

```powershell
Remove-Item './CLAUDE.md' -ErrorAction SilentlyContinue
New-Item -ItemType SymbolicLink -Path './CLAUDE.md' -Target 'C:/ruta/a/ai-core/CLAUDE.md' -Force
New-Item -ItemType SymbolicLink -Path './.claude/skills' -Target 'C:/ruta/a/ai-core/.claude/skills' -Force
New-Item -ItemType SymbolicLink -Path './.claude/settings.json' -Target 'C:/ruta/a/ai-core/.claude/settings.json' -Force
```

**En Linux/Mac:**

```bash
rm -f ./CLAUDE.md
ln -s /ruta/a/ai-core/CLAUDE.md ./CLAUDE.md
rm -rf ./.claude/skills
ln -s /ruta/a/ai-core/.claude/skills ./.claude/skills
ln -s /ruta/a/ai-core/.claude/settings.json ./.claude/settings.json
```

**Cuando usar Symlinks vs Submodulos:**

| Criterio | Symlinks | Submodulos |
|---|---|---|
| Equipos multiples trabajando con ai-core | Recomendado | Alternativa |
| Desarrollo centralizado del nucleo | Recomendado | No recomendado |
| Distribucion a terceros (GitHub) | No recomendado | Recomendado |
| Frecuencia de cambio en CLAUDE.md | Alta (varias veces/semana) | Baja (varias veces/mes) |

### Paso 2 — Instalar dependencias del nucleo

```bash
cd .claude/ai-core
npm install
cd ../..
```

Dependencias instaladas: `@anthropic-ai/sdk`, `@google/generative-ai`, `@modelcontextprotocol/sdk`.

### Paso 3 — Configurar variables de entorno

Agregar al `.env` del proyecto anfitrion:

```bash
# Gemini 2.5 Flash (free tier, 1500 req/dia, 1M tokens/req)
# Obtener en: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=<tu-api-key>

# Anthropic (fallback y Model Router)
# Obtener en: https://console.anthropic.com
ANTHROPIC_API_KEY=<tu-api-key>
```

Agregar `.env` al `.gitignore`:

```bash
echo ".env" >> .gitignore
```

### Paso 4 — Configurar los hooks de sesion

Crear o editar `.claude/settings.json` en la raiz del proyecto anfitrion:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/ai-core/scripts/init-backlog.js"
          },
          {
            "type": "command",
            "command": "node .claude/ai-core/scripts/session-close.js"
          }
        ]
      }
    ]
  }
}
```

El evento `Stop` se dispara al finalizar cada respuesta. `init-backlog.js` detecta si `BACKLOG.md` ya existe y no lo sobreescribe — la ejecucion repetida es inocua.

### Paso 5 — Iniciar Claude Code

```bash
claude
```

El agente hereda automaticamente las reglas globales del `CLAUDE.md` del nucleo. La primera accion autonoma es leer los manifiestos del proyecto para deducir el stack (Regla 3).

---

## Arquitectura v2.6.3

### Mapa de modulos

```
.claude/ai-core/
├── scripts/
│   ├── services/
│   │   ├── ModelRouter.js       Enrutamiento Haiku/Sonnet/Opus por herramienta y tokens
│   │   ├── AgentRoles.js        Perfiles Architect/Coder/Auditor con system prompts
│   │   ├── ContextIndex.js      Indice CONTEXT_MAP.json — resolucion de rutas sin I/O ciego
│   │   └── ErrorRepairLoop.js   Ciclo deteccion→diagnostico→reparacion de errores
│   ├── anthropic-bridge.js      Bridge Anthropic SDK con Prompt Caching y Model Router
│   ├── mcp-gemini.js            Servidor MCP stdio — 5 herramientas de analisis via Gemini
│   ├── gemini-bridge.js         CLI de respaldo para analisis Gemini sin MCP
│   ├── init-backlog.js          Crea BACKLOG.md en proyecto anfitrion si no existe
│   ├── query-backlog.js         Filtra BACKLOG.md sin cargarlo en contexto
│   ├── session-close.js         Persiste last_session.md al cerrar sesion
│   └── dry-run-cost-sim.js      Simulador de costo sin llamadas reales
├── .claude/
│   ├── settings.json            Template hooks + config MCP server
│   ├── bin/
│   │   ├── norm-harness.js      Blindaje de entorno: detox + symlinks + purga de sesiones
│   │   ├── norm-harness.ps1     Equivalente PowerShell (rutas dinamicas via $PSScriptRoot)
│   │   ├── generate-map.js      Genera/actualiza CONTEXT_MAP.json
│   │   ├── detox.js             Limpia archivos legacy que contaminan contexto
│   │   └── benchmark-fernet.js  Testea cifrado Fernet (PII)
│   └── skills/                  20 skills especializados (ver tabla Auto-Routing)
├── CLAUDE.md                    Autoridad unica: 22 reglas, triada, skills, enrutamiento
├── package.json                 v2.6.3 — Node >= 18.0.0
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

ErrorRepairLoop.js  (middleware de reparacion)
    ├── clasificarError()              → severidad + categoria
    ├── buildPromptDiagnostico()       → prompt para AUDITOR (Sonnet)
    ├── buildPromptReparacion()        → prompt para ARCHITECT (Opus)
    └── ejecutarCicloReparacion()      → completar() x2 (diagnostico + reparacion)

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

El agente mapea automaticamente el dominio tecnico de la solicitud contra 20 skills especializados. Confidence > 85% = activacion inmediata sin instruccion explicita.

| Skill | Palabras clave de activacion | Modelo base |
|---|---|---|
| `tech-lead-frontend` | componente, estado, bundle, CSS, React, Vue, Angular, WCAG | Sonnet |
| `claude-agent-sdk` | agente, subagente, hook, SDK, autonomo, tool_use | Opus |
| `managed-agents-specialist` | agente gestionado, tools Anthropic, loop de agente | Sonnet |
| `ai-integrations` | LLM, streaming, fallback, proveedor, costos, token | Sonnet |
| `prompt-engineer` | prompt, few-shot, system message, chain-of-thought, versionado | Sonnet |
| `mcp-server-builder` | MCP, servidor, JSON Schema, stdio, SSE | Sonnet |
| `llm-evals` | eval, benchmark, calidad LLM, golden dataset, metrica | Sonnet |
| `llm-observability` | tracing, dashboard, costo LLM, latencia, Grafana | Sonnet |
| `rag-specialist` | RAG, vector, embedding, retrieval, indexacion | Sonnet |
| `backend-architect` | API, schema, migracion, query, BD, ORM, Knex, SQL | Sonnet |
| `audio-voice-engineer` | voice, audio, streaming, speech, latencia, Gemini live | Sonnet |
| `mobile-engineer` | Flutter, BLoC, Riverpod, Firebase, iOS, Android | Sonnet |
| `release-manager` | release, branching, deploy, CI/CD, rollback, SemVer | Sonnet |
| `qa-engineer` | test, jest, pytest, vitest, cobertura, contract testing | Sonnet |
| `security-auditor` | seguridad, CVE, OWASP, secreto, password, compliance | Sonnet |
| `devops-infra` | Kubernetes, IaC, Terraform, Docker, networking | Sonnet |
| `data-engineer` | pipeline, dbt, Medallion, airflow, dagster, linaje | Sonnet |
| `ai-guardrails` | guardrail, filtro, input validation, jailbreak | Sonnet |
| `attack-surface-analyst` | superficie, exposicion, credencial, subdominio | Sonnet |
| `aiops-engineer` | auditoria, skill, ai-core, Anthropic changelog | Sonnet |

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

`README.md` = instalacion, arquitectura y uso. `CLAUDE.md` = sistema operativo completo (22 reglas, triada, 20 skills, tablas de enrutamiento, politicas de escalamiento).

---

## Licencia

**MIT License.** Usa, modifica y distribuye libremente en proyectos comerciales. Autoria permanece en historial git.

**Enterprise/Consultoría:** Contacta a salvex93@gmail.com para configuracion privada o asesoria tecnica.
