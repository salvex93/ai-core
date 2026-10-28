'use strict';
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// La key se lee de .env y viaja solo al proceso hijo como CODEX_API_KEY; nunca se imprime ni se guarda
function codexEnv() {
  if (process.env.CODEX_API_KEY) return {};
  const file = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  const m = fs.readFileSync(file, 'utf8').match(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(.+?)\s*$/m);
  if (!m) return {};
  return { CODEX_API_KEY: m[1].replace(/^["']|["']$/g, '') };
}

// Sin config de usuario ni reglas globales; sandbox con escritura solo en el fixture
function codexArgs(prompt, model) {
  const args = ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '--sandbox', 'workspace-write'];
  return [...args, ...(model && model !== 'default' ? ['-m', model] : []), prompt];
}

// Codex lee AGENTS.md; el gobierno de ai-core se exporta como ese archivo, sin hooks ni skills
function installCodexAgents(workdir) {
  fs.copyFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), path.join(workdir, 'AGENTS.md'));
}

// JSON Lines: el uso viene en turn.completed.usage y el texto en item.completed de tipo agent_message
function parseCodexJsonl(stdout) {
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
  let text = '';
  let turns = 0;
  let error = null;
  for (const line of String(stdout).split('\n')) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === 'turn.completed') {
      const u = e.usage || {};
      turns += 1;
      tokens.input += u.input_tokens ?? 0;
      tokens.cacheRead += u.cached_input_tokens ?? 0;
      tokens.output += u.output_tokens ?? 0;
      tokens.reasoning += u.reasoning_output_tokens ?? 0;
    } else if (e.type === 'item.completed' && e.item && e.item.type === 'agent_message') {
      text += `${e.item.text || ''}\n`;
    } else if (e.type === 'turn.failed' || e.type === 'error') {
      error = String((e.error && e.error.message) || e.message || e.type).slice(0, 200);
    }
  }
  if (!turns && !error) error = 'sin turn.completed en la salida';
  // Codex no reporta dolares: el costo queda en null hasta aplicar una tarifa publicada
  return { sessionId: null, text: text.trim(), costUsd: null, turns, tokens, error };
}

const CODEX_ADAPTERS = {
  'codex-vanilla': {
    verified: true, parser: 'codex-jsonl', bin: 'codex',
    setup: () => {}, env: codexEnv, args: codexArgs,
  },
  'codex-ai-core': {
    verified: true, parser: 'codex-jsonl', bin: 'codex',
    setup: installCodexAgents, env: codexEnv, args: codexArgs,
  },
};

module.exports = { CODEX_ADAPTERS, parseCodexJsonl, codexArgs, codexEnv };
