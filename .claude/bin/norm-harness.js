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

function esLinkValidoAlCore(claudeMdPath, coreClaude) {
  if (!fs.existsSync(claudeMdPath)) return false;
  const stat = fs.lstatSync(claudeMdPath);
  if (stat.isSymbolicLink()) return fs.realpathSync(claudeMdPath) === fs.realpathSync(coreClaude);
  // Hardlink: mismo inode que el CLAUDE.md real del core.
  return fs.statSync(claudeMdPath).ino === fs.statSync(coreClaude).ino;
}

/**
 * @returns {boolean} true si el symlink/hardlink se creo o ya no hacia falta
 *   crearlo; false si ambos intentos fallaron (permisos insuficientes) -- el
 *   caller decide como reportarlo, esta funcion nunca oculta el fallo
 *   tragandoselo en silencio.
 */
function normalizeSymlinks() {
  const claudeMdPath = path.join(projectDir, "CLAUDE.md");
  const coreClaude = path.join(CORE_PATH, "CLAUDE.md");

  // No aplica al propio ai-core: ahi CLAUDE.md es el archivo real, no un link al host.
  if (projectDir === CORE_PATH) return true;

  if (esLinkValidoAlCore(claudeMdPath, coreClaude)) return true;

  // Copia obsoleta o inexistente: reemplazar por un link al CLAUDE.md real del core.
  if (fs.existsSync(claudeMdPath)) fs.unlinkSync(claudeMdPath);

  try {
    fs.symlinkSync(coreClaude, claudeMdPath, "file");
    console.log("[+] Symlink CLAUDE.md creado/actualizado.");
  } catch (e) {
    // Windows sin modo desarrollador/admin no permite symlinks de archivo
    // (requiere SeCreateSymbolicLinkPrivilege). Hardlink es el fallback
    // correcto: mismo contenido siempre, sin privilegios especiales en NTFS.
    try {
      fs.linkSync(coreClaude, claudeMdPath);
      console.log("[+] Hardlink CLAUDE.md creado/actualizado (symlink no disponible en este entorno).");
    } catch (e2) {
      console.error(`[!] No se pudo vincular CLAUDE.md al core (symlink: ${e.code || e.message}; hardlink: ${e2.code || e2.message}). Ejecuta como Administrador o activa el Modo Desarrollador en Windows.`);
      return false;
    }
  }
  return true;
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
  const symlinkOk = normalizeSymlinks();
  if (projectDir !== CORE_PATH) ensureHostGitignore(projectDir);
  ensureHostSettings(CORE_PATH, projectDir);
  // purgeSessions(); — deshabilitado: borra historial de sesiones sin confirmación
  if (symlinkOk) {
    console.log(`[SUCCESS] AI-CORE v${version} | Entorno Blindado por salvex93.`);
  } else {
    // Fallo recuperable, no fatal: el resto de la normalizacion (settings,
    // gitignore, permisos) ya se aplico igual -- pero CLAUDE.md del anfitrion
    // sigue sin apuntar a las reglas de ai-core hasta que se resuelva el
    // symlink, asi que el mensaje final NO puede ser un exito silencioso.
    console.log(`[PARCIAL] AI-CORE v${version} | Normalizacion aplicada, pero el symlink de CLAUDE.md fallo -- ver mensaje de error arriba.`);
  }
} catch (err) {
  console.error("[ERROR] Fallo en la normalización:", err.message);
  process.exit(1);
}
