#!/usr/bin/env node
/**
 * setup-settings.js
 * Regenera .claude/settings.json con las rutas absolutas del repositorio actual.
 * Ejecutar tras clonar o mover el repositorio a una nueva ruta o equipo.
 * Compatible: Linux, macOS, Windows (WSL y nativo con Node >= 20).
 *
 * Uso: node .claude/bin/setup-settings.js
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { buildHooksSection } = require('./hooks-definition');

const REPO          = path.resolve(__dirname, '..', '..');
const SETTINGS_PATH = path.join(REPO, '.claude', 'settings.json');
const BIN           = path.join(REPO, '.claude', 'bin');
const SCRIPTS       = path.join(REPO, 'scripts');

// En Windows path.join genera backslashes — Claude Code necesita forward slashes.
function fwd(p) { return p.split(path.sep).join('/'); }

const bin     = (s) => `"${fwd(path.join(BIN, s))}"`;
const scripts = (s) => `"${fwd(path.join(SCRIPTS, s))}"`;

const settings = {
  mcpServers: {
    'gemini-bridge': {
      command: 'node',
      args: ['scripts/mcp-gemini.js'],
      cwd: fwd(REPO),
    },
    'anthropic-router': {
      command: 'node',
      args: ['scripts/mcp-anthropic.js'],
      cwd: fwd(REPO),
    },
  },
  skillListingBudgetFraction: 0.03,
  // Umbral de auto-compact nativo fijado explicitamente por debajo del
  // default de Claude Code (~95% de la ventana de contexto) -- confirmado
  // en investigacion de mercado (2026-09-01, gist comparativo de context
  // compaction entre Claude Code/Codex CLI/OpenCode/Amp) que el default
  // nativo "a menudo es demasiado tarde" segun feedback real de usuarios.
  // Compactar antes estira mas la cuota de sesion/semana de Claude Pro
  // (recurso mas escaso que tokens de API en este proyecto). Formato
  // documentado (code.claude.com/docs/en/model-config): numero absoluto de
  // tokens o sufijo "k"/"M". 85% de una ventana tipica de 200k ~= 170000.
  autoCompactWindow: 170000,
  permissions: {
    allow: [
      'Bash(git status)',
      'Bash(git log*)',
      'Bash(git diff*)',
      'Bash(git push*)',
      'Bash(git pull*)',
      'Bash(git add*)',
      'Bash(git commit*)',
      'Bash(wc -l*)',
      'Bash(grep*)',
      'Bash(find*)',
      'Bash(cat ~/.ssh/id_ed25519.pub)',
      'Bash(ssh-keyscan*)',
      'Bash(for f in .claude/skills*)',
      'Bash(node*)',
      'Bash(npm*)',
      'Bash(python3*)',
      'Bash(gh issue create*)',
      'Bash(gh auth status*)',
      'mcp__gemini-bridge__analizar_archivo',
      'mcp__gemini-bridge__analizar_contenido',
      'mcp__gemini-bridge__analizar_repositorio',
      'mcp__gemini-bridge__resumir_backlog',
      'mcp__gemini-bridge__buscar_web',
    ],
  },
  hooks: buildHooksSection(bin, fwd(os.tmpdir())),
};

fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
console.log(`[setup-settings] settings.json actualizado — v3.10.0 hooks completos.`);
console.log(`[setup-settings] REPO: ${fwd(REPO)}`);
console.log(`[setup-settings] Plataforma: ${os.platform()} | Node: ${process.version}`);
