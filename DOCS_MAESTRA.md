# AI-CORE v2.6.3 — Documentacion Maestra

Referencia tecnica unica para instalacion, mantenimiento y reparacion del nucleo.
Todas las rutas son relativas a la raiz del proyecto anfitrion (`./`) para garantizar portabilidad entre equipos.

---

## 1. Guia de Implementacion

### Requisitos previos

| Requisito | Version minima |
|---|---|
| Node.js | 18.0.0 |
| Git | 2.20+ (soporte de submodulos) |
| PowerShell | 7+ (solo Windows, para `norm-harness.ps1`) |
| Variables de entorno | `.env` con `GEMINI_API_KEY` y `ANTHROPIC_API_KEY` |

### 1.1 Clonar como submodulo (recomendado)

Ejecutar desde la raiz del proyecto anfitrion:

```bash
git submodule add https://github.com/salvex93/ai-core .claude/ai-core
git submodule update --init --recursive
```

Para actualizar el nucleo en sesiones futuras:

```bash
git submodule update --remote .claude/ai-core
git add .claude/ai-core
git commit -m "chore: sync ai-core vX.Y.Z"
```

### 1.2 Configurar variables de entorno

```bash
cp ./.claude/ai-core/.env.example ./.claude/ai-core/.env
```

Editar `./.claude/ai-core/.env`:

```env
GEMINI_API_KEY=tu_clave_de_google_ai_studio
ANTHROPIC_API_KEY=tu_clave_de_anthropic
DOCS_PATH=./docs
```

### 1.3 Instalar dependencias del nucleo

```bash
cd ./.claude/ai-core
npm install
cd ../..
```

### 1.4 Normalizar el entorno (norm-harness)

El harness crea el symlink de `CLAUDE.md`, normaliza `.claude/skills/` y purga sesiones antiguas.

**Windows (PowerShell como Administrador):**

```powershell
powershell -ExecutionPolicy Bypass -File .\.claude\ai-core\.claude\bin\norm-harness.ps1
```

El script resuelve todas las rutas dinamicamente desde `$PSScriptRoot` — no requiere edicion manual.

**Linux / Mac:**

```bash
node ./.claude/ai-core/.claude/bin/norm-harness.js
```

Salida esperada:

```
[SUCCESS] AI-CORE v2.6.3 | Entorno Blindado por salvex93.
```

### 1.5 Inicializar el sistema de tracking

```bash
cd ./.claude/ai-core
npm run init-backlog
```

Crea `./.claude/BACKLOG.md` en el proyecto anfitrion con la tabla de 12 columnas. Si el archivo ya existe, el script no lo sobreescribe.

### 1.6 Generar el mapa de contexto inicial

```bash
cd ./.claude/ai-core
node .claude/bin/generate-map.js
```

O desde la raiz del proyecto anfitrion (genera el mapa de 600+ archivos del repo):

```bash
node ./.claude/ai-core/.claude/bin/generate-map.js
```

Verifica que `./.claude/CONTEXT_MAP.json` se haya creado con `total_files > 0`.

### 1.7 Iniciar el servidor MCP Gemini

El servidor MCP es el bridge primario para analisis de archivos extensos. Se registra en `./.claude/ai-core/.claude/settings.json` y Claude Code lo levanta automaticamente al abrir el proyecto.

Para verificar que esta operativo:

```bash
cd ./.claude/ai-core
npm run mcp-gemini
```

Salida esperada en stderr:

```
[MCP] Servidor Gemini Bridge iniciado. Esperando conexiones...
```

---

## 2. Manual de Actualizacion

### 2.1 Regenerar el CONTEXT_MAP (npm run map)

El mapa se desactualiza cuando se agregan, mueven o eliminan archivos del proyecto. Ejecutar siempre despues de cambios estructurales en el repositorio.

El comando `map` no existe en `package.json` por defecto — se invoca el script directamente:

```bash
# Desde la raiz del proyecto anfitrion:
node ./.claude/ai-core/.claude/bin/generate-map.js
```

Para agregarlo como script npm en el `package.json` del proyecto anfitrion:

```json
"scripts": {
  "map": "node ./.claude/ai-core/.claude/bin/generate-map.js"
}
```

A partir de ahi:

