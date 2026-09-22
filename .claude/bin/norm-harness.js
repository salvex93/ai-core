#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");
const { version } = require(path.resolve(__dirname, "../../package.json"));
const { detectStack } = require("./detect-stack");
const { DENY_PERMISSIONS } = require("./lib/base-permissions");
const { ensureHostClaude, ensureHostGitignore, mergeHostSettings, buildSettingsForHost } = require("./lib/host-settings");
const { writeMcpJson, readGeminiBridgeCwd, toForwardSlash } = require("./lib/mcp-config");

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


function ensureHostSettings(corePath, hostProjectDir) {
  // Solo actua si el harness se ejecuta desde un proyecto anfitrion (no desde ai-core mismo)
  if (hostProjectDir === corePath) return;

  const hostClaudeDir    = path.join(hostProjectDir, ".claude");
  const hostSettingsPath = path.join(hostClaudeDir, "settings.json");

  if (!fs.existsSync(hostClaudeDir)) fs.mkdirSync(hostClaudeDir, { recursive: true });

  const { permissions: stackPerms, labels: stackLabels } = detectStack(hostProjectDir);

  // mcpServers vive en .mcp.json (unica ubicacion efectiva, ver mcp-config.js
  // y hallazgo de gobierno G12) -- se escribe siempre, idempotente por si solo.
  writeMcpJson(hostProjectDir, corePath);

  // Detectar path drift (via .mcp.json) o permisos de stack desactualizados
  let needsWrite = true;
  let existing = null;
  if (fs.existsSync(hostSettingsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(hostSettingsPath, "utf8"));
      const existingCwd = readGeminiBridgeCwd(hostProjectDir);
      // Regenerar si: path drift O hay permisos de stack nuevos no incluidos
      // existingCwd viene normalizado a forward-slash (buildMcpServersBlock lo
      // persiste asi en .mcp.json) -- corePath se compara igual normalizado,
      // porque en Windows path.resolve() usa backslash y la comparacion cruda
      // nunca coincidia, forzando needsWrite=true en toda corrida (CI windows-latest).
      const existingAllow = existing?.permissions?.allow ?? [];
      const existingDeny  = existing?.permissions?.deny ?? [];
      const missingPerms  = stackPerms.filter(p => !existingAllow.includes(p));
      const missingDeny   = DENY_PERMISSIONS.filter(p => !existingDeny.includes(p));
      needsWrite = existingCwd !== toForwardSlash(corePath) || missingPerms.length > 0 || missingDeny.length > 0;
    } catch {
      // JSON invalido: no hay contenido custom recuperable, se regenera desde cero.
      existing = null;
      needsWrite = true;
    }
  }

  if (needsWrite) {
    const generado = buildSettingsForHost(corePath, stackPerms);
    const settings = existing ? mergeHostSettings(existing, generado) : generado;

    // Backup antes de sobreescribir -- unica forma de recuperar hooks custom
    // si el merge tuviera un gap no cubierto (ver regla 6 de Gobierno de
    // Agentes en CLAUDE.md: ninguna sobreescritura sin red de recuperacion).
    if (fs.existsSync(hostSettingsPath)) {
      fs.copyFileSync(hostSettingsPath, `${hostSettingsPath}.bak`);
    }

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
