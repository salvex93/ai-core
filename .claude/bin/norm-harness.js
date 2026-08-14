#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");
const { version } = require(path.resolve(__dirname, "../../package.json"));
const { detectStack } = require("./detect-stack");
const { buildHooksSection } = require("./hooks-definition");

const platform = os.platform();
const homeDir = os.homedir();
const CORE_PATH = path.resolve(__dirname, "..", "..");
const projectDir = process.cwd();

// Módulo Detox: Archivos que deben morir para ahorrar tokens
const BLACKLIST = [
  "AI_RESPONSE_OPTIMIZATION_ANALYSIS.md",
  "SECURITY_CHANGES_v2.4.0.md",
  "INTEGRATION_VALIDATION_REPORT.md",
  "HISTORIAS_USUARIO_SEGURIDAD.md",
];

function getSessionsDir() {
  if (platform === "win32")
    return path.resolve(homeDir, "AppData", "Roaming", ".claude", "sessions");
  return path.resolve(homeDir, ".config", ".claude", "sessions");
}

function removeRecursive(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.lstatSync(targetPath);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    fs.readdirSync(targetPath).forEach((file) =>
      removeRecursive(path.join(targetPath, file)),
    );
    fs.rmdirSync(targetPath);
  } else {
    fs.unlinkSync(targetPath);
  }
}

function sanitizeEnvironment() {
  console.log("--- [DETOX] Limpiando archivos legacy ---");
  BLACKLIST.forEach((file) => {
    const filePath = path.join(projectDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[-] Eliminado: ${file}`);
    }
  });
}

function normalizeSymlinks() {
  const claudeMdPath = path.join(projectDir, "CLAUDE.md");
  const coreClaude = path.join(CORE_PATH, "CLAUDE.md");

  // Evitar recreación si ya es un link válido
  if (!fs.existsSync(claudeMdPath)) {
    try {
      if (platform === "win32") {
        fs.symlinkSync(coreClaude, claudeMdPath, "file");
      } else {
        fs.symlinkSync(coreClaude, claudeMdPath);
      }
      console.log("[+] Simlink CLAUDE.md creado.");
    } catch (e) {
      console.error("[!] Error en symlinks. Ejecuta como Administrador.");
    }
  }
}

function purgeSessions() {
  const sDir = getSessionsDir();
  if (fs.existsSync(sDir)) {
    fs.readdirSync(sDir).forEach((f) => removeRecursive(path.join(sDir, f)));
    console.log("[+] Sesiones antiguas purgadas.");
  }
}

const BASE_PERMISSIONS = [
  "Bash(git status)",
  "Bash(git log*)",
  "Bash(git diff*)",
  "Bash(git push*)",
  "Bash(git pull*)",
  "Bash(git add*)",
  "Bash(git commit*)",
  "Bash(wc -l*)",
  "Bash(grep*)",
  "Bash(find*)",
  "Bash(cat ~/.ssh/id_ed25519.pub)",
  "Bash(ssh-keyscan*)",
  "Bash(node*)",
  "Bash(npm*)",
  "mcp__gemini-bridge__analizar_archivo",
  "mcp__gemini-bridge__analizar_contenido",
  "mcp__gemini-bridge__analizar_repositorio",
  "mcp__gemini-bridge__resumir_backlog",
  "mcp__gemini-bridge__buscar_web",
];

function buildSettingsForHost(corePath, stackPermissions) {
  const allPermissions = [...new Set([...BASE_PERMISSIONS, ...stackPermissions])];
  const bin = (script) => `"${path.join(corePath, ".claude/bin", script)}"`;

  return {
    mcpServers: {
      "gemini-bridge": {
        command: "node",
        args: ["scripts/mcp-gemini.js"],
        cwd: corePath,
      },
      "anthropic-router": {
        command: "node",
        args: ["scripts/mcp-anthropic.js"],
        cwd: corePath,
      },
    },
    skillListingBudgetFraction: 0.03,
    permissions: { allow: allPermissions },
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
  const gitmodulesPath = path.join(hostProjectDir, '.gitmodules');

  const esSubmoduloReal = fs.existsSync(gitmodulesPath)
    && /\[submodule\s+"ai-core"\]/.test(fs.readFileSync(gitmodulesPath, 'utf8'));

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

function ensureHostSettings(corePath, hostProjectDir) {
  // Solo actua si el harness se ejecuta desde un proyecto anfitrion (no desde ai-core mismo)
  if (hostProjectDir === corePath) return;

  const hostClaudeDir    = path.join(hostProjectDir, ".claude");
  const hostSettingsPath = path.join(hostClaudeDir, "settings.json");

  if (!fs.existsSync(hostClaudeDir)) fs.mkdirSync(hostClaudeDir, { recursive: true });

  const { permissions: stackPerms, labels: stackLabels } = detectStack(hostProjectDir);

  // Detectar path drift o permisos de stack desactualizados
  let needsWrite = true;
  if (fs.existsSync(hostSettingsPath)) {
    try {
      const existing    = JSON.parse(fs.readFileSync(hostSettingsPath, "utf8"));
      const existingCwd = existing?.mcpServers?.["gemini-bridge"]?.cwd;
      // Regenerar si: path drift O hay permisos de stack nuevos no incluidos
      const existingAllow = existing?.permissions?.allow ?? [];
      const missingPerms  = stackPerms.filter(p => !existingAllow.includes(p));
      needsWrite = existingCwd !== corePath || missingPerms.length > 0;
    } catch {
      needsWrite = true;
    }
  }

  if (needsWrite) {
    const settings = buildSettingsForHost(corePath, stackPerms);
    fs.writeFileSync(hostSettingsPath, JSON.stringify(settings, null, 2), "utf8");
    const reason = stackLabels.length > 0 ? ` [stack: ${stackLabels.join(', ')}]` : '';
    console.log(`[+] settings.json generado/corregido${reason} → ${hostSettingsPath}`);
  }

  ensureHostClaude(corePath, hostProjectDir, stackLabels);
}

// Ejecución controlada
try {
  sanitizeEnvironment();
  normalizeSymlinks();
  if (projectDir !== CORE_PATH) ensureHostGitignore(projectDir);
  ensureHostSettings(CORE_PATH, projectDir);
  // purgeSessions(); — deshabilitado: borra historial de sesiones sin confirmación
  console.log(`[SUCCESS] AI-CORE v${version} | Entorno Blindado por salvex93.`);
} catch (err) {
  console.error("[ERROR] Fallo en la normalización:", err.message);
  process.exit(1);
}
