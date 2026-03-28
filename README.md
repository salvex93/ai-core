# AI-CORE: Nexus Multi-Agente Universal

`ai-core` es un nucleo de configuracion y comportamiento para agentes IA que se incorpora a cualquier repositorio como submódulo Git. Inyecta reglas globales inmutables y perfiles de comportamiento tecnico especializados (skills) sin acoplar su logica al stack del proyecto anfitrion. La lista autoritativa de reglas y skills esta en `CLAUDE.md`.

El sistema es framework-agnostic por diseño. No asume Node.js, Python, Go ni ningun otro lenguaje. Cada agente lee los manifiestos del repositorio anfitrion (`package.json`, `requirements.txt`, `go.mod`, etc.) al activarse y adapta sus recomendaciones al entorno real del proyecto.

Desde la version actual, el nucleo incorpora las siguientes capacidades:

- **LLM Routing Bridge** con tres optimizaciones de costo: (1) Prompt Caching en Haiku — el bloque de sistema estatico se cachea con `cache_control: ephemeral`, reduciendo el costo de tokens de entrada un 70-90% en cache hits; (2) Token Counting exacto para archivos en zona borderline (400K-800K chars) via `/v1/messages/count_tokens`, evitando overflow y over-routing; (3) Modo batch (`--batch`) que procesa multiples archivos con la Messages Batches API al 50% de descuento.
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

El nucleo incluye scripts Node.js (`scripts/gemini-bridge.js`) que requieren dos dependencias:

```bash
cd .claude/ai-core
npm install
cd ../..
```

Dependencias instaladas: `@anthropic-ai/sdk` (Haiku Nivel 1, Prompt Caching, Token Counting, Batches API) y `@google/generative-ai` (Gemini Nivel 2).

### Paso 3 — Configurar variables de entorno

Agregar al archivo `.env` del proyecto anfitrion:

```bash
# Nivel 1 del router — Claude Haiku (primario, economico, alta disponibilidad).
# Cubre archivos hasta 600K chars (~150K tokens). Es la misma clave que usa Claude Code.
ANTHROPIC_API_KEY=<tu-api-key>

# Nivel 2 del router — Gemini 2.5 Flash (archivos masivos > 600K chars).
# Ventana de 1M tokens. Cuota preservada exclusivamente para corpus masivos.
# Obtener en: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=<tu-api-key>
```

Configuracion recomendada: ambas claves. Minimo viable: solo `ANTHROPIC_API_KEY` (Haiku cubre el 95%+ de los archivos que llegan al bridge).

Agregar `.env` al `.gitignore` del proyecto anfitrion:

```bash
echo ".env" >> .gitignore
```

Sin ninguna de las dos variables, el nucleo opera en modo local (grep/find) con plena capacidad para tareas de busqueda de texto.

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

### Optimizaciones de costo activas

**Prompt Caching (`cache_control: ephemeral`)**
El bloque de sistema del bridge (rol, instrucciones de formato, schema) es identico en cada invocacion. Marcarlo con `cache_control: ephemeral` lo cachea en Anthropic por 5 minutos. En sesiones con multiples llamadas al bridge, los cache hits reducen el costo de tokens de entrada un 70-90% (Anthropic cobra el 10% del precio normal en hits).

**Token Counting exacto para la zona borderline**
Archivos entre 400K y 800K chars se procesan con `/v1/messages/count_tokens` antes de decidir el nivel. Esto evita dos errores: overflow (archivo que no cabe en Haiku y genera error de contexto) y over-routing (archivo que Haiku maneja perfectamente pero se manda a Gemini gastando cuota). Fuera de esta zona, el umbral de chars es suficientemente preciso y no se agrega latencia.

**Modo batch (`--batch`)**
Procesa multiples archivos en una sola llamada a la Messages Batches API de Anthropic con 50% de descuento sobre el precio base. Util al analizar todos los modulos de un monorepo en la misma sesion. Procesamiento asincrono con polling; el CLI espera hasta completar o hasta el timeout de 10 minutos.

### Cuando se activa (automatico por Regla 9)

- El archivo a analizar supera 500 lineas o 50 KB.
- La tarea requiere leer multiples documentos externos o archivos de codigo de forma simultanea.
- El analisis demandaria mas del 30% del context window disponible.
- La tarea requiere extraer firmas, clases o mapas de dependencias de un modulo de codigo local (modo Obrero de Lectura).

### Uso directo

