'use strict';

/**
 * Regresion de la auditoria: health-sync colgaba si un servidor MCP salia con
 * codigo 0 antes de responder, y writeMcpJson sobrescribia sin respaldo un
 * .mcp.json invalido (perdiendo los servidores propios del usuario).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { checkMcpServers } = require('../../.claude/bin/health-sync');
const { writeMcpJson } = require('../../.claude/bin/lib/mcp-config');

function raizConServidores(codigo) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-health-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  for (const f of ['mcp-gemini.js', 'mcp-anthropic.js']) fs.writeFileSync(path.join(root, 'scripts', f), codigo);
  return root;
}

// Sin tope propio un chequeo colgado dejaria la prueba esperando para siempre
const conTope = (promesa, ms) => Promise.race([promesa, new Promise((_, rej) => setTimeout(() => rej(new Error(`colgado mas de ${ms}ms`)), ms))]);

describe('health-sync: servidor MCP que sale sin responder', () => {
  test('salida con codigo 0 antes de initialize se informa como ok:false', async () => {
    const root = raizConServidores('process.exit(0);');
    const res = await conTope(checkMcpServers(root), 6000);
    assert.equal(res.length, 2);
    for (const r of res) {
      assert.equal(r.ok, false);
      assert.match(r.error, /exit code 0|salio/);
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('salida con codigo distinto de cero sigue informando el codigo', async () => {
    const root = raizConServidores('process.exit(3);');
    const res = await conTope(checkMcpServers(root), 6000);
    for (const r of res) assert.match(r.error, /exit code 3/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('writeMcpJson: .mcp.json invalido', () => {
  test('se aparta con respaldo .corrupt-* en lugar de perderse, y se escribe uno valido', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-json-'));
    const ruta = path.join(dir, '.mcp.json');
    const original = '{"mcpServers": {"propio": {"command": "x"}';
    fs.writeFileSync(ruta, original);
    const r = writeMcpJson(dir, '/repo/ai-core');
    assert.equal(r.written, true);
    const respaldo = fs.readdirSync(dir).find((f) => f.startsWith('.mcp.json.corrupt-'));
    assert.ok(respaldo, 'debe existir el respaldo');
    assert.equal(fs.readFileSync(path.join(dir, respaldo), 'utf8'), original);
    assert.ok(JSON.parse(fs.readFileSync(ruta, 'utf8')).mcpServers['gemini-bridge']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('error: un .mcp.json valido no genera respaldo y conserva servidores propios', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-json-'));
    fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { propio: { command: 'x' } } }));
    writeMcpJson(dir, '/repo/ai-core');
    assert.equal(fs.readdirSync(dir).some((f) => f.includes('.corrupt-')), false);
    assert.ok(JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8')).mcpServers.propio);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
