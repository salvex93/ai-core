'use strict';

// Fuente unica de permisos allow: el anfitrion recibe solo BASE; ai-core standalone agrega EXTRA.
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

const AI_CORE_EXTRA_PERMISSIONS = [
  "Bash(for f in .claude/skills*)",
  "Bash(python3*)",
  "Bash(gh issue create*)",
  "Bash(gh auth status*)",
];

module.exports = { BASE_PERMISSIONS, AI_CORE_EXTRA_PERMISSIONS };
