#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");
const { version } = require(path.resolve(__dirname, "../../package.json"));

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

function buildSettingsForHost(corePath) {
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
    permissions: {
      allow: [
        "Bash(git status)",
        "Bash(git log*)",
        "Bash(git diff*)",
        "Bash(git push*)",
        "Bash(git pull*)",
        "Bash(git add*)",
        "Bash(git commit*)",
        "Bash(wc -l*)",
        "Bash(grep*)",
        "Bash(cat ~/.ssh/id_ed25519.pub)",
        "Bash(ssh-keyscan*)",
        "Bash(node*)",
        "Bash(npm*)",
        "mcp__gemini-bridge__analizar_archivo",
        "mcp__gemini-bridge__analizar_contenido",
        "mcp__gemini-bridge__analizar_repositorio",
        "mcp__gemini-bridge__resumir_backlog",
        "mcp__gemini-bridge__buscar_web",
      ],
    },
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command",
              command: `node ${path.join(corePath, ".claude/bin/health-check.js")} 2>&1 || true`,
            },
            {
              type: "command",
              command: `node ${path.join(corePath, ".claude/bin/validate-map.js")} 2>/dev/null || true`,
            },
          ],
        },
        {
          matcher: "Read",
          hooks: [
            {
              type: "command",
              command: `node ${path.join(corePath, ".claude/bin/guard-read.js")} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true`,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "Write|Edit",
          hooks: [
            {
              type: "command",
              command: `node ${path.join(corePath, ".claude/bin/detox.js")} 2>/dev/null || true`,
            },
          ],
        },
      ],
    },
  };
}

function ensureHostSettings(corePath, hostProjectDir) {
  // Solo actua si el harness se ejecuta desde un proyecto anfitrion (no desde ai-core mismo)
  if (hostProjectDir === corePath) return;

  const hostClaudeDir  = path.join(hostProjectDir, ".claude");
  const hostSettingsPath = path.join(hostClaudeDir, "settings.json");

  if (!fs.existsSync(hostClaudeDir)) fs.mkdirSync(hostClaudeDir, { recursive: true });

  // Detectar path drift: si el settings existe pero apunta a rutas distintas al corePath real
  let needsWrite = true;
  if (fs.existsSync(hostSettingsPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(hostSettingsPath, "utf8"));
      const existingCwd = existing?.mcpServers?.["gemini-bridge"]?.cwd;
      needsWrite = existingCwd !== corePath;
    } catch {
      needsWrite = true;
    }
  }

  if (needsWrite) {
    const settings = buildSettingsForHost(corePath);
    fs.writeFileSync(hostSettingsPath, JSON.stringify(settings, null, 2), "utf8");
    console.log(`[+] settings.json del anfitrion generado/corregido en ${hostSettingsPath}`);
  }
}

// Ejecución controlada
try {
  sanitizeEnvironment();
  normalizeSymlinks();
  ensureHostSettings(CORE_PATH, projectDir);
  // purgeSessions(); — deshabilitado: borra historial de sesiones sin confirmación
  console.log(`[SUCCESS] AI-CORE v${version} | Entorno Blindado por salvex93.`);
} catch (err) {
  console.error("[ERROR] Fallo en la normalización:", err.message);
  process.exit(1);
}
