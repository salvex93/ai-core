'use strict';

function parseClaudeJson(stdout) {
  let j;
  try { j = JSON.parse(stdout); } catch { return { error: 'salida no es JSON' }; }
  const u = j.usage || {};
  return {
    sessionId: j.session_id ?? null,
    text: typeof j.result === 'string' ? j.result : '',
    costUsd: j.total_cost_usd ?? null,
    turns: j.num_turns ?? null,
    tokens: {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    },
    error: j.is_error ? String(j.result || 'is_error').slice(0, 200) : null,
  };
}

// Sin formato de uso verificado solo se mide tiempo y exito
function parseWallOnly() {
  return { costUsd: null, turns: null, tokens: null, error: null };
}

const PARSERS = { 'claude-json': parseClaudeJson, 'wall-only': parseWallOnly };

module.exports = { PARSERS, parseClaudeJson };