```bash
npm run map
```

**Cuando regenerar:**

| Evento | Accion |
|---|---|
| Se agrega un directorio nuevo | `npm run map` |
| Se elimina o renombra un archivo | `npm run map` |
| RootGuard emite `NUEVA RAIZ DETECTADA` | `npm run map` desde la raiz correcta |
| Se actualiza el submodulo ai-core | `npm run map` |
| Al iniciar una sesion en un equipo nuevo | `npm run map` |

### 2.2 Limpiar archivos legacy (detox)

El detox elimina todos los archivos `.md` en la raiz del proyecto anfitrion excepto `CLAUDE.md` y `README.md`. Previene el envenenamiento del contexto del agente con reportes de versiones anteriores.

```bash
node ./.claude/ai-core/.claude/bin/detox.js
```

**Archivos protegidos del detox:**

- `./CLAUDE.md`
- `./README.md`

**Archivos que elimina (ejemplos historicos):**

- `./AI_RESPONSE_OPTIMIZATION_ANALYSIS.md`
- `./SECURITY_CHANGES_v2.4.0.md`
- `./INTEGRATION_VALIDATION_REPORT.md`
- Cualquier otro `.md` en la raiz que no este en la lista de protegidos

Ejecutar detox antes de iniciar una sesion de auditoria para garantizar contexto limpio.

### 2.3 Actualizar skills

Los skills se heredan del nucleo via symlink. Para actualizar un skill especifico, editar directamente:

```
./.claude/ai-core/.claude/skills/<nombre-skill>/SKILL.md
```

El cambio se refleja inmediatamente en todos los proyectos que usen symlink a este nucleo. Para proyectos con submodulo, hacer commit en el ai-core y luego `git submodule update --remote`.

### 2.4 Ciclo de actualizacion de version

Al incrementar la version del nucleo (`package.json version`):

1. Editar `package.json` con la nueva version.
2. Actualizar el encabezado de `CLAUDE.md` para reflejar la version (ej. `# AI-CORE v2.7.0`).
3. Ejecutar `node .claude/bin/generate-map.js` — el mapa toma la version de `package.json` automaticamente.
4. Ejecutar `node .claude/bin/norm-harness.js` — el mensaje de exito usa la version de `package.json`.
5. Hacer commit: `git commit -m "build: core vX.Y.Z production ready"`.

---

## 3. Troubleshooting

### Error: `MODULE_NOT_FOUND`

**Sintoma:**

```
Error: Cannot find module '../services/ModelRouter'
    at Function.Module._resolveFilename
```

**Causa mas comun:** el script se ejecuta desde un directorio distinto al esperado, o el submodulo no tiene `node_modules` instalados.

**Diagnostico:**

```bash
# Verificar desde que directorio se ejecuta
node -e "console.log(process.cwd())"

# Verificar que node_modules existe en el nucleo
ls ./.claude/ai-core/node_modules/@anthropic-ai 2>/dev/null || echo "node_modules ausente"
```

**Solucion:**

```bash
cd ./.claude/ai-core
npm install
cd ../..
```

Si el error persiste con rutas absolutas en algun script legacy:

```bash
# Buscar rutas hardcodeadas en scripts
grep -rn "C:\\\\Users\|/home/[a-z]" ./.claude/ai-core/scripts/ 2>/dev/null
```

Cualquier ruta absoluta encontrada es un bug de portabilidad — reemplazar por `path.resolve(__dirname, ...)`.

---

### Error: Desincronizacion del mapa (`CONTEXT_MAP` obsoleto)

**Sintoma:** el agente intenta leer un archivo que ya no existe, o no encuentra archivos recien creados.

**Diagnostico:**

```bash
node -e "
const ci = require('./.claude/ai-core/scripts/services/ContextIndex');
console.log(JSON.stringify(ci.diagnostico(), null, 2));
"
```

Salida esperada:

```json
{
  "estado": "cargado",
  "version": "2.6.3",
  "total_archivos": 610,
  "raiz_resuelta": "/ruta/al/proyecto"
}
```

Si `estado` es `sin_mapa` o `total_archivos` es 0 o menor al esperado:

```bash
node ./.claude/ai-core/.claude/bin/generate-map.js
```

---

