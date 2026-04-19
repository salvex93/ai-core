# AI-CORE: Nucleo Multi-Agente Universal

`ai-core` es un nucleo de configuracion y comportamiento para agentes IA que se incorpora a cualquier repositorio como submódulo Git. Inyecta reglas globales inmutables y perfiles de comportamiento tecnico especializados (skills) sin acoplar su logica al stack del proyecto anfitrion. La lista autoritativa de reglas y skills esta en `CLAUDE.md`.

El sistema es framework-agnostic por diseño. No asume Node.js, Python, Go ni ningun otro lenguaje. Cada agente lee los manifiestos del repositorio anfitrion (`package.json`, `requirements.txt`, `go.mod`, etc.) al activarse y adapta sus recomendaciones al entorno real del proyecto.

Desde la version actual, el nucleo incorpora las siguientes capacidades:

- **LLM Routing Bridge** via Gemini 2.5 Flash (free tier): externaliza el analisis de archivos > 500 lineas / 50 KB como proceso separado, protegiendo el context window principal. Requiere solo `GEMINI_API_KEY` (Google AI Studio, gratuito).
- **Extended Thinking en OPUSPLAN**: cuando se activa la directiva `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]`, Opus genera el plan con `thinking: { type: "enabled", budget_tokens: 10000 }`, produciendo razonamiento interno separado del output final y planes cualitativamente superiores a una respuesta directa.
- **Hook de sesion**: script `scripts/init-backlog.js` que garantiza la presencia del `BACKLOG.md` antes de iniciar cualquier sesion de trabajo.

---

## Instalación como Submódulo Git

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

Para proyectos que necesitan sincronizacion inmediata de cambios en `CLAUDE.md` y `.claude/skills/` sin esperar actualizaciones de submodulo, usa symlinks. Este metodo garantiza heredancia fisica de las Reglas Globales — toda la cadena recibe Regla 2 (Sin emojis) y Regla 18 (Brevedad) automaticamente.

**En Windows PowerShell (como Administrador):**

```powershell
# Borrar CLAUDE.md local si existe
Remove-Item './CLAUDE.md' -ErrorAction SilentlyContinue

# Crear symlink a CLAUDE.md del nucleo
New-Item -ItemType SymbolicLink -Path './CLAUDE.md' -Target 'C:/Users/arimac/Documents/Proyectos - MarIA/ai-core/CLAUDE.md' -Force

# Crear symlink a la carpeta de skills del nucleo
New-Item -ItemType SymbolicLink -Path './.claude/skills' -Target 'C:/Users/arimac/Documents/Proyectos - MarIA/ai-core/.claude/skills' -Force

# Crear symlink a settings.json del nucleo
New-Item -ItemType SymbolicLink -Path './.claude/settings.json' -Target 'C:/Users/arimac/Documents/Proyectos - MarIA/ai-core/.claude/settings.json' -Force
```

Si alguno de los comandos falla con permiso denegado:
- Ejecutar PowerShell **como Administrador**.
- En Windows 11, activar `Developer Mode` en Settings > Developer para permitir symlinks sin permisos elevados en futuras sesiones.

**En Linux/Mac:**

```bash
rm -f ./CLAUDE.md
ln -s /ruta/a/ai-core/CLAUDE.md ./CLAUDE.md

rm -rf ./.claude/skills
ln -s /ruta/a/ai-core/.claude/skills ./.claude/skills

ln -s /ruta/a/ai-core/.claude/settings.json ./.claude/settings.json
```

**Cuando Usar Symlinks vs Submodulos:**

| Criterio | Symlinks | Submodulos |
|---|---|---|
| Equipos multiples trabajando con ai-core | Recomendado | Alternativa |
| Desarrollo centralizado del nucleo | Recomendado | No recomendado |
| Distribucion a terceros (GitHub) | No recomendado | Recomendado |
| Frecuencia de cambio en CLAUDE.md | Alta (varias veces/semana) | Baja (varias veces/mes) |
| Sincronizacion tipo "fire and forget" | Si | No |

### Paso 2 — Instalar dependencias del nucleo

El nucleo incluye el servidor MCP (`scripts/mcp-gemini.js`) y el script CLI de respaldo (`scripts/gemini-bridge.js`), ambos requieren una dependencia:

```bash
cd .claude/ai-core
npm install
cd ../..
```

Dependencia instalada: `@google/generative-ai` (Gemini 2.5 Flash, free tier).

### Paso 3 — Configurar el Gemini Bridge

El LLM Routing Bridge requiere una clave de API de Google (gratuita) para operar. Hay dos formas de configurarla.

#### Opcion A — Variables de entorno (recomendado para proyectos locales)

Agregar al archivo `.env` del proyecto anfitrion:

```bash
# LLM Routing Bridge — Gemini 2.5 Flash (free tier, 1500 req/dia, 1M tokens/req).
# Obtener en: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=<tu-api-key>
```

Agregar `.env` al `.gitignore` del proyecto anfitrion:

```bash
echo ".env" >> .gitignore
```

#### Opcion B — Configuracion global `.claude.json` (recomendado para produccion)

Para reutilizar la misma clave de API en multiples proyectos sin duplicar `.env`, configurar a nivel global en el directorio home del usuario.

