# AI-CORE: Nexus Multi-Agente Universal

`ai-core` es un nucleo de configuracion y comportamiento para agentes IA que se incorpora a cualquier repositorio como submódulo Git. Su funcion es inyectar un conjunto de 14 reglas globales inmutables y 8 perfiles de comportamiento tecnico especializados (skills) sin acoplar su logica al stack del proyecto anfitrion.

El sistema es framework-agnostic por diseño. No asume Node.js, Python, Go ni ningun otro lenguaje. Cada agente lee los manifiestos del repositorio anfitrion (`package.json`, `requirements.txt`, `go.mod`, etc.) al activarse y adapta sus recomendaciones al entorno real del proyecto, sin configuracion adicional.

---

## Cómo usar este AI-CORE en cualquier proyecto

Estos pasos aplican a cualquier repositorio, independientemente del stack tecnologico.

### Paso 1 — Ir al repositorio anfitrion

```bash
cd /ruta/a/tu-proyecto
```

### Paso 2 — Agregar ai-core como submódulo Git

```bash
git submodule add https://github.com/salvex93/ai-core .claude/ai-core
git submodule update --init --recursive
```

Esto crea la carpeta `.claude/ai-core/` en la raiz del proyecto. El agente detecta el `CLAUDE.md` del nucleo automaticamente al iniciarse en el repositorio anfitrion y carga las 14 reglas globales y los perfiles disponibles.

Para mantener el nucleo actualizado en el futuro:

```bash
git submodule update --remote .claude/ai-core
git add .claude/ai-core
git commit -m "chore: actualizar ai-core a la ultima version del nucleo"
```

### Paso 3 — Copiar la plantilla del BACKLOG.md al proyecto anfitrion

Crear el archivo `BACKLOG.md` en la raiz del proyecto anfitrion con la siguiente estructura exacta. Esta tabla de 12 columnas es inmutable: no agregar ni quitar columnas.

```bash
cat > BACKLOG.md << 'EOF'
# BACKLOG — [nombre-del-proyecto]

Este archivo registra hallazgos de auditorias, deuda tecnica detectada y estados de infraestructura. Uso OBLIGATORIO de tabla Markdown con las siguientes columnas exactas.

| #Tarea | Notas reunión | cTipo | Descripción | Responsable | Fecha inicio (Real) | Fecha Fin (Real) | Estatus | Jerarquía | Estimación | Planner | Compromiso |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | N/A | [Tipo] | [Descripcion de la primera tarea] | [Responsable] | [YYYY-MM-DD] | Pendiente | Pendiente | [Alta/Media/Baja] | [Xh] | N/A | [Core/Sprint/etc] |
EOF
```

Valores validos para `cTipo`: `Feat`, `Fix`, `Infra`, `Refactor`, `Docs`, `Test`, `Chore`.
Valores validos para `Estatus`: `Pendiente`, `En Progreso`, `Bloqueado`, `Terminado`.

### Paso 4 — Ejecutar la CLI de Claude en el proyecto anfitrion

```bash
# Desde la raiz del proyecto anfitrion
claude
```

El agente hereda automaticamente las reglas globales del `CLAUDE.md` del nucleo. No se requiere configuracion adicional. La primera accion del agente al iniciarse es leer los manifiestos del proyecto para deducir el stack.

---

## Flujo de Trabajo y Memoria

El sistema utiliza dos mecanismos de memoria con roles distintos y complementarios.

### Memoria Interna (Local) — BACKLOG.md

**Uso obligatorio.** El `BACKLOG.md` es el artefacto de persistencia de contexto entre sesiones. Los agentes IA no tienen memoria entre conversaciones: todo hallazgo, decision arquitectonica o tarea detectada que no se registre en el repositorio se pierde al cerrar la sesion.

Por que `BACKLOG.md` y no un sistema de tickets externo:

- Vive en el repositorio y es versionado por Git.
- Cualquier agente puede leerlo en una sesion futura sin integraciones adicionales.
- No depende de Jira, Linear, GitHub Issues ni ninguna herramienta de terceros.

**Protocolo de cierre de tarea:** Al indicar al agente "ejecuta el cierre de tarea", buscara la tarea activa en la tabla y cambiara su `Estatus` a `Terminado`.

**Trabajo oculto:** Todo esfuerzo tecnico no visibilizado en la instruccion original (middlewares, scripts, configuraciones de entorno) se registra obligatoriamente como nueva fila en la tabla, garantizando trazabilidad completa del trabajo real ejecutado.

Esta disciplina esta codificada como la Regla 7 del nucleo y no puede omitirse.

### Memoria Externa (NotebookLM / Brain-Sync) — OPCIONAL