```bash
# Analisis con salida JSON (Haiku Nivel 1, Prompt Cache activo)
node .claude/ai-core/scripts/gemini-bridge.js \
  --mission "Analiza el archivo e identifica patrones de acoplamiento entre modulos" \
  --file ./src/services/user.service.ts \
  --format json

# Analisis con salida Markdown
node .claude/ai-core/scripts/gemini-bridge.js \
  --mission "Extrae todos los endpoints documentados y sus contratos de entrada/salida" \
  --file ./docs/api-reference.md \
  --format markdown

# Modelo Gemini especifico para Nivel 2 (archivos masivos > 600K chars)
node .claude/ai-core/scripts/gemini-bridge.js \
  --mission "Detecta queries N+1 y bloqueos del event loop" \
  --file ./src/repositories/order.repository.js \
  --model gemini-2.5-flash

# Modo batch: multiples archivos, 50% descuento, Batches API
node .claude/ai-core/scripts/gemini-bridge.js \
  --mission "Extrae las firmas publicas y dependencias de cada modulo" \
  --file ./src/services/user.service.ts \
  --file ./src/services/order.service.ts \
  --file ./src/repositories/user.repository.ts \
  --batch \
  --format json
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

El skill `especialista-rag` actua como Gestor de Misiones: redacta las ordenes de mision con precision y puede ampliar el schema segun la tarea especifica (ver `.claude/skills/especialista-rag/SKILL.md`).

---

## Enrutamiento de Modelos y Optimizacion de Tokens

### La triada de ejecucion

El nucleo opera con tres capas de procesamiento con responsabilidades distintas:

| Capa | Modelo | Rol | Activacion |
|---|---|---|---|
| Ejecutor principal | `claude-sonnet-4-6` | 80% de las tareas: codigo, refactor, review, debug, tests | Default en toda sesion |
| Arquitecto | `claude-opus-4-6` + Extended Thinking | Planes de arquitectura de alta complejidad (OPUSPLAN) | Escalamiento explicito via Regla 6 |
| Bridge Nivel 1 | `claude-haiku-4-5-20251001` + Prompt Cache | Analisis de corpus. Archivos hasta 600K chars | Automatico via Regla 9 |
| Bridge Nivel 2 | `gemini-2.5-flash` | Corpus masivos > 600K chars (ventana 1M tokens) | Automatico cuando el archivo supera el limite de Haiku |

### Tabla de decision de enrutamiento

| Condicion de la tarea | Accion del agente |
|---|---|
| Tarea de codigo, refactor, review, test, debug | Sonnet (default) |
| Tarea ambigua o moderadamente compleja | Sonnet + pausa activa (Regla 13) |
| Archivo o corpus > 500 lineas / 50 KB, < 400K chars | Bridge — Haiku Nivel 1 (decision inmediata) |
| Archivo entre 400K y 800K chars | Bridge — Token Counting exacto, luego Haiku o Gemini |
| Archivo > 800K chars | Bridge — Gemini Nivel 2 (decision inmediata) |
| Multiples archivos en la misma sesion | Bridge `--batch` (Batches API, 50% descuento) |
| Tarea que activa condicion de escalamiento | `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]` → Opus con Extended Thinking |

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
| 9 | Brain-Sync (Gemini Bridge) | Delega analisis >500 lineas / >50KB y extraccion estructural de codigo local a `scripts/gemini-bridge.js`. Circuit Breaker activo: fallo por cuota degrada a grep/find (Regla 14). |
| 10 | UI/UX Pro Max | Atomic Design + micro-interacciones + WCAG AA + Mobile First obligatorios en frontend. |
| 11 | Project Superpower | Auditoria preventiva autonoma. Corrige cuellos de botella al detectarlos. |
| 12 | Everything Claude Code | Actualiza `package.json`, `.env.example` y equivalentes tras cambios que lo requieran. |
| 13 | Duda Activa | Se detiene y pide contexto ante instrucciones ambiguas con riesgo de romper dependencias. |
| 14 | Eficiencia de Busqueda | Usa `grep`/`find` antes de leer archivos completos para minimizar consumo de tokens. |
| 15 | Documentacion Viva | Toda modificacion del nucleo exige actualizar README.md + `git add` + `git commit` + `git push`. |
| 16 | Higiene de Contexto (Tokenomics) | Protege el presupuesto de tokens. TRIGGER DE COMPACTACION: imprime alerta para ejecutar `/compact` antes de generar codigo masivo tras una fase de investigacion. TRIGGER DE PURGA: imprime alerta para ejecutar `/clear` tras cerrar una tarea en BACKLOG.md. |
| 17 | Versionado Obligatorio de Skills | Toda modificacion de un SKILL.md exige actualizar `version` (semver) y `last_updated` en el frontmatter en el mismo commit. Patch: correcciones. Minor: nuevas secciones. Major: reestructuracion completa. |

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
│   └── gemini-bridge.js   Delega analisis documental a Gemini y retorna JSON/Markdown
└── .claude/
    ├── settings.json      Template de hook Stop para el proyecto anfitrion
    └── skills/
        ├── ai-guardrails/         SKILL.md
        ├── ai-integrations/       SKILL.md
        ├── aiops-engineer/        SKILL.md
        ├── arquitecto-backend/    SKILL.md
        ├── claude-agent-sdk/      SKILL.md
        ├── data-engineer/         SKILL.md
        ├── devops-infra/          SKILL.md
        ├── especialista-rag/      SKILL.md
        ├── llm-evals/             SKILL.md
        ├── llm-observability/     SKILL.md
        ├── mcp-server-builder/    SKILL.md
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
5. Actualizar `CLAUDE.md`, `README.md` y `OPERATIONS.md` con la referencia al nuevo skill.
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

