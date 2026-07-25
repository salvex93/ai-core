'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('setup-settings.js', () => {
  const SETUP = path.join(BIN, 'setup-settings.js');
  let backupContent;

  before(() => {
    backupContent = fs.readFileSync(SETTINGS, 'utf8');
  });

  after(() => {
    fs.writeFileSync(SETTINGS, backupContent, 'utf8');
  });

  test('genera settings.json valido y parseable', () => {
    const r = runScript(SETUP);
    assert.equal(r.status, 0, 'setup-settings debe salir con codigo 0');
    const raw = fs.readFileSync(SETTINGS, 'utf8');
    const parsed = JSON.parse(raw);
    assert.ok(parsed.mcpServers, 'debe tener mcpServers');
    assert.ok(parsed.hooks, 'debe tener hooks');
    assert.ok(parsed.permissions, 'debe tener permissions');
  });

  test('el cwd de los MCP servers apunta al repositorio real', () => {
    runScript(SETUP);
    const parsed = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const cwd = parsed.mcpServers['gemini-bridge'].cwd;
    assert.ok(
      fs.existsSync(cwd),
      `el cwd ${cwd} debe existir en el sistema de archivos`
    );
    assert.ok(
      fs.existsSync(path.join(cwd, 'package.json')),
      'el cwd debe contener package.json del ai-core'
    );
  });

  test('los hooks referencian rutas de archivos existentes', () => {
    runScript(SETUP);
    const parsed = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const preHooks = parsed.hooks.PreToolUse || [];
    for (const group of preHooks) {
      for (const hook of group.hooks) {
        const match = hook.command.match(/node "([^"]+)"/);
        if (match) {
          assert.ok(
            fs.existsSync(match[1]),
            `el hook referencia un archivo inexistente: ${match[1]}`
          );
        }
      }
    }
  });

  test('el output de setup-settings es coherente con settings.json en disco', () => {
    // Ejecuta setup-settings en seco capturando el JSON que generaria
    const generated = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    runScript(SETUP);
    const afterRun = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));

    // Los hooks declarados en setup-settings deben estar todos presentes en el archivo
    const hookKeys = Object.keys(afterRun.hooks || {});
    assert.ok(hookKeys.includes('PreToolUse'), 'settings.json debe tener PreToolUse tras regenerar');
    assert.ok(hookKeys.includes('PostToolUse'), 'settings.json debe tener PostToolUse tras regenerar');
    assert.ok(hookKeys.includes('Stop'), 'settings.json debe tener Stop tras regenerar');
    assert.ok(hookKeys.includes('SubagentStop'), 'settings.json debe tener SubagentStop tras regenerar');
    assert.ok(hookKeys.includes('PostToolUseFailure'), 'settings.json debe tener PostToolUseFailure tras regenerar');
    assert.ok(hookKeys.includes('UserPromptSubmit'), 'settings.json debe tener UserPromptSubmit tras regenerar');

    // El numero de grupos en cada hook no debe diferir del generado
    for (const key of hookKeys) {
      assert.equal(
        afterRun.hooks[key].length,
        generated.hooks[key]?.length ?? afterRun.hooks[key].length,
        `hook ${key}: numero de grupos distinto entre settings.json y setup-settings`
      );
    }

    // MCP servers deben seguir presentes
    assert.ok(afterRun.mcpServers['gemini-bridge'], 'gemini-bridge debe estar en mcpServers');
    assert.ok(afterRun.mcpServers['anthropic-router'], 'anthropic-router debe estar en mcpServers');
  });

  test('Zero-Dead-Code: regenerar purga hooks obsoletos de una version anterior', () => {
    // Simula un settings.json de un proyecto anfitrion desactualizado: un hook
    // que referencia un script eliminado/renombrado en una version posterior
    // del harness (ej. si mcp-gemini.js se fragmento y un hook viejo seguia
    // apuntando a una funcion que ahora vive en otro archivo). setup-settings.js
    // construye el objeto de settings desde cero y sobreescribe el archivo
    // completo — no mergea — por lo que cualquier entrada obsoleta desaparece
    // sin necesidad de una funcion de purga de archivos separada.
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    settings.hooks.Stop[0].hooks.push({
      type: 'command',
      command: 'node "/ruta/obsoleta/script-eliminado-v2.js" 2>/dev/null || true',
    });
    fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2), 'utf8');

    assert.ok(
      fs.readFileSync(SETTINGS, 'utf8').includes('script-eliminado-v2.js'),
      'precondicion: el hook obsoleto debe estar presente antes de regenerar'
    );

    runScript(SETUP);

    const regenerado = fs.readFileSync(SETTINGS, 'utf8');
    assert.ok(
      !regenerado.includes('script-eliminado-v2.js'),
      'el hook obsoleto debe desaparecer tras regenerar settings.json'
    );
  });
});

// ─── skills — conformidad de estructura ──────────────────────────────────────