**No es un requisito para operar.** El proyecto anfitrion puede arrancar y funcionar completamente sin esta configuracion.

La memoria externa resuelve un problema distinto: la documentacion tecnica de referencia (especificaciones de API de terceros, RFCs, arquitecturas de decision) no pertenece al repositorio. Incorporarla como Markdown genera ruido y copias desactualizadas.

Si se desea activar la memoria externa:

1. Crear un notebook en NotebookLM (https://notebooklm.google.com) y copiar su ID desde la URL.
2. Agregar la variable al archivo `.env` del proyecto anfitrion:

```bash
NOTEBOOKLM_WORKSPACE_ID=<id-copiado-desde-la-url>
```

3. Agregar `.env` al `.gitignore` del proyecto anfitrion:

```bash
echo ".env" >> .gitignore
```

Con la variable presente, el skill `especialista-rag` la detecta automaticamente y puede inyectar fragmentos de documentacion externa al contexto activo via MCP, sin que el desarrollador intervenga manualmente.

Sin la variable, el agente opera en modo local con plena capacidad. La memoria externa es una mejora opcional, no una dependencia.

---

## Skills Agnosticos

El desarrollador no necesita configurar ni declarar el stack tecnologico del proyecto. Los agentes aplican el protocolo de Lazy Context (Regla 3) al activarse: leen los manifiestos de dependencias disponibles y adaptan sus recomendaciones al entorno real.

Manifiestos que el agente lee automaticamente:

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

**arquitecto-backend**
Gobierna arquitectura de servidor, persistencia y APIs. Se adapta a cualquier lenguaje y ORM del anfitrion. Cubre SOLID, Clean Architecture, migraciones, consultas N+1, transacciones y seguridad en la capa de servidor.
Activar al: disenar APIs, modelar esquemas, escribir migraciones, revisar queries o evaluar seguridad de servidor.

**tech-lead-frontend**
Gobierna arquitectura de componentes, estado y bundle. Agnostico al framework visual. Aplica Atomic Design, WCAG AA y Mobile First de forma preventiva al abrir cualquier archivo de interfaz.
Activar al: disenar componentes, gestionar estado, optimizar bundle o definir el contrato con la API.

**release-manager**
Gestiona el ciclo de vida completo de entregas. Universal a cualquier plataforma de CI/CD. Cubre versionado semantico, branching, pipelines, resolucion de conflictos y planes de rollback.
Activar al: planificar releases, gestionar ramas, configurar pipelines o coordinar despliegues.

**especialista-rag**
Orquestador de contexto documental agnostico al motor RAG. Localiza la fuente documental configurada en el anfitrion (`NOTEBOOKLM_WORKSPACE_ID` u otro motor vectorial) e inyecta contexto tecnico externo via MCP o API directa. Opera en modo consultivo si no hay servidor MCP disponible.
Activar al: incorporar documentacion externa, construir pipelines RAG, gestionar colecciones vectoriales o evaluar recuperacion semantica.

**aiops-engineer**
Agente de mantenimiento del propio nucleo ai-core. Audita la coherencia de los skills, analiza nuevas capacidades del ecosistema Anthropic y propone mejoras. Nunca modifica el nucleo sin confirmacion humana explicita. Las tareas que activan ALERTA_ARQUITECTONICA son candidatas a escalarse a `claude-opus-4-6` con extended thinking para el plan (OPUSPLAN).
Activar al: auditar el estado del ai-core o proponer actualizaciones de skills.

**qa-engineer**
Especialista en estrategia de testing, piramide de calidad y contract testing. Agnostico al framework: deduce la herramienta de los manifiestos del anfitrion (Jest, Pytest, Vitest, Go testing, JUnit, etc.). Cubre piramide de tests, mocks, contract testing inter-servicio y gestion de datos de prueba.
Activar al: definir estrategia de tests, evaluar cobertura, implementar contract testing, diagnosticar regresiones o auditar la calidad de los tests de un PR.

**security-auditor**
Especialista en seguridad de aplicaciones. Cubre auditoria de dependencias por severidad CVE, OWASP Top 10 por capa, modelado de amenazas STRIDE, configuracion de headers HTTP de seguridad (CSP, HSTS, CORS), gestion de secretos y protocolo de remediacion ante secreto expuesto en historial Git. Agnostico al stack.
Activar al: auditar seguridad de una capa, revisar dependencias con CVEs, configurar politicas de seguridad HTTP, detectar secretos hardcodeados o evaluar requisitos de compliance (SOC 2, ISO 27001).

**devops-infra**
Especialista en infraestructura como codigo y observabilidad. Cubre aprovisionamiento con IaC (Terraform, Pulumi, CloudFormation, Helm), Kubernetes con probes y resources obligatorios, gestion de secretos en contenedores (External Secrets Operator, Sealed Secrets) y los tres pilares de observabilidad (metricas OpenMetrics, trazas OpenTelemetry, logs estructurados JSON). Agnostico al proveedor de nube.
Activar al: disenar o modificar infraestructura, configurar observabilidad, gestionar secretos en Kubernetes o definir estrategias de despliegue en contenedores.

---

## Reglas Globales — Referencia Rapida

Las 14 reglas son inmutables. Aplican a todos los perfiles sin excepcion. El detalle completo esta en `CLAUDE.md`.

| # | Nombre | Efecto observable |
|---|---|---|
| 1 | Idioma y Tono | Respuestas en español estricto. Rol de Mentor Senior: tecnico y directo. |
| 2 | Restriccion Visual | Sin emojis, iconos ni adornos. Solo texto tecnico y codigo. |
| 3 | Exploracion Dinamica | Lee manifiestos del anfitrion antes de emitir cualquier recomendacion. |
| 4 | Minimo Cambio | No inventa logica no solicitada. Excepciones activas para Reglas 10, 11 y 12. |
| 5 | Precision Quirurgica | Toda modificacion incluye ruta relativa y numero de linea exacto. Comenta el "por que", no el "que". |
| 6 | Gatillo de Escalamiento | Inserta `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]` y se detiene ante tareas de alto impacto. |
| 7 | Persistencia y Trabajo Oculto | Pregunta si registrar hallazgos en BACKLOG.md (tabla 12 columnas). Registra trabajo oculto obligatoriamente. |
| 8 | Git Flow Universal | Ramas aisladas. Conventional Commits. Pipeline verde antes de merge. |
| 9 | Brain-Sync | Con `NOTEBOOKLM_WORKSPACE_ID` presente, activa memoria documental externa via RAG. |
| 10 | UI/UX Pro Max | Atomic Design + micro-interacciones + WCAG AA + Mobile First obligatorios en frontend. |
| 11 | Project Superpower | Auditoria preventiva autonoma. Corrige cuellos de botella al detectarlos, sin esperar reporte. |
| 12 | Everything Claude Code | Actualiza `package.json`, `.env.example` y equivalentes tras cambios que lo requieran. |
| 13 | Duda Activa | Se detiene y pide contexto ante instrucciones ambiguas o con riesgo de romper dependencias. |
| 14 | Eficiencia de Busqueda | Usa `grep`/`find` antes de leer archivos completos para minimizar consumo de tokens. |

---

## Estructura del Repositorio

```
ai-core/
├── CLAUDE.md          Reglas globales (14), skills disponibles, directiva de interrupcion
├── README.md          Este archivo — manual de usuario
├── OPERATIONS.md      Referencia tecnica operativa: filosofia, incorporacion, contribucion
├── BACKLOG.md         Tabla de 12 columnas — deuda tecnica y hallazgos del propio nucleo
└── .claude/
    └── skills/
        ├── arquitecto-backend/    SKILL.md
        ├── tech-lead-frontend/    SKILL.md
        ├── release-manager/       SKILL.md
        ├── especialista-rag/      SKILL.md
        ├── aiops-engineer/        SKILL.md
        ├── qa-engineer/           SKILL.md
        ├── security-auditor/      SKILL.md
        └── devops-infra/          SKILL.md
```

---

## Protocolo de Evolucion (Mantenimiento Autonomo)

El AI-CORE no opera como un proceso en segundo plano (daemon). Para que el sistema evalúe nuevas opciones RAG, actualice skills deprecados o mejore sus propios prompts, debes disparar periodicamente el SOP de Mantenimiento.

Para hacerlo, abre la terminal en el directorio `ai-core` y ejecuta este prompt:

> "Actua como aiops-engineer. Tu tarea es auditar el ecosistema. Verifica el estado del arte de las herramientas MCP. Lee los archivos SKILL.md y propón refactorizaciones en el prompting para hacerlos mas eficientes. Identifica si necesitamos un nuevo skill basado en tendencias actuales."

El agente leera su propio codigo, propondra las mejoras y, tras tu aprobacion, hara el commit automatico.

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
5. Actualizar `CLAUDE.md` y `OPERATIONS.md` con la referencia al nuevo skill.

Todo cambio al nucleo sigue la Regla 8: rama `feature/`, integracion a `develop`, release a `main` via Pull Request con pipeline en verde.

---

*Configuracion tecnica detallada: `CLAUDE.md`*
*Documentacion operativa completa: `OPERATIONS.md`*
