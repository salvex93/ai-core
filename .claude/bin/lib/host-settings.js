'use strict';

const fs = require("fs");
const path = require("path");
const os = require("os");
const { buildHooksSection } = require("../hooks-definition");
const { BASE_PERMISSIONS, DENY_PERMISSIONS } = require("./base-permissions");
const { esSubmoduloDeHost } = require("./submodule-detect");

function buildSettingsForHost(corePath, stackPermissions) {
  const allPermissions = [...new Set([...BASE_PERMISSIONS, ...stackPermissions])];
  const bin = (script) => `"${path.join(corePath, ".claude/bin", script)}"`;

  return {
    skillListingBudgetFraction: 0.03,
    permissions: { allow: allPermissions, deny: [...DENY_PERMISSIONS] },
    hooks: buildHooksSection(bin, os.tmpdir().split(path.sep).join('/')),
  };
}

function ensureHostClaude(corePath, hostProjectDir, stackLabels) {
  const claudeMdPath = path.join(hostProjectDir, "CLAUDE.md");
  // Solo crea si no existe ninguna version (ni symlink ni archivo real)
  if (fs.existsSync(claudeMdPath)) return;

  const stackLine = stackLabels.length > 0
    ? stackLabels.join(', ')
    : 'a definir';

  const content = [
    '# AI-CORE activo',
    '',
    `Las reglas de comportamiento estan en .claude/ai-core/CLAUDE.md.`,
    `Ejecuta al inicio de sesion: node .claude/ai-core/.claude/bin/norm-harness.js`,
    '',
    '## Stack',
    '',
    `Stack detectado: ${stackLine}`,
    '',
    '## Comandos',
    '',
    '```bash',
    '# Levantar entorno de desarrollo',
    '# a definir',
    '',
    '# Correr tests',
    '# a definir',
    '',
    '# Build / deploy',
    '# a definir',
    '```',
    '',
    '## Estructura',
    '',
    '- `src/` o `app/` — codigo fuente principal (completar)',
    '- `tests/` — suite de pruebas (completar)',
    '',
    '## Variables de entorno requeridas',
    '',
    '```',
    '# Copiar desde .env.example y completar',
    '```',
  ].join('\n');

  fs.writeFileSync(claudeMdPath, content, 'utf8');
  console.log(`[+] CLAUDE.md del proyecto creado en ${claudeMdPath} — completar seccion Comandos y Estructura.`);
}

/**
 * Asegura que el .gitignore del proyecto anfitrion excluya lo que no es
 * codigo del propio proyecto: la carpeta ai-core/ (solo si NO esta
 * registrada como submodulo git real -- un submodulo se versiona por diseno,
 * ignorarlo rompe su tracking), assets de diseno/documentacion que se suben
 * como referencia para construir el proyecto (no como parte del codigo), y
 * archivos de entorno reales (.env, nunca .env.example, que es la plantilla
 * que SI debe versionarse).
 *
 * Idempotente: no duplica entradas si el .gitignore ya las tiene, y preserva
 * cualquier contenido previo del usuario.
 */
function ensureHostGitignore(hostProjectDir) {
  const gitignorePath  = path.join(hostProjectDir, '.gitignore');
  const { esSubmodulo: esSubmoduloReal } = esSubmoduloDeHost(hostProjectDir);

  const entradasNuevas = [
    ...(esSubmoduloReal ? [] : ['ai-core/']),
    '# Assets de diseno/documentacion -- referencia para construir, no codigo',
    '*.png',
    '*.jpg',
    '*.jpeg',
    '*.gif',
    '*.fig',
    '*.sketch',
    '# Variables de entorno reales -- la plantilla de ejemplo si se versiona',
    '.env',
    '.env.local',
    '.env.*.local',
  ];

  const existente = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const lineasExistentes = new Set(existente.split('\n').map((l) => l.trim()));

  const aAgregar = entradasNuevas.filter((e) => !lineasExistentes.has(e));
  if (aAgregar.filter((e) => !e.startsWith('#')).length === 0) return;

  const separador = existente && !existente.endsWith('\n') ? '\n' : '';
  const encabezado = existente ? '' : '';
  const bloque = `${separador}${encabezado}\n# --- ai-core: no-desarrollo (auto-gestionado por norm-harness.js) ---\n${aAgregar.join('\n')}\n`;

  fs.writeFileSync(gitignorePath, existente + bloque, 'utf8');
  console.log(`[+] .gitignore actualizado (${aAgregar.filter(e => !e.startsWith('#')).length} entradas nuevas) → ${gitignorePath}`);
}

/**
 * Une las entradas de hooks de un mismo evento (ej. PreToolUse) entre el
 * settings.json existente y el generado, por matcher: si el anfitrion agrego
 * una entrada con un matcher que ai-core tambien define (ej. "Bash"), ambas
 * sobreviven como entradas separadas en el array -- Claude Code ejecuta todas
 * las entradas del array sin importar que compartan matcher, asi que no hace
 * falta fusionar los hooks dentro de una misma entrada.
 *
 * @param {Array<object>} existentes - entradas del anfitrion para este evento
 * @param {Array<object>} generadas - entradas generadas por ai-core para este evento
 * @returns {Array<object>} union de ambas, sin duplicar entradas identicas
 */
function mergeHookEntries(existentes = [], generadas = []) {
  const existentesStr = new Set(existentes.map((e) => JSON.stringify(e)));
  const nuevas = generadas.filter((e) => !existentesStr.has(JSON.stringify(e)));
  return [...existentes, ...nuevas];
}

/**
 * Combina el settings.json generado para el anfitrion con lo que el anfitrion
 * ya tenia escrito a mano, sin perder nada custom:
 * - hooks propios del anfitrion sobreviven evento por evento (union de
 *   entradas, ver mergeHookEntries) -- un reemplazo directo de la clave
 *   perdia cualquier hook custom del anfitrion en un evento que ai-core
 *   tambien usa (ej. PreToolUse).
 * - permissions.allow se une (union de conjuntos), nunca se reemplaza.
 * - el resto de campos generados (skillListingBudgetFraction) se toman del
 *   objeto nuevo, que es la fuente de verdad de la infraestructura del arnes.
 *
 * @param {object} existing - settings.json previo del anfitrion, ya parseado
 * @param {object} generado - resultado de buildSettingsForHost()
 * @returns {object} settings.json final a escribir
 */
function mergeHostSettings(existing, generado) {
  const eventosHooks = new Set([...Object.keys(existing.hooks ?? {}), ...Object.keys(generado.hooks ?? {})]);
  const hooksMerged = {};
  for (const evento of eventosHooks) {
    hooksMerged[evento] = mergeHookEntries(existing.hooks?.[evento], generado.hooks?.[evento]);
  }

  return {
    ...generado,
    hooks: hooksMerged,
    permissions: {
      ...existing.permissions,
      allow: [...new Set([...(existing.permissions?.allow ?? []), ...generado.permissions.allow])],
      deny: [...new Set([...(existing.permissions?.deny ?? []), ...generado.permissions.deny])],
    },
  };
}

module.exports = { buildSettingsForHost, ensureHostClaude, ensureHostGitignore, mergeHookEntries, mergeHostSettings };
