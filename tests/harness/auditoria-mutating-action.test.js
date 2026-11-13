'use strict';

/**
 * Regresion de la auditoria: mutating-action-guard dejaba pasar herramientas
 * MCP mutantes (verbo precedido por "_", servidor con "_", verbos send/edit/
 * push...), solicitudes HTTP mutantes con comillas, --request=VERBO o POST
 * implicito por -d, y su hash de aprobacion ignoraba tool_input.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { spawnSync } = require('node:child_process');
const { BIN } = require('./_shared');

const GUARD = path.join(BIN, 'mutating-action-guard.js');

function correr(evento) {
  return spawnSync('node', [GUARD], { input: JSON.stringify({ agent_type: 'general-purpose', ...evento }), encoding: 'utf8', env: { ...process.env, AI_CORE_TEST_MODE: '1' } });
}

const mcp = (tool_name, tool_input = {}) => correr({ tool_name, tool_input });
const bash = (command) => correr({ tool_name: 'Bash', tool_input: { command } });

describe('mutating-action-guard: herramientas MCP', () => {
  for (const t of [
    'mcp__linear__linear_create_issue',
    'mcp__claude_ai_Slack__slack_send_message',
    'mcp__claude_ai_Notion__notion-update-page',
    'mcp__github__push_files',
    'mcp__github__editFile',
    'mcp__server__delete_item',
  ]) {
    test(`bloquea ${t}`, () => assert.equal(mcp(t).status, 2, t));
  }

  for (const t of [
    'mcp__claude_ai_Slack__slack_read_channel',
    'mcp__github__get_file_contents',
    'mcp__postgres__list_postgres_tables',
    'mcp__server__search_items',
  ]) {
    test(`error: permite la lectura ${t}`, () => assert.equal(mcp(t).status, 0, t));
  }

  test('la aprobacion depende de tool_input: otra entrada no hereda la confirmacion', () => {
    const a = mcp('mcp__linear__linear_create_issue', { title: 'A' });
    const b = mcp('mcp__linear__linear_create_issue', { title: 'B' });
    const idA = a.stderr.match(/CONFIRMAR-([\w-]+)/)?.[1];
    const idB = b.stderr.match(/CONFIRMAR-([\w-]+)/)?.[1];
    assert.ok(idA && idB);
    assert.notEqual(idA, idB, 'cada accion distinta solicita su propia confirmacion');
  });
});

describe('mutating-action-guard: solicitudes HTTP mutantes por Bash', () => {
  for (const cmd of [
    "curl -X 'POST' https://api.example/x",
    'curl --request=DELETE https://api.example/x',
    'curl -d @datos.json https://api.example/x',
    'curl --data-raw "a=1" https://api.example/x',
    'curl --json \'{"a":1}\' https://api.example/x',
    'curl -F file=@a.txt https://api.example/x',
    'wget --post-data="a=1" https://api.example/x',
  ]) {
    test(`bloquea: ${cmd}`, () => assert.equal(bash(cmd).status, 2, cmd));
  }

  for (const cmd of ['curl https://api.example/x', 'curl -s -o /dev/null https://api.example/x', 'wget https://api.example/x']) {
    test(`error: permite ${cmd}`, () => assert.equal(bash(cmd).status, 0, cmd));
  }
});
