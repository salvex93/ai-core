# AI-CORE: Nucleo Multi-Agente Universal

`ai-core` es un nucleo de configuracion y comportamiento para agentes IA que se incorpora a cualquier repositorio como submódulo Git. Inyecta reglas globales inmutables y perfiles de comportamiento tecnico especializados (skills) sin acoplar su logica al stack del proyecto anfitrion. La lista autoritativa de reglas y skills esta en `CLAUDE.md`.

El sistema es framework-agnostic por diseño. No asume Node.js, Python, Go ni ningun otro lenguaje. Cada agente lee los manifiestos del repositorio anfitrion (`package.json`, `requirements.txt`, `go.mod`, etc.) al activarse y adapta sus recomendaciones al entorno real del proyecto.

Desde la version actual, el nucleo incorpora las siguientes capacidades:

- **LLM Routing Bridge** via Gemini 2.5 Flash (free tier): externaliza el analisis de archivos > 500 lineas / 50 KB como proceso separado, protegiendo el context window principal. Requiere solo `GEMINI_API_KEY` (Google AI Studio, gratuito).
- **Extended Thinking en OPUSPLAN**: cuando se activa la directiva `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]`, Opus genera el plan con `thinking: { type: "enabled", budget_tokens: 10000 }`, produciendo razonamiento interno separado del output final y planes cualitativamente superiores a una respuesta directa.
- **Hook de sesion**: script `scripts/init-backlog.js` que garantiza la presencia del `BACKLOG.md` antes de iniciar cualquier sesion de trabajo.

---

## Como usar este AI-CORE en cualquier proyecto

### Paso 1 — Incorporar ai-core como submodulo Git

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

### Paso 2 — Instalar dependencias del nucleo

El nucleo incluye el servidor MCP (`scripts/mcp-gemini.js`) y el script CLI de respaldo (`scripts/gemini-bridge.js`), ambos requieren una dependencia:

```bash
cd .claude/ai-core
npm install
cd ../..
```

Dependencia instalada: `@google/generative-ai` (Gemini 2.5 Flash, free tier).

### Paso 3 — Configurar variables de entorno

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

Sin esta variable, el nucleo opera en modo local (grep/find) con plena capacidad para tareas de busqueda de texto.

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

| Capa | Modelo | Rol | Activacion |
|---|---|---|---|
| Gatekeeper | `claude-haiku-4-5` | Decisiones rapidas: lectura de manifiestos, CRUD, busquedas grep, documentacion | Default para tareas triviales |
| Ejecutor principal | `claude-sonnet-4-6` | 80% de las tareas complejas: codigo, refactor, review, debug, tests, logica multi-archivo | Default para tareas sustanciales |
| Arquitecto | `claude-opus-4-6` + Extended Thinking | Planes de arquitectura de maxima complejidad (OPUSPLAN) | Escalamiento explicito via Regla 6 |

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

| Condicion de la tarea | Accion del agente |
|---|---|
| Tarea trivial: lectura, docs, CRUD, busqueda | Haiku (default) |
| Tarea sustancial: codigo, refactor, test, debug | Sonnet (default con justificacion si ambigua) |
| Archivo o corpus > 500 lineas / 50 KB | Bridge — Gemini 2.5 Flash (decision inmediata, Regla 9) |
| Solicitud mapea a dominio conocido (>85% confidence) | Invocar skill correspondiente (Regla 20) + modelo base |
| Tarea que activa condicion de escalamiento | `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]` → Opus con Extended Thinking (Regla 6) |

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
| 20 | Auto-Routing de Skills (Dispatcher) | Mapeo automatico de dominio tecnico a skill especializado (19 disponibles) con confidence > 85%. Invocacion zero-shot sin esperar instruccion explicita. Resolucion de conflictos: Seguridad > Backend/BD > Arquitectura. |
| 21 | Jerarquia de Anulacion | En conflictos entre Reglas Globales y directivas de skills: Reglas Globales siempre mandan. Precedencia: Brevedad (R18) > Extensión; Lazy Context (R3) > Pre-lectura; Minimo Cambio (R4) > Autonomia; Precision (R5) > Generico; Tokenomics (R16) > Alcance. |

---

## Estructura del Repositorio

