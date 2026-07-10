#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");
const { version } = require(path.resolve(__dirname, "../../package.json"));
const { detectStack } = require("./detect-stack");

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
    hooks: {
      UserPromptSubmit: [
        {
          hooks: [
            { type: "command", command: `node ${bin("process-guard.js")} intent node ${bin("detect-role.js")} 2>/dev/null || true` },
            { type: "command", command: `node ${bin("secrets-guard.js")} 2>/dev/null || true` },
            { type: "command", command: `node ${bin("process-guard.js")} moa node ${bin("moa-context-gatherer.js")} 2>/dev/null || true` },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            { type: "command", command: `node ${bin("session-summary.js")} 2>/dev/null || true` },
            { type: "command", command: `node ${bin("process-guard.js")} capture node ${bin("issue-reporter.js")} 2>/dev/null || true` },
            { type: "command", command: `node ${bin("aiops-score.js")} 2>/dev/null || true` },
            { type: "command", command: `node ${bin("memory-index-stop.js")} 2>/dev/null || true` },
          ],
        },
      ],
      SubagentStop: [
        {
          hooks: [
            { type: "command", command: `node ${bin("subagent-review.js")} 2>/dev/null || true` },
          ],
        },
      ],
      PostToolUseFailure: [
        {
          matcher: "mcp__gemini-bridge__*",
          hooks: [{ type: "command", command: `echo "[MCP-FAIL] gemini-bridge fallo — usar tier Claude segun jerarquia de costo" >&2 && node ${bin("process-guard.js")} capture node ${bin("capture-event.js")} --type mcp_failure --tool gemini-bridge 2>/dev/null || true` }],
        },
        {
          matcher: "mcp__anthropic-router__*",
          hooks: [{ type: "command", command: `node ${bin("process-guard.js")} capture node ${bin("capture-event.js")} --type mcp_failure --tool anthropic-router 2>/dev/null || true` }],
        },
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: `node ${bin("process-guard.js")} capture node ${bin("capture-event.js")} --type hook_failure --tool bash 2>/dev/null || true` }],
        },
      ],
      PreToolUse: [
        {
          matcher: "Bash(git push*)",
          hooks: [{ type: "command", command: `node ${bin("git-queue-advisor.js")} push 2>&1 || true` }],
        },
        {
          matcher: "Bash",
          hooks: [
            { type: "command", command: `node ${bin("process-guard.js")} health node ${bin("health-check.js")} 2>&1 || true` },
            { type: "command", command: `node ${bin("process-guard.js")} map node ${bin("validate-map.js")} 2>/dev/null || true` },
          ],
        },
        {
          matcher: "Read",
          hooks: [{ type: "command", command: `node ${bin("guard-read.js")} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true` }],
        },
        {
          matcher: "Write|Edit",
          hooks: [
            { type: "command", command: `node ${bin("ponytail-check.js")} 2>/dev/null || true` },
            { type: "command", command: `node ${bin("dependency-tracer.js")} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true` },
            { type: "command", command: `node ${bin("pre-commit-tdd.js")} "$CLAUDE_TOOL_INPUT_file_path"` },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "Bash(git pull*)",
          hooks: [{ type: "command", command: `node ${bin("git-queue-advisor.js")} pull 2>&1 || true` }],
        },
        {
          matcher: "Bash|Read|Write|Edit|Agent",
          hooks: [{ type: "command", command: `node ${bin("agent-metrics.js")} record --tool "$CLAUDE_TOOL_NAME" --status ok 2>/dev/null || true` }],
        },
        {
          matcher: "Write|Edit",
          hooks: [
            { type: "command", command: `node ${bin("process-guard.js")} lint node ${bin("detox.js")} 2>/dev/null || true` },
            { type: "command", command: `FILE="$CLAUDE_TOOL_INPUT_file_path"; if [[ "$FILE" == *.js ]]; then node --check "$FILE" 2>&1 && echo "[syntax-ok] $FILE" || echo "[syntax-error] $FILE"; fi` },
            { type: "command", command: `node ${bin("process-guard.js")} lint node ${bin("standards-guard.js")} "$CLAUDE_TOOL_INPUT_file_path"` },
            { type: "command", command: `node ${bin("process-guard.js")} map node ${bin("diff-map-trigger.js")} 2>/dev/null || true` },
            { type: "command", command: `node ${bin("process-guard.js")} lint node ${bin("security-check.js")} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true` },
          ],
        },
      ],
    },
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
  ensureHostSettings(CORE_PATH, projectDir);
  // purgeSessions(); — deshabilitado: borra historial de sesiones sin confirmación
  console.log(`[SUCCESS] AI-CORE v${version} | Entorno Blindado por salvex93.`);
} catch (err) {
  console.error("[ERROR] Fallo en la normalización:", err.message);
  process.exit(1);
}
