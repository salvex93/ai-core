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

// Ejecución controlada
try {
  sanitizeEnvironment();
  normalizeSymlinks();
  // purgeSessions(); — deshabilitado: borra historial de sesiones sin confirmación
  console.log(`[SUCCESS] AI-CORE v${version} | Entorno Blindado por salvex93.`);
} catch (err) {
  console.error("[ERROR] Fallo en la normalización:", err.message);
  process.exit(1);
}
