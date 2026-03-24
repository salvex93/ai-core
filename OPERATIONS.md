# OPERATIONS — Documentacion Tecnica Operativa

Referencia tecnica del ecosistema ai-core. Complementa el README con instrucciones de incorporacion, modelo de persistencia y procedimiento de contribucion.

---

## Filosofia de Desarrollo

### Memoria de Contexto: BACKLOG.md como Persistencia Local

Los agentes IA operan por sesion. Cuando una sesion termina, el contexto acumulado durante esa sesion, incluyendo hallazgos de auditoria, deuda tecnica detectada y decisiones arquitectonicas tomadas, se pierde por completo. Esta es una limitacion estructural de los LLMs, no un bug.

La solucion no es tecnica: es disciplina de ingenieria. Todo hallazgo relevante debe materializarse como un artefacto en el repositorio antes de cerrar la sesion. El archivo elegido para esto es `BACKLOG.md`, ubicado en la raiz del proyecto anfitrion.

Por que `BACKLOG.md` y no un sistema de tickets externo:

- Vive en el repositorio. Cualquier agente que abra el proyecto en una sesion futura puede leerlo como parte del contexto de inicializacion.
- Es un artefacto versionado. Git registra cuando se agrego cada hallazgo y quien lo aprobo.
- No requiere infraestructura externa. No depende de Jira, Linear, GitHub Issues ni ninguna herramienta de terceros para existir.
- Es legible por el agente sin integraciones adicionales.

**Formato Inmutable:**
El `BACKLOG.md` no es un documento de texto libre. Opera estrictamente bajo una tabla Markdown de 12 columnas (Tarea, Notas, Tipo, Descripción, Responsable, Fecha Inicio, Fecha Fin, Estatus, Jerarquía, Estimación, Planner, Compromiso). Toda inserción de deuda técnica o trabajo oculto debe respetar esta estructura para asegurar la trazabilidad.

Esta disciplina esta codificada como la Regla 7 del nucleo y es obligatoria para todos los perfiles sin excepcion.

### Configuracion de Brain-Sync

Este protocolo se ejecuta una sola vez por repositorio anfitrion, bajo instruccion explicita del usuario. El comportamiento runtime de Brain-Sync esta definido en la Regla 9 de `CLAUDE.md`.

**Paso 1 — Generar nombre de proyecto.**
Derivar un identificador descriptivo en mayusculas a partir del nombre del directorio raiz del repositorio anfitrion. Formato: `BRAIN-{NOMBRE-DEL-PROYECTO}`. Ejemplo: para un directorio `mi-proyecto`, el nombre es `BRAIN-MI-PROYECTO`.

**Paso 2 — Crear `NOTEBOOK_SETUP.md`.**
Generar el archivo en la raiz del repositorio anfitrion con el siguiente contenido exacto, sustituyendo el nombre de proyecto generado:

```
# Configuracion de Memoria Documental — {NOMBRE-GENERADO}

## Instrucciones

1. Abrir NotebookLM: https://notebooklm.google.com
2. Crear un nuevo notebook con el nombre: {NOMBRE-GENERADO}
3. En la seccion "Fuentes", hacer clic en "Anadir fuente" y pegar la arquitectura inicial del proyecto.
4. Copiar el ID del workspace desde la URL del notebook (cadena alfanumerica al final de la URL).
5. Agregar la siguiente linea al archivo .env del repositorio:

   NOTEBOOKLM_WORKSPACE_ID=<id-copiado>

6. Confirmar al agente que el ID esta disponible para continuar.
```

**Paso 3 — Persistir y hacer commit inicial.**
Cuando el usuario provea el ID:
1. Escribir `NOTEBOOKLM_WORKSPACE_ID=<valor>` en el archivo `.env`.
2. Agregar `.env` al `.gitignore` si no esta presente.
3. Proponer el siguiente commit al usuario para su aprobacion:

```
chore: establecer memoria documental del proyecto

Se configura NOTEBOOKLM_WORKSPACE_ID en .env y se registra el
archivo NOTEBOOK_SETUP.md con las instrucciones de configuracion
del workspace de NotebookLM para este repositorio.
```

El commit no se ejecuta sin confirmacion explicita del usuario.

---

### RAG Externo: NotebookLM como Fuente de Verdad Documental

La documentacion tecnica externa, especificaciones de API de terceros, RFCs, arquitecturas de referencia y documentos de decision, no pertenece al repositorio. Incorporarla como archivos Markdown genera ruido en el contexto y hace que el agente trabaje con copias potencialmente desactualizadas.