### Error: `NUEVA RAIZ DETECTADA` (RootGuard)

**Sintoma:**

```
[RootGuard] NUEVA RAIZ DETECTADA.
  CWD actual : C:\otro\proyecto
  Raiz del mapa : C:\proyecto-correcto
  Ejecute npm run map para evitar consumo excesivo de tokens.
```

**Causa:** el agente fue iniciado desde un directorio diferente al que generó el mapa, o el mapa fue copiado de otro proyecto.

**Solucion:**

```bash
# 1. Navegar a la raiz correcta del proyecto anfitrion
cd /ruta/correcta/al/proyecto

# 2. Regenerar el mapa desde la raiz correcta
node ./.claude/ai-core/.claude/bin/generate-map.js
```

---

### Error: MCP Gemini Bridge no disponible

**Sintoma:** el skill emite `[BRIDGE NO DISPONIBLE]` o Claude Code no muestra el servidor MCP en la lista de herramientas.

**Diagnostico:**

```bash
# Verificar que GEMINI_API_KEY esta configurada
node -e "require('./.claude/ai-core/scripts/services/ContextIndex'); console.log(process.env.GEMINI_API_KEY ? 'KEY OK' : 'KEY AUSENTE')"
```

**Solucion:**

1. Verificar que `./.claude/ai-core/.env` tiene `GEMINI_API_KEY` configurada.
2. Verificar que `settings.json` referencia correctamente el servidor:

```json
{
  "mcpServers": {
    "gemini-bridge": {
      "command": "node",
      "args": [".claude/ai-core/scripts/mcp-gemini.js"],
      "cwd": "./"
    }
  }
}
```

3. Reiniciar Claude Code para que levante el servidor MCP.

---

### Error: `SyntaxError` al parsear `CONTEXT_MAP.json`

**Causa:** el archivo fue truncado durante una escritura interrumpida.

**Solucion:**

```bash
# Eliminar el mapa corrupto y regenerar
rm ./.claude/CONTEXT_MAP.json
node ./.claude/ai-core/.claude/bin/generate-map.js
```

---

### Error: symlink `CLAUDE.md` apunta a ruta inexistente

**Sintoma:** Claude Code no carga las reglas del nucleo o muestra el CLAUDE.md del proyecto anfitrion en lugar del del nucleo.

**Diagnostico:**

```bash
# Linux/Mac
ls -la ./CLAUDE.md

# Windows PowerShell
(Get-Item ./CLAUDE.md).Target
```

**Solucion:** ejecutar el harness nuevamente (resuelve el symlink de forma automatica):

```bash
# Windows
powershell -ExecutionPolicy Bypass -File .\.claude\ai-core\.claude\bin\norm-harness.ps1

# Linux/Mac
node ./.claude/ai-core/.claude/bin/norm-harness.js
```

---

## 4. Protocolo de Reparacion (ErrorRepairLoop)

El `ErrorRepairLoop` es un ciclo de tres fases que automatiza el diagnostico y la correccion de errores de shell o de ejecucion. No hace llamadas a la API por si solo — requiere que `anthropic-bridge.js` este configurado con `ANTHROPIC_API_KEY`.

### Arquitectura del ciclo

```
Error capturado
      |
      v
[Fase 1 — DETECCION]
  ErrorRepairLoop.capturarError()
  - Clasifica severidad: CRITICO / ALTO / MEDIO / BAJO
  - Identifica categoria: sistema_de_archivos, red, parseo, permisos, etc.
  - Construye el prompt de diagnostico
      |
      v
[Fase 2 — DIAGNOSTICO]  — Modelo: Sonnet (rol AUDITOR)
  ErrorRepairLoop.buildPromptDiagnostico()
  - Analiza stderr, exit code y stack trace
  - Produce JSON: { causa_raiz, archivos_afectados, accion_correctiva, prevencion }
      |
      v
[Fase 3 — REPARACION]   — Modelo: Opus (rol ARCHITECT)
  ErrorRepairLoop.buildPromptReparacion()
  - Recibe el JSON del AUDITOR
  - Genera UNICAMENTE el codigo o comando de correccion
```

### 4.1 Uso programatico

Para capturar un error en un bloque `catch` y obtener los prompts de reparacion sin llamadas a la API:

