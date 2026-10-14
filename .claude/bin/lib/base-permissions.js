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

// Secretos que las tools de archivo de Claude no deben leer ni escribir. Se lista cada
// variante de .env por nombre: un comodin .env.* bloquearia tambien .env.example. La clave
// publica ~/.ssh/*.pub queda fuera a proposito porque el allow de cat la necesita.
const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.staging', '.env.test', '.env.production', '.env.*.local'];
const KEY_FILES = ['**/*.pem', '**/*.key', '**/*.p12', '**/*.pfx'];
const HOME_SECRETS = [
  '~/.ssh/id_rsa', '~/.ssh/id_ed25519', '~/.ssh/id_ecdsa', '~/.ssh/id_dsa',
  '~/.aws/credentials', '~/.config/gh/hosts.yml', '~/.npmrc', '~/.netrc',
];

const DENY_PERMISSIONS = Object.freeze([
  ...[...ENV_FILES, ...KEY_FILES].flatMap(ruta => [`Read(${ruta})`, `Edit(${ruta})`]),
  ...HOME_SECRETS.map(ruta => `Read(${ruta})`),
]);

module.exports = { BASE_PERMISSIONS, AI_CORE_EXTRA_PERMISSIONS, DENY_PERMISSIONS };