La solucion es un pipeline RAG desacoplado del repositorio. La implementacion de referencia del ecosistema del Proyecto Anfitrion usa NotebookLM como motor de recuperacion semantica. El skill `especialista-rag` localiza la variable `NOTEBOOKLM_WORKSPACE_ID` en el `.env` del anfitrion y ejecuta la herramienta MCP correspondiente para inyectar al contexto activo unicamente los fragmentos relevantes para la tarea en curso.

La distincion arquitectonica es clara:

- `BACKLOG.md` gestiona conocimiento generado dentro del proyecto (hallazgos, deuda, decisiones).
- NotebookLM gestiona conocimiento externo al proyecto (documentacion de referencia, especificaciones).

Ambos mecanismos son complementarios. Ninguno reemplaza al otro.

---

## Estructura del Repositorio

```
ai-core/
├── CLAUDE.md                          Reglas globales e indice de skills
├── README.md                          Consola de mando del ecosistema
├── OPERATIONS.md                      Este archivo
├── BACKLOG.md                         Deuda tecnica y hallazgos persistidos
└── .claude/
    └── skills/
        ├── arquitecto-backend/
        │   └── SKILL.md
        ├── tech-lead-frontend/
        │   └── SKILL.md
        ├── release-manager/
        │   └── SKILL.md
        ├── especialista-rag/
        │   └── SKILL.md
        ├── aiops-engineer/
        │   └── SKILL.md
        ├── qa-engineer/
        │   └── SKILL.md
        ├── security-auditor/
        │   └── SKILL.md
        └── devops-infra/
            └── SKILL.md
```

El archivo `CLAUDE.md` es la entrada de lectura obligatoria para cualquier agente que opere en un repositorio que incluya `ai-core` como submodulo.

---

## Incorporacion como Submodulo

Agregar `ai-core` a un repositorio anfitrion:

```bash
git submodule add https://github.com/salvex93/ai-core .claude/ai-core
git submodule update --init --recursive
```

Para mantener el submodulo actualizado con los ultimos cambios del nucleo:

```bash
git submodule update --remote .claude/ai-core
git add .claude/ai-core
git commit -m "chore: actualizar ai-core a la ultima version del nucleo"
```

Una vez incorporado, el agente detecta el `CLAUDE.md` del nucleo automaticamente al iniciarse en el repositorio anfitrion y carga las reglas globales y los perfiles disponibles.

---

## Skills Disponibles

Cada skill define un perfil de comportamiento especializado. El agente activa el perfil correspondiente segun la naturaleza de la tarea.

### arquitecto-backend

Gobierna las decisiones de arquitectura en la capa de servidor, persistencia e integraciones. Agnóstico al stack: deduce el ORM y el motor de base de datos del repositorio anfitrion antes de emitir cualquier recomendacion.

Activar al: disenar APIs, modelar esquemas, escribir migraciones, revisar queries, definir la capa de repositorio o evaluar seguridad en la capa de servidor.

### tech-lead-frontend

Gobierna la arquitectura de componentes, la gestion de estado y la optimizacion del bundle. Agnóstico al framework: deduce el framework visual y el manejador de estado del repositorio anfitrion.

Activar al: disenar arquitectura de componentes, decidir gestion de estado, optimizar el bundle o definir el contrato con la API.

### release-manager

Gobierna el ciclo de vida completo de las entregas: versionado semantico, estrategia de branching, pipelines CI/CD, resolucion de conflictos y planes de rollback. Universal: aplica a cualquier plataforma de CI/CD.

Activar al: planificar releases, gestionar ramas, configurar pipelines, ejecutar despliegues o preparar planes de rollback.

### especialista-rag

Orquestador de contexto documental. Localiza `NOTEBOOKLM_WORKSPACE_ID` en el `.env` del anfitrion e inyecta documentacion tecnica externa al contexto activo via MCP.

Activar al: incorporar documentacion externa, construir pipelines RAG, gestionar colecciones vectoriales o evaluar recuperacion semantica.

### aiops-engineer

Agente de mantenimiento del ecosistema ai-core. Audita periodicamente los skills, analiza nuevas capacidades del ecosistema Anthropic y propone mejoras. Requiere confirmacion humana explicita antes de modificar el nucleo.

Activar al: auditar el estado del ai-core, proponer actualizaciones de skills o incorporar nuevas capacidades de Anthropic.

### qa-engineer

