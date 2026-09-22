'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const {
  buildMcpServersBlock,
  mergeMcpServers,
  writeMcpJson,
  readGeminiBridgeCwd,
} = require('../../.claude/bin/lib/mcp-config');

describe('mcp-config.js — .mcp.json como unica ubicacion efectiva (G12)', () => {
  // Verificado contra code.claude.com/docs/en/mcp (2026-09-22): mcpServers
  // dentro de settings.json no tiene efecto real, solo .mcp.json (project
  // scope) o ~/.claude.json (local/user scope) cargan servidores MCP.

  test('buildMcpServersBlock genera gemini-bridge y anthropic-router con cwd absoluto', () => {
    const repoPath = '/ruta/de/prueba/ai-core';
    const bloque = buildMcpServersBlock(repoPath);
    assert.equal(bloque['gemini-bridge'].command, 'node');
    assert.deepEqual(bloque['gemini-bridge'].args, ['scripts/mcp-gemini.js']);
    assert.equal(bloque['gemini-bridge'].cwd, repoPath);
    assert.equal(bloque['anthropic-router'].cwd, repoPath);
  });

  test('mergeMcpServers preserva un servidor custom no generado por ai-core', () => {
    const existing = { 'mcp-propio-del-anfitrion': { command: 'node', args: ['propio.js'] } };
    const generado = { 'gemini-bridge': { command: 'node', cwd: '/x' } };
    const resultado = mergeMcpServers(existing, generado);
    assert.ok(resultado['mcp-propio-del-anfitrion'], 'el servidor custom debe sobrevivir');
    assert.ok(resultado['gemini-bridge'], 'el servidor generado debe estar presente');
  });

  test('mergeMcpServers actualiza un servidor de ai-core ya existente (ej. cwd desactualizado)', () => {
    const existing = { 'gemini-bridge': { command: 'node', cwd: '/ruta-vieja' } };
    const generado = { 'gemini-bridge': { command: 'node', cwd: '/ruta-nueva' } };
    const resultado = mergeMcpServers(existing, generado);
    assert.equal(resultado['gemini-bridge'].cwd, '/ruta-nueva');
  });

  describe('writeMcpJson', () => {
    let tmpDir;
    after(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

    test('crea .mcp.json cuando no existe', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-test-'));
      const r = writeMcpJson(tmpDir, '/ruta/ai-core');
      assert.equal(r.written, true);
      const mcpJsonPath = path.join(tmpDir, '.mcp.json');
      assert.ok(fs.existsSync(mcpJsonPath));
      const parsed = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
      assert.ok(parsed.mcpServers['gemini-bridge']);
      assert.ok(parsed.mcpServers['anthropic-router']);
    });

    test('preserva un servidor custom ya presente en .mcp.json del anfitrion', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-test-'));
      fs.writeFileSync(path.join(tmpDir, '.mcp.json'), JSON.stringify({
        mcpServers: { 'mcp-propio-del-anfitrion': { command: 'node', args: ['propio.js'] } },
      }, null, 2));

      writeMcpJson(tmpDir, '/ruta/ai-core');

      const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, '.mcp.json'), 'utf8'));
      assert.ok(parsed.mcpServers['mcp-propio-del-anfitrion'], 'debe sobrevivir al escribir');
      assert.ok(parsed.mcpServers['gemini-bridge'], 'debe agregarse ademas del custom');
    });

    test('segunda corrida sin drift no reescribe el archivo (idempotente)', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-test-'));
      writeMcpJson(tmpDir, '/ruta/ai-core');
      const primera = fs.readFileSync(path.join(tmpDir, '.mcp.json'), 'utf8');

      const r = writeMcpJson(tmpDir, '/ruta/ai-core');

      const segunda = fs.readFileSync(path.join(tmpDir, '.mcp.json'), 'utf8');
      assert.equal(r.written, false, 'sin drift no debe reportar escritura');
      assert.equal(segunda, primera, 'el contenido no debe cambiar');
    });

    test('corrige el cwd cuando .mcp.json existente tiene uno desactualizado (drift)', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-test-'));
      fs.writeFileSync(path.join(tmpDir, '.mcp.json'), JSON.stringify({
        mcpServers: { 'gemini-bridge': { command: 'node', args: ['scripts/mcp-gemini.js'], cwd: '/ruta-vieja' } },
      }, null, 2));

      const r = writeMcpJson(tmpDir, '/ruta-nueva');

      assert.equal(r.written, true);
      const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, '.mcp.json'), 'utf8'));
      assert.equal(parsed.mcpServers['gemini-bridge'].cwd, '/ruta-nueva');
    });
  });

  describe('readGeminiBridgeCwd', () => {
    let tmpDir;
    after(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

    test('devuelve null si .mcp.json no existe', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-test-'));
      assert.equal(readGeminiBridgeCwd(tmpDir), null);
    });

    test('devuelve null si .mcp.json esta mal formado', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-test-'));
      fs.writeFileSync(path.join(tmpDir, '.mcp.json'), '{ json invalido');
      assert.equal(readGeminiBridgeCwd(tmpDir), null);
    });

    test('lee el cwd real cuando .mcp.json es valido', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-test-'));
      writeMcpJson(tmpDir, '/ruta/esperada');
      assert.equal(readGeminiBridgeCwd(tmpDir), '/ruta/esperada');
    });
  });
});
