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
  hooks: {
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: 'command',
            command: `node ${bin('process-guard.js')} intent node ${bin('detect-role.js')} 2>/dev/null || true`,
          },
          {
            type: 'command',
            command: `node ${bin('secrets-guard.js')} 2>/dev/null || true`,
          },
          {
            type: 'command',
            command: `node ${bin('process-guard.js')} moa node ${bin('moa-context-gatherer.js')} 2>/dev/null || true`,
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          { type: 'command', command: `node ${bin('session-summary.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('process-guard.js')} capture node ${bin('issue-reporter.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('aiops-score.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('memory-index-stop.js')} 2>/dev/null || true` },
        ],
      },
    ],
    SubagentStop: [
      {
        hooks: [
          { type: 'command', command: `node ${bin('subagent-review.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('cross-verify-gate.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('injection-guard.js')} 2>/dev/null || true` },
        ],
      },
    ],
    PostToolUseFailure: [
      {
        matcher: 'mcp__gemini-bridge__*',
        hooks: [
          { type: 'command', command: `echo "[MCP-FAIL] gemini-bridge fallo — usar tier Claude segun jerarquia de costo" >&2 && node ${bin('process-guard.js')} capture node ${bin('capture-event.js')} --type mcp_failure --tool gemini-bridge 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'mcp__anthropic-router__*',
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} capture node ${bin('capture-event.js')} --type mcp_failure --tool anthropic-router 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'Bash',
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} capture node ${bin('capture-event.js')} --type hook_failure --tool bash 2>/dev/null || true` },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: 'Bash(git push*)',
        hooks: [
          { type: 'command', command: `node ${bin('git-queue-advisor.js')} push 2>&1 || true` },
        ],
      },
      {
        matcher: 'Bash',
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} health node ${bin('health-check.js')} 2>&1 || true` },
          { type: 'command', command: `node ${bin('process-guard.js')} map node ${bin('validate-map.js')} 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'Read',
        hooks: [
          { type: 'command', command: `node ${bin('guard-read.js')} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: `node ${bin('ponytail-check.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('dependency-tracer.js')} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('pre-commit-tdd.js')} "$CLAUDE_TOOL_INPUT_file_path"` },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Bash(git pull*)',
        hooks: [
          { type: 'command', command: `node ${bin('git-queue-advisor.js')} pull 2>&1 || true` },
        ],
      },
      {
        matcher: 'Bash|Read|Write|Edit|Agent',
        hooks: [
          { type: 'command', command: `node ${bin('agent-metrics.js')} record --tool "$CLAUDE_TOOL_NAME" --status ok 2>/dev/null || true` },
        ],
      },
      {
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: `node ${bin('process-guard.js')} lint node ${bin('detox.js')} 2>/dev/null || true` },
          { type: 'command', command: `FILE="$CLAUDE_TOOL_INPUT_file_path"; if [[ "$FILE" == *.js ]]; then node --check "$FILE" 2>&1 && echo "[syntax-ok] $FILE" || echo "[syntax-error] $FILE"; fi` },
          { type: 'command', command: `node ${bin('process-guard.js')} lint node ${bin('standards-guard.js')} "$CLAUDE_TOOL_INPUT_file_path"` },
          { type: 'command', command: `node ${bin('process-guard.js')} map node ${bin('diff-map-trigger.js')} 2>/dev/null || true` },
          { type: 'command', command: `node ${bin('process-guard.js')} lint node ${bin('security-check.js')} "$CLAUDE_TOOL_INPUT_file_path" 2>/dev/null || true` },
        ],
      },
    ],
  },
};

fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
console.log(`[setup-settings] settings.json actualizado — v3.10.0 hooks completos.`);
console.log(`[setup-settings] REPO: ${fwd(REPO)}`);
console.log(`[setup-settings] Plataforma: ${os.platform()} | Node: ${process.version}`);