Especialista en estrategia de testing, piramide de calidad y contract testing. Agnostico al framework: deduce la herramienta de los manifiestos del anfitrion (Jest, Pytest, Vitest, Go testing, JUnit, etc.). Cubre piramide de tests, mocks, gestion de datos de prueba, cobertura por capa y contract testing inter-servicio.

Activar al: definir estrategia de tests, evaluar cobertura, implementar contract testing, diagnosticar regresiones o auditar la calidad de los tests de un PR.

### security-auditor

Especialista en seguridad de aplicaciones. Cubre auditoria de dependencias (CVEs), modelado de amenazas (STRIDE), configuracion de headers de seguridad, gestion de secretos, revision OWASP Top 10 por capa y cumplimiento de requisitos de compliance. Agnostico al stack.

Activar al: auditar seguridad de una capa, revisar dependencias con CVEs, configurar politicas de CORS/CSP/HSTS, detectar secretos hardcodeados o evaluar requisitos de compliance.

### devops-infra

Especialista en infraestructura como codigo y observabilidad. Cubre aprovisionamiento con IaC (Terraform, Pulumi, CloudFormation, Helm), gestion de secretos en contenedores, networking de servicios y configuracion de observabilidad (OpenTelemetry, Prometheus, Grafana). Agnostico al proveedor de nube.

Activar al: disenar o modificar infraestructura, configurar observabilidad, gestionar secretos en Kubernetes o definir la estrategia de despliegue en contenedores.

---

## Reglas Globales — Resumen

Las reglas globales son inmutables y aplican a todos los perfiles sin excepcion. El detalle completo esta en `CLAUDE.md`.

| Regla | Nombre | Descripcion |
|-------|--------|-------------|
| 1 | Idioma y Tono | Español estricto. Rol de Mentor Senior: tecnico, directo, sin adorno. |
| 2 | Restriccion Visual | Prohibido emojis, iconos o adornos visuales. Solo texto tecnico y codigo. |
| 3 | Exploracion Dinamica | Leer manifiestos del anfitrion antes de emitir cualquier recomendacion. |
| 4 | Minimo Cambio y Proactividad Selectiva | Sin logica no solicitada en backend/negocio. Excepciones activas para Reglas 10, 11 y 12. |
| 5 | Precision Quirurgica | Toda modificacion indica ruta relativa y numero de linea exacto. |
| 6 | Gatillo de Escalamiento | ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN ante tareas de alto impacto. |
| 7 | Persistencia de Hallazgos y Trabajo Oculto | Preguntar si registrar hallazgos en BACKLOG.md (tabla 12 columnas). Registrar trabajo oculto obligatoriamente. |
| 8 | Git Flow Universal | Ramas aisladas. Conventional Commits. Pipeline verde antes de merge. Gatillo de sincronizacion disponible. |
| 9 | Brain-Sync | Sin NOTEBOOKLM_WORKSPACE_ID, activar protocolo de configuracion de memoria. |
| 10 | UI/UX Pro Max | Atomic Design + micro-interacciones + WCAG AA + Mobile First obligatorios en frontend. |
| 11 | Project Superpower | Auditoria preventiva autonoma. Fix inmediato de cuellos de botella al abrir archivo. |
| 12 | Everything Claude Code | Actualizar package.json y .env.example de inmediato tras cambios que lo requieran. |
| 13 | Duda Activa | Detenerse y pedir contexto ante instrucciones ambiguas o con riesgo de romper dependencias. |
| 14 | Eficiencia de Busqueda | Usar grep/find para localizar referencias antes de leer archivos completos. Minimiza consumo de tokens. |

---

## Como Contribuir

Para agregar un skill nuevo al ecosistema:

1. Crear la carpeta `.claude/skills/{nombre-en-kebab-case}/`.
2. Crear `SKILL.md` con el frontmatter obligatorio: `name`, `description`, `origin: ai-core`.
3. Incluir las secciones obligatorias:
   - "Cuando Activar Este Perfil"
   - "Primera Accion al Activar" (protocolo de Lazy Context especifico del perfil)
   - "Directiva de Interrupcion" con condiciones especificas
   - "Restricciones del Perfil" (heredadas de las Reglas Globales, con adiciones especificas)
4. No sobreescribir ninguna Regla Global.
5. Actualizar `CLAUDE.md` con la referencia al nuevo skill en la seccion "Skills Disponibles".
6. Actualizar `OPERATIONS.md` con la descripcion del nuevo skill en la seccion "Skills Disponibles".

Todo cambio al nucleo sigue el Git Flow definido en la Regla 8: rama `feature/`, integracion a `develop`, release a `main` via Pull Request con pipeline en verde.
