# Guia de Contribucion — AI-CORE

Este documento cubre todo lo que un colaborador necesita para trabajar con el repositorio sin romper el entorno de otros ni generar ruido en el historial.

---

## Requisitos previos

- Node.js >= 18.0.0
- Git configurado con nombre e email reales
- Claves de API en un archivo `.env` local (nunca al repositorio)

---

## Instalacion inicial

```bash
git clone https://github.com/salvex93/ai-core.git
cd ai-core
npm install
cp .env.example .env
# Editar .env con tus claves GEMINI_API_KEY y ANTHROPIC_API_KEY
```

`node_modules/` no esta en el repositorio. Siempre ejecuta `npm install` tras clonar o tras hacer `git pull` si el `package.json` cambio.

---

## ADVERTENCIA: node_modules nunca va al repositorio

`node_modules/` esta excluido por `.gitignore` y **nunca debe ser trackeado**. Si despues de un `git pull` ves que node_modules desaparecio de tu disco, es porque un commit anterior lo habia trackeado y fue limpiado. La solucion es siempre la misma:

```bash
npm install
```

No uses `git add node_modules/`, `git add -A` ni `git add .` sin revisar primero que no incluyes dependencias. Si accidentalmente stageas node_modules:

```bash
git reset HEAD node_modules/
```

---

## Comandos de referencia

| Comando | Descripcion |
|---|---|
| `npm install` | Instala dependencias. Ejecutar tras clonar y tras cambios en `package.json` |
| `npm run map` | Regenera `CONTEXT_MAP.json` — indice de rutas del repositorio |
| `npm run dry-run` | Simula 5 turnos de sesion con calculo de costo estimado por modelo |
| `npm run mcp-gemini` | Inicia el servidor MCP stdio de Gemini (5 herramientas de analisis) |
| `npm run mcp-anthropic` | Inicia el servidor MCP stdio de Anthropic |
| `npm run anthropic-bridge` | Bridge directo al API de Anthropic con Prompt Caching y Model Router |
| `npm run query-backlog` | Filtra y consulta `BACKLOG.md` sin cargarlo en el contexto del agente |
| `npm run init-backlog` | Crea `BACKLOG.md` en el proyecto anfitrion si no existe |
| `node .claude/bin/health-check.js` | Autodiagnostico del sistema — verifica skills, hooks, CONTEXT_MAP y variables de entorno |
| `node .claude/bin/generate-map.js` | Genera o actualiza `CONTEXT_MAP.json` manualmente |
| `node .claude/bin/detox.js` | Elimina archivos `.md` legacy que contaminan el contexto del agente |
| `node .claude/bin/norm-harness.js` | Blindaje completo del entorno: detox + symlinks + purga de artefactos de sesion |
| `npx sonar-scanner` | Analisis estatico con Quality Gates (requiere SonarQube configurado) |

---

## Herramientas del MCP Gemini Bridge

El servidor MCP expone 5 herramientas que Claude Code usa automaticamente. También se pueden invocar directamente para pruebas:

| Herramienta | Cuando se usa | Umbral de activacion |
|---|---|---|
| `analizar_archivo` | Leer y resumir un archivo largo | > 200 lineas |
| `analizar_contenido` | Analizar texto arbitrario (logs, errores, outputs) | > 50 lineas |
| `analizar_repositorio` | Escaneo completo del repositorio — 11 manifiestos | Siempre |
| `resumir_backlog` | Parsear y priorizar `BACKLOG.md` | Siempre |
| `buscar_web` | Busqueda web con Google Search grounding | Siempre |

Estas herramientas usan **Gemini 2.5 Flash (tier 0 gratuito)** como primera opcion. Si Gemini falla por cuota o error de conexion, el sistema escala automaticamente al modelo Claude del tier inmediatamente superior.

---

## Flujo de trabajo para contribuciones

### 1. Crear una rama para tu cambio