**Paso 1: Obtener la clave de API**

Visitar https://aistudio.google.com/app/apikey y crear una nueva clave en la consola de Google AI Studio (gratuito, sin tarjeta de credito requerida).

**Paso 2: Crear o editar `~/.claude.json` (Linux/Mac) o `%USERPROFILE%\.claude.json` (Windows)**

Estructura minima:

```json
{
  "gemini-bridge": {
    "api_key": "tu-clave-de-api-aqui"
  }
}
```

O si ya existe el archivo con otra configuracion:

```json
{
  "model": "claude-sonnet-4-6",
  "gemini-bridge": {
    "api_key": "tu-clave-de-api-aqui"
  }
}
```

**Paso 3: Verificar conectividad**

```bash
node .claude/ai-core/scripts/gemini-bridge.js --mission "test" --file README.md --format json
```

Respuesta esperada: un JSON con `resumen`, `hallazgos_clave` y `metadatos`. Si hay error de autenticacion, revisar que la clave este copiada exactamente sin espacios en blanco.

**Precedencia de configuracion**

El agente busca `GEMINI_API_KEY` en este orden:
1. Variable de entorno `.env` del proyecto anfitrion.
2. Archivo global `~/.claude.json` del usuario (Opcion B).
3. Si ningun origen configura la clave → modo degradado: grep/find en el contexto principal sin delegacion al bridge.

Sin esta configuracion, el nucleo opera en modo local (grep/find) con plena capacidad para tareas de busqueda de texto. El Bridge es opcional pero recomendado para proyectos con corpus de codigo extenso (Regla 9).

### Paso 4 — Configurar el hook de sesion

El script `scripts/init-backlog.js` garantiza que el `BACKLOG.md` de 12 columnas exista en la raiz del proyecto anfitrion antes de iniciar la sesion. Sin el `BACKLOG.md`, los hallazgos de la sesion se pierden al cerrarla (Regla 7).

Claude Code no dispone de un evento `SessionStart` nativo. Hay dos alternativas para ejecutar el script automaticamente:

**Opcion A — Hook en `.claude/settings.json` del proyecto anfitrion (recomendado):**

