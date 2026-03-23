# ai-core — Nucleo Centralizado de Agentes MarIA

Repositorio de configuracion y perfiles de comportamiento para los agentes IA del ecosistema MarIA. Se incorpora como submódulo Git a cualquier proyecto anfitrion e inyecta capacidades tecnicas especializadas sin acoplar su logica interna al stack del anfitrion.

---

## Tabla de Contenidos

- [Que es ai-core](#que-es-ai-core)
- [Filosofia de Desarrollo](#filosofia-de-desarrollo)
- [Estructura del Repositorio](#estructura-del-repositorio)
- [Incorporacion como Submódulo](#incorporacion-como-submódulo)
- [Skills Disponibles](#skills-disponibles)
- [Reglas Globales](#reglas-globales)
- [Como Contribuir](#como-contribuir)

---

## Que es ai-core

`ai-core` es una capa de inteligencia reutilizable. Cada proyecto anfitrion que lo incorpora obtiene un conjunto de perfiles de comportamiento tecnico (skills) que gobiernan como el agente IA razona, responde y toma decisiones dentro de ese proyecto.

El nucleo es intencionalmente agnóstico al stack tecnologico. No impone frameworks, ORMs ni plataformas de CI/CD. Cada skill lee los manifiestos del anfitrion en tiempo de ejecucion y adapta sus recomendaciones al entorno real.

---

## Filosofia de Desarrollo

### Memoria de Contexto: BACKLOG.md como Persistencia Local

Los agentes IA operan por sesion. Cuando una sesion termina, el contexto acumulado durante esa sesion, incluyendo hallazgos de auditoria, deuda tecnica detectada y decisiones arquitectonicas tomadas, se pierde por completo. Esta es una limitacion estructural de los LLMs, no un bug.

La solucion no es tecnica: es disciplina de ingenieria. Todo hallazgo relevante debe materializarse como un artefacto en el repositorio antes de cerrar la sesion. El archivo elegido para esto es `BACKLOG.md`, ubicado en la raiz del proyecto anfitrion.

Por que `BACKLOG.md` y no un sistema de tickets externo:

- Vive en el repositorio. Cualquier agente que abra el proyecto en una sesion futura puede leerlo como parte del contexto de inicializacion.
- Es un artefacto versionado. Git registra cuando se agrego cada hallazgo y quien lo aprobó.
- No requiere infraestructura externa. No depende de Jira, Linear, GitHub Issues ni ninguna herramienta de terceros para existir.
- Es legible por el agente sin integraciones adicionales. El agente puede incluir el `BACKLOG.md` en su contexto de sesion igual que lee cualquier otro archivo del proyecto.

Esta disciplina esta codificada como la Regla 7 del nucleo y es obligatoria para todos los perfiles sin excepcion.

### RAG Externo: NotebookLM como Fuente de Verdad Documental

La documentacion tecnica externa, especificaciones de API de terceros, RFCs, arquitecturas de referencia y documentos de decision, no pertenece al repositorio. Incorporarla como archivos Markdown genera ruido en el contexto y hace que el agente trabaje con copias potencialmente desactualizadas.

La solucion es un pipeline RAG (Retrieval-Augmented Generation) desacoplado del repositorio. La implementacion de referencia del ecosistema MarIA usa NotebookLM como motor de recuperacion semantica. El skill `especialista-rag` localiza la variable `NOTEBOOKLM_WORKSPACE_ID` en el `.env` del anfitrion y ejecuta la herramienta MCP correspondiente para inyectar al contexto activo unicamente los fragmentos relevantes para la tarea en curso.

La distincion arquitectonica es clara:

- `BACKLOG.md` gestiona conocimiento generado dentro del proyecto (hallazgos, deuda, decisiones).
- NotebookLM gestiona conocimiento externo al proyecto (documentacion de referencia, especificaciones).

Ambos mecanismos son complementarios. Ninguno reemplaza al otro.

### Regla 7: Persistencia de Hallazgos como Ventaja Competitiva

La mayoria de los flujos de trabajo con agentes IA sufren el mismo problema: el agente detecta deuda tecnica, propone mejoras o identifica riesgos durante la sesion, y toda esa inteligencia desaparece cuando el usuario cierra la conversacion. El siguiente agente que trabaje en el mismo proyecto empieza desde cero.

La Regla 7 del nucleo rompe este ciclo. Al finalizar cualquier auditoria o sesion con deteccion de deuda tecnica, el agente activo esta obligado a preguntar al usuario si desea registrar los hallazgos en `BACKLOG.md` antes de cerrar. Esta no es una sugerencia: es una directiva inmutable del nucleo.

El resultado practico es que el conocimiento generado en cada sesion se acumula en el repositorio. Un proyecto que opera bajo este modelo durante semanas tiene un `BACKLOG.md` que refleja fielmente la evolucion de su deuda tecnica, con fecha, contexto y prioridad de cada hallazgo. Ese artefacto es el punto de partida de cada nueva sesion.

Esto es lo que diferencia a un agente IA que ayuda en el momento de uno que construye conocimiento acumulativo sobre el proyecto.

---

## Estructura del Repositorio

```
ai-core/
├── CLAUDE.md                          Reglas globales e indice de skills
├── README.md                          Este archivo
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
        ├── arquitecto-fastapi/
        │   └── SKILL.md
        └── aiops-engineer/
            └── SKILL.md
```

El archivo `CLAUDE.md` es la entrada de lectura obligatoria para cualquier agente que opere en un repositorio que incluya `ai-core` como submódulo.

---

## Incorporacion como Submódulo

Agregar `ai-core` a un repositorio anfitrion:

```bash
git submodule add https://github.com/tu-org/ai-core .claude/ai-core
git submodule update --init --recursive
```

Para mantener el submódulo actualizado con los ultimos cambios del nucleo:

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

Governa el ciclo de vida completo de las entregas: versionado semantico, estrategia de branching, pipelines CI/CD, resolucion de conflictos y planes de rollback. Universal: aplica a cualquier plataforma de CI/CD.

Activar al: planificar releases, gestionar ramas, configurar pipelines, ejecutar despliegues o preparar planes de rollback.

### especialista-rag

Orquestador de contexto documental. Localiza `NOTEBOOKLM_WORKSPACE_ID` en el `.env` del anfitrion e inyecta documentacion tecnica externa al contexto activo via MCP.

Activar al: incorporar documentacion externa, construir pipelines RAG, gestionar colecciones vectoriales o evaluar recuperacion semantica.

### arquitecto-fastapi

Perfil especializado en sistemas Python con FastAPI, Pydantic, Qdrant y Uvicorn. Cubre el diseño de endpoints, modelos de datos y pipelines RAG en el stack Python.

Activar al: disenar endpoints FastAPI, modelar esquemas Pydantic, integrar con vectores o construir pipelines de recuperacion semantica en Python.

### aiops-engineer

Agente de mantenimiento del ecosistema ai-core. Audita periodicamente los skills, analiza nuevas capacidades del ecosistema Anthropic y propone mejoras. Requiere confirmacion humana explicita antes de modificar el nucleo.

Activar al: auditar el estado del ai-core, proponer actualizaciones de skills o incorporar nuevas capacidades de Anthropic.

---

## Reglas Globales

Las reglas globales son inmutables y aplican a todos los perfiles sin excepcion. Ningun skill puede sobreescribirlas. El detalle completo esta en `CLAUDE.md`.

Resumen:

- Regla 1: Todas las respuestas en español estricto. Rol de Mentor Senior: tecnico, directo, sin adorno.
- Regla 2: Prohibido usar emojis, iconos o adornos visuales en cualquier respuesta.
- Regla 3: Al iniciarse en un repositorio desconocido, leer los manifiestos del proyecto antes de emitir cualquier recomendacion.
- Regla 4: No inventar logica no solicitada. El alcance de cada tarea es exactamente el alcance pedido.
- Regla 5: Toda modificacion de codigo indica la ruta relativa y el numero de linea exacto donde aplica.
- Regla 6: Ante condiciones de alto impacto, insertar la directiva de interrupcion y detener hasta tener un plan aprobado.
- Regla 7: Al finalizar cualquier auditoria o deteccion de deuda tecnica, el agente DEBE preguntar al usuario si desea registrar los hallazgos en `BACKLOG.md`. Esta directiva garantiza la persistencia del contexto entre sesiones y es la base del modelo de conocimiento acumulativo del ecosistema.
- Regla 8: El desarrollo ocurre en ramas aisladas siguiendo el modelo main / develop / feature / release / hotfix. Ningun cambio llega directamente a main sin revision. Todos los commits siguen Conventional Commits.

---

## Como Contribuir

Para agregar un skill nuevo al ecosistema:

1. Crear la carpeta `.claude/skills/{nombre-en-kebab-case}/`.
2. Crear `SKILL.md` con el frontmatter obligatorio: `name`, `description`, `origin: ai-core`.
3. Incluir las secciones obligatorias: "Cuando Activar Este Perfil", "Primera Accion al Activar", "Directiva de Interrupcion", "Restricciones del Perfil".
4. No sobreescribir ninguna Regla Global.
5. Actualizar `CLAUDE.md` con la referencia al nuevo skill en la seccion "Skills Disponibles".
6. Actualizar este `README.md` con la descripcion del nuevo skill en la seccion "Skills Disponibles".

Todo cambio al nucleo sigue el Git Flow definido en la Regla 8: rama `feature/`, integracion a `develop`, release a `main` via Pull Request con pipeline en verde.