```
ai-core/
├── CLAUDE.md          Reglas globales, skills disponibles, directiva de interrupcion
├── README.md          Este archivo — manual de usuario
├── OPERATIONS.md      Referencia tecnica operativa: filosofia, incorporacion, contribucion
├── BACKLOG.md         Tabla de 12 columnas — deuda tecnica y hallazgos del propio nucleo
├── package.json       Dependencias Node.js de los scripts del nucleo
├── .env               Variables de entorno (GEMINI_API_KEY) — no versionado
├── .env.example       Plantilla de variables de entorno — versionado
├── scripts/
│   ├── init-backlog.js    Crea BACKLOG.md en el proyecto anfitrion si no existe
│   ├── gemini-bridge.js   CLI de respaldo: delega analisis a Gemini y retorna JSON/Markdown
│   ├── mcp-gemini.js      Servidor MCP stdio: expone analizar_archivo y analizar_contenido
│   ├── query-backlog.js   Filtra BACKLOG.md sin cargarlo en contexto activo
│   └── session-close.js   Persiste last_session.md en memoria al cierre (hook Stop)
└── .claude/
    ├── settings.json      Template de hook Stop para el proyecto anfitrion
    └── skills/
        ├── ai-guardrails/         SKILL.md
        ├── ai-integrations/       SKILL.md
        ├── aiops-engineer/        SKILL.md
        ├── attack-surface-analyst/ SKILL.md
        ├── backend-architect/     SKILL.md
        ├── claude-agent-sdk/      SKILL.md
        ├── managed-agents-specialist/ SKILL.md
        ├── data-engineer/         SKILL.md
        ├── devops-infra/          SKILL.md
        ├── rag-specialist/      SKILL.md
        ├── llm-evals/             SKILL.md
        ├── llm-observability/     SKILL.md
        ├── mcp-server-builder/    SKILL.md
        ├── mobile-engineer/       SKILL.md
        ├── prompt-engineer/       SKILL.md
        ├── qa-engineer/           SKILL.md
        ├── release-manager/       SKILL.md
        ├── security-auditor/      SKILL.md
        ├── tech-lead-frontend/    SKILL.md
        └── (ver CLAUDE.md para la lista autoritativa de skills activos)
```

---

## Protocolo de Evolucion (Mantenimiento Autonomo)

Para que el sistema evalúe nuevas opciones RAG, actualice skills deprecados o mejore sus propios prompts, disparar el SOP de Mantenimiento:

> "Actua como aiops-engineer. Tu tarea es auditar el ecosistema. Analiza nuevas especificaciones del ecosistema Anthropic y Gemini. Lee los archivos SKILL.md y propón refactorizaciones en el prompting para hacerlos mas eficientes. Identifica si necesitamos un nuevo skill basado en tendencias actuales."

El agente leera su propio codigo, propondra las mejoras y, tras tu aprobacion, ejecutara el commit automatico (Regla 15).

---

## Como Contribuir con un Nuevo Skill

1. Crear la carpeta `.claude/skills/{nombre-en-kebab-case}/`.
2. Crear `SKILL.md` con el frontmatter obligatorio: `name`, `description`, `origin: ai-core`.
3. Incluir las cuatro secciones obligatorias:
   - "Cuando Activar Este Perfil"
   - "Primera Accion al Activar" (protocolo de Lazy Context especifico del perfil)
   - "Directiva de Interrupcion" con condiciones especificas y la directiva literal
   - "Restricciones del Perfil" (hereda las Reglas Globales, puede agregar restricciones especificas)
4. No sobreescribir ninguna Regla Global.
5. Actualizar `CLAUDE.md`, seccion "Skills Disponibles". Esta es la unica accion de documentacion requerida. `README.md` y `OPERATIONS.md` no duplican el indice (Regla 15).
6. Ejecutar `git add . && git commit && git push` (Regla 15).

---

*Configuracion tecnica detallada: `CLAUDE.md`*
*Documentacion operativa completa: `OPERATIONS.md`*

---

## Unete a la Revolucion (Comunidad y Enterprise)

AI-CORE nacio de un problema real: trabajar con LLMs en produccion sin un sistema de reglas es costoso, inconsistente y dificil de mantener. Este nucleo es la solucion sistematizada.

Esta liberado bajo licencia MIT. Puedes usarlo, modificarlo y distribuirlo en proyectos comerciales sin restricciones. La autoría es de salvex93 y permanece en el historial del repositorio.

### Contribuir

La forma mas impactante de contribuir es crear un nuevo skill para tu dominio tecnico. Si trabajas con Elixir, Flutter, Solidity, Ruby on Rails, o cualquier stack que el nucleo no cubre todavia, tu skill cierra esa brecha para toda la comunidad.

La guia completa esta en [CONTRIBUTING.md](CONTRIBUTING.md). Incluye:

- El frontmatter YAML obligatorio con ejemplo funcional.
- Las cuatro secciones que todo `SKILL.md` debe tener.
- Los estandares de codigo y commit que aplican sin excepcion.

### Sponsoring

Si este nucleo te ahorra horas reales a la semana, considera patrocinar el proyecto via GitHub Sponsors. Para equipos y organizaciones que necesitan configuracion privada, consultoría directa o formacion tecnica, las opciones Enterprise estan documentadas en [SPONSORING.md](SPONSORING.md).