```javascript
const { capturarError } = require('./.claude/ai-core/scripts/services/ErrorRepairLoop');

try {
  // operacion que puede fallar
} catch (err) {
  const meta = capturarError(err, {
    herramienta: 'nombre_de_la_tool',
    exitCode:    err.exitCode,
    stderr:      err.stderr,
    contexto:    'descripcion de la operacion en curso',
  });

  console.error('[ERROR]', meta.clasificacion.severidad, meta.clasificacion.categoria);
  // meta.prompts.diagnostico contiene el prompt listo para enviar al AUDITOR
}
```

### 4.2 Ciclo completo con llamadas a la API

Para ejecutar el ciclo completo (requiere `ANTHROPIC_API_KEY`):

```javascript
const { ejecutarCicloReparacion } = require('./.claude/ai-core/scripts/services/ErrorRepairLoop');

async function manejarError(err) {
  const resultado = await ejecutarCicloReparacion({
    error:       err,
    herramienta: 'nombre_de_la_tool',
    exitCode:    err.exitCode,
    stderr:      err.stderr,
  });

  console.log('Causa raiz:', resultado.diagnostico.causa_raiz);
  console.log('Reparacion:', resultado.reparacion);
  console.log('Modelos usados:', resultado.modelo_usado);
}
```

### 4.3 Tabla de severidades y acciones recomendadas

| Severidad | Categoria | Patron de error | Accion inmediata |
|---|---|---|---|
| CRITICO | `red_conectividad` | `ECONNREFUSED`, `ETIMEDOUT` | Verificar conectividad, reintentar con backoff |
| CRITICO | `permisos` | `EACCES`, `permission denied` | Ejecutar como Administrador o corregir permisos |
| CRITICO | `autenticacion` | `401`, `403`, `Unauthorized` | Verificar `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` en `.env` |
| ALTO | `sistema_de_archivos` | `ENOENT`, `no such file` | Verificar ruta, regenerar mapa con `generate-map.js` |
| ALTO | `tipo_datos` | `TypeError`, `undefined` | Revisar contrato de datos entre modulos |
| ALTO | `referencia` | `ReferenceError` | Verificar imports y rutas relativas en `require()` |
| MEDIO | `parseo_json` | `SyntaxError`, `JSON.parse` | Eliminar archivo JSON corrupto y regenerar |
| MEDIO | `api_quota` | `quota`, `rate limit`, `429` | Esperar o cambiar al bridge alternativo |
| BAJO | `desconocido` | cualquier otro | Revisar logs completos y escalar al AUDITOR |

### 4.4 Punto de inyeccion en `mcp-gemini.js`

Si se requiere activar el `ErrorRepairLoop` en el servidor MCP, el punto de inyeccion documentado en el codigo es la linea 445 del bloque `catch` del dispatcher `tools/call`:

```javascript
// Antes (comportamiento actual):
send({ jsonrpc: '2.0', id, error: { code: -32603, message: err.message } });

// Despues (con ErrorRepairLoop):
const { capturarError } = require('./services/ErrorRepairLoop');
const meta = capturarError(err, { herramienta: name, exitCode: err.exitCode });
send({ jsonrpc: '2.0', id, error: { code: -32603, message: err.message, data: meta } });
```

---

## Referencia rapida de comandos

| Operacion | Comando |
|---|---|
| Normalizar entorno (Windows) | `powershell -File .\.claude\ai-core\.claude\bin\norm-harness.ps1` |
| Normalizar entorno (Unix) | `node ./.claude/ai-core/.claude/bin/norm-harness.js` |
| Regenerar mapa de contexto | `node ./.claude/ai-core/.claude/bin/generate-map.js` |
| Limpiar archivos legacy | `node ./.claude/ai-core/.claude/bin/detox.js` |
| Inicializar BACKLOG | `cd ./.claude/ai-core && npm run init-backlog` |
| Iniciar servidor MCP | `cd ./.claude/ai-core && npm run mcp-gemini` |
| Simular costos de sesion | `cd ./.claude/ai-core && npm run dry-run` |
| Diagnosticar ContextIndex | `node -e "console.log(JSON.stringify(require('./.claude/ai-core/scripts/services/ContextIndex').diagnostico(),null,2))"` |
