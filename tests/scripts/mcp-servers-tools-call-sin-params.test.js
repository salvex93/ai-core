'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');

function enviarMensaje(scriptRelativo, mensaje) {
  return spawnSync('node', [path.join(REPO, scriptRelativo)], {
    input: JSON.stringify(mensaje) + '\n',
    encoding: 'utf8',
    cwd: REPO,
    env: { ...process.env, AI_CORE_TEST_MODE: '1' },
    timeout: 5000,
  });
}

for (const script of ['scripts/mcp-gemini.js', 'scripts/mcp-anthropic.js']) {
  describe(`${script} — tools/call sin params`, () => {
    test('responde un error JSON-RPC en vez de colgar la request sin respuesta', () => {
      const r = enviarMensaje(script, { jsonrpc: '2.0', id: 5, method: 'tools/call' });

      assert.equal(r.error, undefined, `el proceso no debe crashear: ${r.stderr}`);
      assert.ok(r.stdout && r.stdout.trim().length > 0, 'debe escribir una respuesta a stdout para el id=5');

      const respuesta = JSON.parse(r.stdout.trim().split('\n')[0]);
      assert.equal(respuesta.id, 5);
      assert.ok(respuesta.error, 'debe responder con un objeto error JSON-RPC, no quedar sin respuesta');
    });
  });
}