Crear o editar `.claude/settings.json` en la raiz del proyecto anfitrion con el siguiente contenido:

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
          }
        ]
      }
    ]
  }
}
```

El evento `Stop` se dispara al finalizar cada respuesta del agente. El script detecta si el `BACKLOG.md` ya existe y no lo sobreescribe, por lo que la ejecucion repetida es inocua.

**Opcion B — Shell profile:**

Agregar al `.bashrc` o `.zshrc` del sistema:

```bash
alias claude-start='node .claude/ai-core/scripts/init-backlog.js && claude'
```

Usar `claude-start` en lugar de `claude` al iniciar sesiones de trabajo en proyectos con el nucleo incorporado.

**Opcion C — Ejecucion manual antes de cada sesion:**

```bash
node .claude/ai-core/scripts/init-backlog.js
claude
```

### Paso 5 — Iniciar Claude Code

```bash
claude
```

El agente hereda automaticamente las reglas globales del `CLAUDE.md` del nucleo. La primera accion autonoma es leer los manifiestos del proyecto para deducir el stack (Regla 3).

---

---

## Protocolo Gemini Bridge: Análisis Delegado de Contenido Extenso

El LLM Routing Bridge es el mecanismo de analisis documental masivo del nucleo. Externaliza lecturas de archivos grandes como proceso separado a traves de `TO_GEMINI.md`. Esta es una politica de COSTO, no de capacidad: cargar corpus extensos en el contexto principal consume tokens de entrada facturables y degrada la calidad de respuesta en el resto de la sesion.

### Cuando usar TO_GEMINI.md (Regla 2 del Bridge)

Si el agente genera `.claude/TO_GEMINI.md`, significa que:
- El archivo analizado excede 500 lineas o 50 KB.
- El contexto disponible es insuficiente para procesar el contenido completo sin degradacion.
- La tarea requiere extraccion de patrones, analisis de dependencias o sintesis extensas.

**Instrucciones de uso:**

1. El archivo `.claude/TO_GEMINI.md` contiene la mision tecnica formateada para Gemini.
2. Abre https://gemini.google.com (free tier, sin login requerido).
3. Pega el contenido completo de `TO_GEMINI.md` en la interfaz.
4. Gemini procesa el contenido masivo y retorna hallazgos clave.
5. Copia los hallazgos de vuelta al agente en la siguiente sesion para continuacion.

**Ventajas:**
- Protege el context window principal de saturacion.
- Usa quota gratuita de Gemini 2.5 Flash (1.5M tokens/dia).
- El agente se mantiene disponible para tareas simultáneas.

---

## Tabla de Comandos Sentinel — CLI del Nucleo

Los scripts del nucleo extienden la capacidad del agente para automatizar tareas recurrentes de mantenimiento y analisis. Estos comandos se ejecutan desde la raiz del proyecto anfitrion o dentro de `.claude/ai-core/`.

| Comando | Ruta | Propósito | Uso |
|---|---|---|---|
| `generate-map` | `./.claude/ai-core/scripts/generate-map.js` | Regenera `CONTEXT_MAP.json` (índice de archivos y relaciones) para optimizar Lazy Context. | `node .claude/ai-core/scripts/generate-map.js` |
| `detox` | `./.claude/ai-core/scripts/detox.js` | Limpia archivos legacy (.md reportes v2.4/v2.5) que contaminan la memoria del agente. | `node .claude/ai-core/scripts/detox.js` |
| `gemini-bridge` (CLI) | `./.claude/ai-core/scripts/gemini-bridge.js` | Analiza archivos extensos via Gemini sin cargar en contexto principal. Retorna JSON o Markdown. | `node .claude/ai-core/scripts/gemini-bridge.js --mission "Analiza patrones" --file path.ts --format json` |
| `init-backlog` | `./.claude/ai-core/scripts/init-backlog.js` | Crea `BACKLOG.md` (tabla 12 columnas) si no existe. Garantiza persistencia de hallazgos entre sesiones. | `node .claude/ai-core/scripts/init-backlog.js` |
| `query-backlog` | `./.claude/ai-core/scripts/query-backlog.js` | Filtra tareas activas en `BACKLOG.md` sin cargar el archivo completo. Optimizado para Regla 14 (Eficiencia de Busqueda). | `node .claude/ai-core/scripts/query-backlog.js --status "En Progreso"` |

**Recomendacion:** Ejecutar `detox` después de cada actualización del nucleo para eliminar reportes legacy y mantener el contexto limpio.

---

## LLM Routing Bridge

El LLM Routing Bridge es el mecanismo de analisis documental masivo del nucleo. Externaliza lecturas de archivos grandes como proceso separado. Esta es una politica de COSTO, no de capacidad: cargar corpus extensos en el contexto principal consume tokens de entrada facturables y degrada la calidad de respuesta en el resto de la sesion.

### Politica de delegacion

El bridge es una politica de COSTO, no de capacidad: cargar corpus extensos en el contexto principal consume el presupuesto de tokens de la sesion y degrada la calidad de respuesta. Gemini 2.5 Flash (free tier, 1500 req/dia, ventana de 1M tokens) cubre todos los casos de uso del bridge sin costo adicional.

### Cuando se activa (automatico por Regla 9)

- El archivo a analizar supera 500 lineas o 50 KB.
- La tarea requiere leer multiples documentos externos o archivos de codigo de forma simultanea.
- El analisis demandaria mas del 30% del context window disponible.
- La tarea requiere extraer firmas, clases o mapas de dependencias de un modulo de codigo local (modo Obrero de Lectura).

### Uso directo

La interfaz primaria es via herramientas MCP (activadas automaticamente por el agente segun Regla 9):

- `analizar_archivo(ruta, mision)` — detecta umbral y delega a Gemini si supera 500 lineas / 50 KB
- `analizar_contenido(contenido, mision)` — para texto ya cargado en memoria

Como respaldo CLI (sin servidor MCP activo):

```bash
# Analisis con salida JSON
node .claude/ai-core/scripts/gemini-bridge.js \
  --mission "Analiza el archivo e identifica patrones de acoplamiento entre modulos" \
  --file ./src/services/user.service.ts \
  --format json

# Analisis con salida Markdown
node .claude/ai-core/scripts/gemini-bridge.js \
  --mission "Extrae todos los endpoints documentados y sus contratos de entrada/salida" \
  --file ./docs/api-reference.md \
  --format markdown