```bash
git checkout -b feat/nombre-descriptivo
# o
git checkout -b fix/descripcion-del-bug
```

### 2. Hacer los cambios

Antes de modificar cualquier archivo, revisa la seccion correspondiente en `CLAUDE.md`. Las reglas globales son inmutables y aplican a todos los colaboradores.

### 3. Convenciones de commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<alcance>): <descripcion en minusculas>
```

| Tipo | Cuando usarlo |
|---|---|
| `feat` | Nueva funcionalidad o skill |
| `fix` | Correccion de bug |
| `docs` | Cambios en documentacion unicamente |
| `perf` | Mejora de rendimiento o reduccion de tokens |
| `refactor` | Refactorizacion sin cambio de comportamiento |
| `chore` | Tareas de mantenimiento (gitignore, deps, config) |
| `test` | Agregar o modificar tests |

Ejemplos validos:
```
feat(skills): agregar skill web-scraping-specialist
fix(health-check): corregir ruta de CONTEXT_MAP en Windows
docs(readme): actualizar tabla de auto-routing con 2 skills nuevos
perf(routing): migrar buscar_web a Gemini tier 0
```

**Prohibido en mensajes de commit:**
- Mencionar herramientas de IA (Claude, Gemini, ChatGPT, etc.)
- Incluir "Co-Authored-By" con entidades no humanas
- Mensajes vagos como "fix stuff", "update", "wip"

### 4. Verificar identidad git antes del primer commit

```bash
git config user.name   # debe ser tu nombre real
git config user.email  # debe ser tu email real
```

Si no estan configurados:

```bash
git config user.name "Tu Nombre"
git config user.email "tu@email.com"
```

### 5. Pull Request

- Una PR por funcionalidad o fix. No mezclar.
- El titulo debe seguir el mismo formato que los commits.
- Describir en el cuerpo: que cambia, por que, y como verificarlo.
- Pipeline verde antes de solicitar revision.

---

## Crear un nuevo skill

1. Crear carpeta `.claude/skills/{nombre-en-kebab-case}/`
2. Crear `SKILL.md` con el siguiente frontmatter YAML obligatorio:

```yaml
---
name: nombre-del-skill
description: Una linea describiendo el dominio del skill
version: 1.0.0
last_updated: YYYY-MM-DD
origin: ai-core
---
```

3. El cuerpo del SKILL.md debe incluir obligatoriamente estas secciones:
   - **Cuando Activar Este Perfil** — palabras clave y contextos de activacion
   - **Primera Accion al Activar** — que hace el agente al cargar este skill
   - **Directiva de Interrupcion** — cuando debe detenerse y pedir confirmacion
   - **Restricciones del Perfil** — que esta prohibido hacer en este rol

4. Actualizar `CLAUDE.md`: agregar el skill a la tabla de seleccion automatica y a la lista de skills disponibles.
5. Actualizar `README.md`: agregar fila en la tabla Auto-Routing con palabras clave y modelo base.
6. Commit y push siguiendo las convenciones.

---

## Archivos que nunca van al repositorio

| Archivo / Directorio | Razon |
|---|---|
| `node_modules/` | Dependencias reconstruibles con `npm install` |
| `.env` | Credenciales y claves de API |
| `.env.local`, `.env.production` | Variantes de entorno con datos sensibles |
| `.claude/settings.local.json` | Configuracion personal de Claude Code |
| `.claude/HEALTH_REPORT.md` | Artefacto de sesion generado en runtime |
| `.claude/TO_GEMINI.md` | Artefacto de sesion generado en runtime |
| `scripts/premium/` | Scripts de automatizacion privados |

Si por accidente stageas alguno de estos archivos:

```bash
git reset HEAD <archivo>
```

Si ya hiciste commit de un archivo sensible, contacta al maintainer antes de hacer push.

---

## Contacto

Maintainer: Andrew Arizmendi — salvex93@gmail.com