```

### Schema de salida JSON (estandar)

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

El skill `rag-specialist` actua como Gestor de Misiones: redacta las ordenes de mision con precision y puede ampliar el schema segun la tarea especifica (ver `.claude/skills/rag-specialist/SKILL.md`).

---

## Orquestacion Hibrida: Enrutamiento de Modelos + Auto-Routing de Skills

El nucleo implementa un sistema de orquestacion en tres capas: seleccion de modelo (Haiku/Sonnet/Opus), dispatch automatico de skills segun dominio, y delegacion de analisis masivo via Gemini Bridge.

### Capa 1: Triada de Ejecucion (Enrutamiento de Modelos)

| Capa | Modelo | Rol | Activacion | Capacidades Abril 2026 |
|---|---|---|---|---|
| Gatekeeper | `claude-haiku-4-5` | Decisiones rapidas: lectura de manifiestos, CRUD, busquedas grep, documentacion | Default para tareas triviales | Base |
| Ejecutor principal | `claude-sonnet-4-6` | 80% de las tareas complejas: codigo, refactor, review, debug, tests, logica multi-archivo | Default para tareas sustanciales | Prompt Caching GA, Token-efficient tools GA |
| Arquitecto (Adaptive) | `claude-opus-4-7` + Adaptive Thinking | Agentes multi-paso con razonamiento adaptativo por paso; presupuesto de tokens flexible; vision 98.5% acuidad (3.75MP); cybersecurity safeguards nativos. OPUSPLAN con reasoning dynamico | Escalamiento explicito via Regla 6 | **NUEVO Abril 2026**: `task_budgets` (presupuesto adaptativo per-step), `effort` levels (low/high/xhigh), vision mejorada, compliance nativa |
| Arquitecto (Reasoning) | `claude-opus-4-6` + Extended Thinking | Planes de arquitectura de maxima complejidad (OPUSPLAN legacy) con razonamiento intenso; context window 200K | Escalamiento explicito (legacy) | Extended Thinking (razonamiento pre-OPUSPLAN) |
| Razonador (Gemini) | `gemini-3.1-flash-live` | Voice AI real-time, audio-to-audio con latencia submilisegundo, thinking_level dinamico ("auto"/"enabled"/"disabled") | Audio streaming, conversational interfaces | **NUEVO Abril 2026**: `thinking_level` (dynamic reasoning), audio nativo, gemini-embedding-2-preview (multimodal: texto+imagen+video+audio+PDF en una llamada) |

Politica de escalamiento: Haiku por defecto. Escalar a Sonnet solo si la tarea requiere razonamiento sobre multiples archivos, cambios arquitectonicos, o coordinacion de servicios. Sonnet requiere justificacion tecnica de una linea: `[ESCALAMIENTO MOTIVADO POR: <razon>]`. Escalar a Opus solo tras `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]` con Extended Thinking activado.

### Capa 2: Auto-Routing de Skills (Regla 20)

El agente mapea automaticamente el dominio tecnico de la solicitud contra una tabla de 19 skills especializados. La invocacion es zero-shot: no requiere instruccion explicita del usuario. Confidence > 85% = activacion inmediata.

| Dominio | Skill | Comando | Activacion |
|---|---|---|---|
| Componentes, estado, bundle, API frontend | `tech-lead-frontend` | `/skill tech-lead-frontend` | Arquitectura de componentes, estado, bundle |
| Agentes autonomos, subagentes, hooks, MCP SDK | `claude-agent-sdk` | `/skill claude-agent-sdk` | Construir agentes con Anthropic SDK |
| Agentes gestionados, herramientas integradas, loops | `managed-agents-specialist` | `/skill managed-agents-specialist` | Agentes con built-in tools, control loops |
| LLM, costos, streaming, fallback, proveedores | `ai-integrations` | `/skill ai-integrations` | Integrar LLM, manejo de costos, fallbacks |
| System prompts, few-shot, output estructurado | `prompt-engineer` | `/skill prompt-engineer` | Versionado de prompts, optimizacion |
| Servidor MCP, herramientas JSON Schema, stdio/SSE | `mcp-server-builder` | `/skill mcp-server-builder` | Crear nuevas herramientas MCP |
| Evals, calidad RAG, comparacion de prompts, gate CI/CD | `llm-evals` | `/skill llm-evals` | Golden datasets, metricas de calidad LLM |
| Tracing LLM, dashboards, alertas | `llm-observability` | `/skill llm-observability` | Observabilidad de costos y latencia |
| Analisis documental, RAG, vectores, bridge | `rag-specialist` | `/skill rag-specialist` | Pipelines RAG, embedding, recuperacion |
| APIs, esquemas, migraciones, queries | `backend-architect` | `/skill backend-architect` | Persistencia, SOLID, Clean Arch, scaffolding |
| Voice AI, audio real-time, Gemini 3.1-flash-live | `audio-voice-engineer` | `/skill audio-voice-engineer` | Streaming audio, conversational voice interfaces |
| Flutter, BLoC/Riverpod, Firebase, builds | `mobile-engineer` | `/skill mobile-engineer` | Mobile end-to-end: UI, estado, deploy |
| Releases, branching, CI/CD, despliegues | `release-manager` | `/skill release-manager` | Git Flow, SemVer, rollback, pipelines |
| Tests, cobertura, contract testing | `qa-engineer` | `/skill qa-engineer` | Estrategia de calidad, piramide de tests |
| CVEs, OWASP, headers, secretos | `security-auditor` | `/skill security-auditor` | Compliance, pentest, surface attack |
| IaC, Kubernetes, networking, OTel | `devops-infra` | `/skill devops-infra` | Infraestructura, deployment, observabilidad |
| Pipelines, dbt, Medallion, linaje | `data-engineer` | `/skill data-engineer` | Data architecture, calidad, contratos |
| Proteccion endpoint LLM, filtros I/O | `ai-guardrails` | `/skill ai-guardrails` | Validacion inputs/outputs de LLM |
| Superficie publica, credenciales | `attack-surface-analyst` | `/skill attack-surface-analyst` | Reconocimiento externo, subdominios |
| Auditoria ai-core, actualizacion skills | `aiops-engineer` | `/skill aiops-engineer` | Mantenimiento del nucleo |

Mecanismo de resolucion de conflictos (jerarquia Regla 21): Seguridad > Backend/BD > Arquitectura general. Si una solicitud puede disparar multiples skills, prioridad: security-auditor > backend-architect > devops-infra > release-manager.

### Capa 3: Delegacion de Analisis Masivo (Regla 9)

Archivos > 500 lineas / 50 KB se analizan via Gemini 2.5 Flash sin cargar el contenido completo en contexto:

| Herramienta MCP | Uso |
|---|---|
| `analizar_archivo(ruta, mision)` | Delega a Gemini si supera umbral; retorna sintesis JSON |
| `analizar_contenido(contenido, mision)` | Para texto ya cargado en memoria |
| `analizar_repositorio(ruta_raiz, mision)` | Escanea 11 manifest files, detecta stack |

Circuit Breaker activo: fallo por cuota degradado a grep/find (Regla 14).

### Tabla de decision de enrutamiento (integrada)

| Condicion de la tarea | Accion del agente | Parametros Abril 2026 |
|---|---|---|
| Tarea trivial: lectura, docs, CRUD, busqueda | Haiku (default) | Base |
| Tarea sustancial: codigo, refactor, test, debug | Sonnet (default con justificacion si ambigua) | Prompt Caching: `cache_control: {type: "ephemeral"}` en system prompt; Token-efficient tools activos |
| Archivo o corpus > 500 lineas / 50 KB | Bridge — Gemini 2.5 Flash (decision inmediata, Regla 9) | Soporta 100MB (antes 20MB) con transcodificacion integrada |
| Solicitud mapea a dominio conocido (>85% confidence) | Invocar skill correspondiente (Regla 20) + modelo base | Gemini 3.1-flash-live para Voice AI; Gemini Embedding 2 para RAG multimodal |
| Agente multi-paso con complejidad variable | Opus 4.7 con `task_budgets` (presupuesto adaptativo per-step) | `total_budget`, `per_step_min/max`, `allocation_strategy: "adaptive"` |
| Tarea que activa condicion de escalamiento | `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]` → Opus 4.7 con Adaptive Thinking (Regla 6) | `effort: "high"` o `"xhigh"` segun complejidad; presupuesto de razonamiento en task_budgets |

### Optimizacion del context window — Configuracion global

Los siguientes parametros en `~/.claude/settings.json` controlan el consumo del context window a nivel global (aplican a todas las sesiones):

```json
{
  "model": "claude-sonnet-4-6",
  "env": {
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "50",
    "MAX_THINKING_TOKENS": "10000"
  }
}
```

- **`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: 50`** — Fuerza la compactacion automatica del historial al llegar al 50% del context window. El default del sistema es ~80-90%. Reducirlo a 50 mantiene el contexto util mas agil en sesiones largas.
- **`MAX_THINKING_TOKENS: 10000`** — Limita el adaptive thinking a 10.000 tokens. Sin este limite, el thinking puede consumir hasta 32.000 tokens en tareas complejas sin mejora observable en la calidad de la respuesta para la mayoria de las tareas de desarrollo.

Estos parametros son seguros. No afectan la calidad de respuesta en tareas normales; solo evitan consumo excesivo en edge cases.

### Cuando escalar a Opus manualmente

Las condiciones universales de escalamiento (Regla 6) son:

- La tarea afecta a mas de un servicio con contrato publico compartido.
- La tarea involucra concurrencia, maquinas de estado criticas o FSM con mas de cuatro estados.
- La tarea requiere una migracion de datos irreversible.
- La tarea modifica la capa de autenticacion o autorizacion en cualquier servicio.

Condiciones adicionales estan documentadas en la seccion "Directiva de Interrupcion" de cada skill.

---

## Flujo de Trabajo y Memoria

### Memoria Interna — BACKLOG.md

El `BACKLOG.md` es el artefacto de persistencia de contexto entre sesiones. Todo hallazgo, decision arquitectonica o tarea detectada que no se registre en el repositorio se pierde al cerrar la sesion (Regla 7).

El script `scripts/init-backlog.js` crea el archivo automaticamente si no existe, con la tabla de 12 columnas inmutable:

| #Tarea | Notas / Contexto | cTipo | Descripcion | Responsable | Fecha inicio (Real) | Fecha Fin (Real) | Estatus | Jerarquia | Estimacion | Planner | Compromiso |

Valores validos para `cTipo`: `Feat`, `Fix`, `Infra`, `Refactor`, `Docs`, `Test`, `Chore`.
Valores validos para `Estatus`: `Pendiente`, `En Progreso`, `Bloqueado`, `Terminado`.

Protocolos de la Regla 7:
- "ejecuta el cierre de tarea" — el agente busca la tarea activa y cambia su `Estatus` a `Terminado`.
- Todo esfuerzo tecnico no visibilizado en la instruccion original (scripts, configuraciones de entorno, middlewares) se registra como nueva fila obligatoriamente.

### Memoria Documental — Gemini Bridge

El Gemini Bridge resuelve el caso de documentacion tecnica de referencia externa que no pertenece al repositorio. En lugar de incorporarla como Markdown (copias desactualizadas que saturan el contexto), el bridge la analiza bajo demanda y devuelve solo la sintesis relevante.

---

## Skills Agnosticos

Los agentes leen los manifiestos de dependencias disponibles y adaptan sus recomendaciones al entorno real sin configuracion adicional (Regla 3 — Lazy Context).

| Archivo | Stack detectado |
|---|---|
| `package.json` | Node.js — ORM, framework HTTP, herramientas de build |
| `requirements.txt` / `pyproject.toml` / `Pipfile` | Python — ORM, framework web, dependencias |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `pom.xml` / `build.gradle` | JVM (Java, Kotlin, Scala) |
| `docker-compose.yml` / `Dockerfile` | Motor de base de datos, servicios externos |
| `.env.example` / `.env` | Variables de entorno y configuracion de servicios |

### Skills disponibles

La lista autoritativa de skills con sus descripciones y condiciones de activacion esta en `CLAUDE.md`, seccion "Skills Disponibles". Cada skill reside en `.claude/skills/<nombre>/SKILL.md`.

Para ver los skills activos: `ls .claude/skills/`

#### Manual de Skills — Auto-Activacion por Palabras Clave (Regla 20 + Regla 22)

El agente activa skills automaticamente al detectar dominio tecnico en la solicitud del usuario (zero-shot, sin instruccion explicita). Esta tabla documenta los lexemas que disparan cada skill a confidence > 85%.

| Skill | Palabras Clave de Activacion | Confidence | Auto-Trigger | Ejemplo de Activacion |
|---|---|---|---|---|
| `tech-lead-frontend` | componente, estado, bundle, CSS, styled, Tailwind, React, Vue, Angular, layout, UI, WCAG, accesibilidad | 85%+ | Si | "¿Como estructuro el estado compartido entre componentes?" |
| `claude-agent-sdk` | agente, subagente, hook, SDK, autonomo, decorator, tool_use | 85%+ | Si | "Quiero construir un agente que ejecute multiples herramientas" |
| `managed-agents-specialist` | agente gestionado, tools Anthropic, loop de agente, control agent | 85%+ | Si | "Configura un agente gestionado con herramientas integradas" |
| `ai-integrations` | LLM, modelo, streaming, fallback, proveedor, costos, token counting, presupuesto, budget, task_budgets, adaptive reasoning | 80%+ | Si | "¿Como cambiar entre Claude y otro modelo?" |
| `prompt-engineer` | prompt, few-shot, system message, chain-of-thought, versionado prompt, thinking_level, effort, reasoning dynamico | 85%+ | Si | "Optimiza este prompt de clasificacion" |
| `mcp-server-builder` | MCP, servidor, herramienta, JSON Schema, stdio, SSE | 85%+ | Si | "Quiero crear una nueva herramienta MCP" |
| `llm-evals` | eval, benchmark, calidad LLM, golden dataset, metrica, gate CI/CD | 85%+ | Si | "Diseña un golden dataset para evaluar resumen" |
| `llm-observability` | tracing, observabilidad, dashboard, costo LLM, latencia, Grafana | 85%+ | Si | "¿Como monitoreo el costo total de mis llamadas al LLM?" |
| `rag-specialist` | RAG, vector, embedding, retrieval, documento, indexacion | 85%+ | Si | "Construye un pipeline RAG para base de conocimiento" |
| `backend-architect` | API, schema, migracion, query, BD, ORM, Knex, SQL, Prisma | 90%+ | Si | "Diseña el schema para entidades de usuario y permisos" |
| `mobile-engineer` | Flutter, BLoC, Riverpod, Firebase, iOS, Android, mobile, build | 85%+ | Si | "¿Como manejo el estado con Riverpod en Flutter?" |
| `release-manager` | release, branching, deploy, CI/CD, rollback, Git Flow, SemVer | 85%+ | Si | "Prepara un release v2.4.0 con plan de rollback" |
| `qa-engineer` | test, jest, pytest, vitest, cobertura, coverage, contract testing | 90%+ | Si | "¿Cual es la cobertura minima para logica critica?" |
| `security-auditor` | seguridad, CVE, OWASP, secreto, password, token, compliance | 95%+ | Si | "Audita este endpoint contra ataques OWASP Top 10" |
| `devops-infra` | Kubernetes, IaC, Terraform, Docker, infraestructura, networking | 85%+ | Si | "Configura Kubernetes para escalar automaticamente por CPU" |
| `data-engineer` | pipeline, dbt, Medallion, airflow, dagster, datos, linaje | 85%+ | Si | "Diseña una capa Silver idempotente en Medallion" |
| `ai-guardrails` | guardrail, filtro, validacion input, output filter, jailbreak | 90%+ | Si | "Implementa filtros contra prompt injection" |
| `attack-surface-analyst` | superficie, exposicion, credencial, subdominio, reconocimiento | 85%+ | Si | "¿Que subdominios y puertos tengo expuestos?" |
| `aiops-engineer` | auditoria, skill, Anthropic, changelog, nueva capacidad, version | 90%+ | Si | "Audita el ai-core para inconsistencias post-update" |

**Mecanismo de activacion**

Cuando escribas una pregunta o instruccion que contiene una palabra clave de esta tabla, el agente:
1. Detecta la palabra clave automaticamente (lexeme-scan, Regla 22).
2. Si confidence > 85%, invoca el skill sin esperar confirmacion.
3. Emite encabezado `[SKILL ACTIVO: <nombre>]` como primer linea de respuesta (transparencia).
4. Procede a responder bajo ese perfil tecnico especializado.

**Ejemplo en vivo**

Usuario: "¿Como particiono una tabla en BigQuery para reducir costos?"
→ Agente detecta "particiono", "BigQuery", "tabla" = dominio data-engineer
→ Confidence 85%+
→ Invoca automaticamente `/skill data-engineer`
→ Primera linea: `[SKILL ACTIVO: data-engineer]`
→ Responde bajo perfil especializado en arquitectura de datos

---

## Reglas Globales — Referencia Rapida

Las reglas globales son inmutables. Aplican a todos los perfiles sin excepcion. El detalle completo esta en `CLAUDE.md`.

| # | Nombre | Efecto observable |
|---|---|---|
| 1 | Idioma y Tono | Respuestas en español estricto. Rol de Mentor Senior: tecnico y directo. |
| 2 | Restriccion Visual | Sin emojis, iconos ni adornos. Solo texto tecnico y codigo. |
| 3 | Exploracion Dinamica | Lee manifiestos del anfitrion antes de emitir cualquier recomendacion. |
| 4 | Minimo Cambio | No inventa logica no solicitada. Excepciones activas para Reglas 10, 11 y 12. |
| 5 | Precision Quirurgica | Toda modificacion incluye ruta relativa y numero de linea exacto. Comenta el "por que". |
| 6 | Enrutamiento Dinamico y Escalamiento | Define la triada Sonnet/Opus/Gemini. Escala a Opus bajo `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]`. Delega corpus grandes al Gemini Bridge. |
| 7 | Persistencia y Trabajo Oculto | Registra hallazgos en BACKLOG.md (tabla 12 columnas). Registra trabajo oculto. |
| 8 | Git Flow Universal | Ramas aisladas. Conventional Commits. Pipeline verde antes de merge. |
| 9 | Delegacion de Analisis Masivo | Delega analisis >500 lineas / >50KB via MCP tools `analizar_archivo` / `analizar_contenido` (servidor `gemini-bridge`). Circuit Breaker activo: fallo por cuota degrada a grep/find (Regla 14). |
| 10 | UI/UX Pro Max | Atomic Design + micro-interacciones + WCAG AA + Mobile First obligatorios en frontend. |
| 11 | Project Superpower | Auditoria preventiva autonoma. Corrige cuellos de botella al detectarlos. |
| 12 | Everything Claude Code | Actualiza `package.json`, `.env.example` y equivalentes tras cambios que lo requieran. |
| 13 | Duda Activa | Se detiene y pide contexto ante instrucciones ambiguas con riesgo de romper dependencias. |
| 14 | Eficiencia de Busqueda | Usa `grep`/`find` antes de leer archivos completos para minimizar consumo de tokens. |
| 15 | Documentacion Viva | Toda modificacion del nucleo exige actualizar README.md + `git add` + `git commit` + `git push`. |
| 16 | Higiene de Contexto (Tokenomics) | Protege el presupuesto de tokens. TRIGGER DE COMPACTACION: imprime alerta para ejecutar `/compact` antes de generar codigo masivo tras una fase de investigacion. TRIGGER DE PURGA: imprime alerta para ejecutar `/clear` tras cerrar una tarea en BACKLOG.md. |
| 17 | Versionado Obligatorio de Skills | Toda modificacion de un SKILL.md exige actualizar `version` (semver) y `last_updated` en el frontmatter en el mismo commit. Patch: correcciones. Minor: nuevas secciones. Major: reestructuracion completa. |
| 18 | Brevedad de Respuesta | Sin frases de confirmacion ni resumenes post-tarea. Formato escalonado: linea unica para preguntas, bloque corregido para errores de sintaxis, solo el "por que" para logica compleja. Silencio Positivo como norma. |
| 19 | Disciplina de Sesion | Una sesion = una tarea. Leer memoria antes que archivos al inicio. `/compact` en fronteras de fase investigacion→codigo. `/clear` al cerrar tarea. Guardar hallazgos no triviales en memoria antes del `/clear`. |
| 20 | Dispatcher + Escalamiento Unificado | Mapeo automatico de dominio tecnico a skill especializado (19 disponibles) con confidence > 85%. Invocacion zero-shot sin esperar instruccion explicita. Integra escalamiento a OPUSPLAN y matriz de precedencia: Reglas Globales > Skills, Brevedad (R18) > Extensión, Lazy Context (R3) > Pre-lectura, Minimo Cambio (R4) > Autonomia. |
| 21 | Subordinacion Explicita a Reglas Globales | TODOS LOS SKILLS subordinados a R18 (Brevedad) y R4 (Mínimo Cambio). Ningún skill puede exigir narrativa larga, auto-ejecutarse sin confirmación, o violar Global Rules. |
| 22 | Sensor de Eficiencia | Prevención automática contra gasto perezoso de tokens. Pre-check obligatorio: wc -l antes de Read. Si >300 líneas → abortar lectura directa → invocar `analizar_archivo`. Tareas simples → FORZAR HAIKU. Confidence >85% → auto-trigger skill + [SKILL ACTIVO: <nombre>]. |

---

## Estructura del Repositorio

```
ai-core/
├── CLAUDE.md              Autoridad única: reglas globales, skills, enrutamiento, protocolos
├── README.md              Este archivo — manual de usuario
├── package.json           Dependencias Node.js de los scripts del nucleo
├── .env                   Variables de entorno (GEMINI_API_KEY) — no versionado
├── .env.example           Plantilla de variables de entorno — versionado
├── CONTEXT_MAP.json       Mapeo grafo de archivos (auto-generado). Indice para Lazy Context (Regla 3)
├── scripts/
│   ├── init-backlog.js    Crea BACKLOG.md en proyecto anfitrion si no existe
│   ├── gemini-bridge.js   CLI de respaldo: delega analisis a Gemini y retorna JSON/Markdown
│   ├── mcp-gemini.js      Servidor MCP stdio: expone analizar_archivo y analizar_contenido
│   ├── generate-map.js    Regenera CONTEXT_MAP.json (automatizado pre-push)
│   ├── query-backlog.js   Filtra BACKLOG.md sin cargarlo en contexto
│   └── session-close.js   Persiste last_session.md en memoria (hook Stop)
├── .claude/
│   ├── CONTEXT_MAP.json   Mapeo grafo generado
│   ├── settings.json      Template de hooks (Stop) para proyecto anfitrion
│   ├── bin/
│   │   ├── norm-harness.js    Normaliza entorno, valida symlinks
│   │   ├── norm-harness.ps1   Equivalente PowerShell
│   │   ├── generate-map.js    Genera/actualiza CONTEXT_MAP.json
│   │   ├── detox.js           Limpia archivos legacy (.md reportes v2.4/v2.5)
│   │   └── benchmark-fernet.js Testea cifrado Fernet (PII)
│   └── skills/
│       ├── ai-guardrails/              SKILL.md
│       ├── ai-integrations/            SKILL.md
│       ├── aiops-engineer/             SKILL.md
│       ├── attack-surface-analyst/     SKILL.md
│       ├── audio-voice-engineer/       SKILL.md (NUEVO Abril 2026)
│       ├── backend-architect/          SKILL.md
│       ├── claude-agent-sdk/           SKILL.md
│       ├── managed-agents-specialist/  SKILL.md
│       ├── data-engineer/              SKILL.md
│       ├── devops-infra/               SKILL.md
│       ├── llm-evals/                  SKILL.md
│       ├── llm-observability/          SKILL.md
│       ├── mcp-server-builder/         SKILL.md
│       ├── mobile-engineer/            SKILL.md
│       ├── prompt-engineer/            SKILL.md
│       ├── qa-engineer/                SKILL.md
│       ├── rag-specialist/             SKILL.md
│       ├── release-manager/            SKILL.md
│       ├── security-auditor/           SKILL.md
│       └── tech-lead-frontend/         SKILL.md
```

**Notas de v2.6.2 (Sentinel Protocol)**
- Documentación legacy (CONTRIBUTING.md, OPERATIONS.md, SPONSORING.md) consolidada en CLAUDE.md. Esta es la autoridad única.
- BACKLOG.md es artefacto dinámico del proyecto anfitrion, no del nucleo.
- CONTEXT_MAP.json es mapeo autoridad de estructura (regenerado automaticamente, consulta Regla 3).

---

## Mantenimiento y Evolucion Autonoma

Para que el sistema evalúe nuevas opciones RAG, actualice skills deprecados o mejore sus propios prompts, disparar el SOP de Mantenimiento:

```
/skill aiops-engineer
Tu tarea: audita el ecosistema. Analiza nuevas especificaciones de Anthropic y Gemini. 
Lee los archivos SKILL.md y propón refactorizaciones en prompting para eficiencia. 
Identifica si necesitamos un nuevo skill basado en tendencias actuales.
```

El agente leera su propio codigo, propondra las mejoras y, tras aprobacion, ejecutara el commit automatico (Regla 15).

---

## Como Contribuir: Crear un Nuevo Skill

1. Crear carpeta `.claude/skills/{nombre-en-kebab-case}/`.
2. Crear `SKILL.md` con frontmatter YAML: `name`, `description`, `version`, `last_updated`, `origin: ai-core`.
3. Incluir obligatoriamente:
   - "Cuando Activar Este Perfil"
   - "Primera Accion al Activar" (Lazy Context del skill)
   - "Directiva de Interrupcion" (condiciones y regla literal)
   - "Restricciones del Perfil" (hereda Reglas Globales, puede agregar restricciones)
4. No sobreescribir ninguna Regla Global.
5. Actualizar `CLAUDE.md`, seccion "Skills Disponibles" con entrada en tabla de auto-routing. `README.md` no duplica el indice (Regla 15).
6. Ejecutar `git add . && git commit && git push` (Regla 15 — Documentacion Viva).

---

## Autoridad Unica: CLAUDE.md

Toda la especificacion operativa esta en `CLAUDE.md` desde v2.6.2:

- Reglas Globales (22 reglas inmutables)
- Triada de Ejecucion (Haiku/Sonnet/Opus)
- Auto-routing de Skills (19 especialistas)
- Delegacion via Gemini Bridge
- Tablas de decision de enrutamiento
- Politicas de escalamiento

No hay duplicacion: `README.md` = instalacion y uso; `CLAUDE.md` = sistema completo.

---

## Licencia y Comunidad

**MIT License.** Usa, modifica y distribuye libremente en proyectos comerciales. Autoría permanece en historial git.

**Contribuir:** Si trabajas con Elixir, Flutter, Solidity, Ruby on Rails u otro stack no cubierto, tu skill cierra esa brecha para toda la comunidad. Sigue el proceso "Como Contribuir" arriba.

**Enterprise/Consultoría:** Contacta a salvex93@gmail.com para configuracion privada, asesoria tecnica o formacion especializada.

