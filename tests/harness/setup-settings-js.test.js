'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, MCP_JSON, runScript, tmpFile } = require('./_shared');

describe('setup-settings.js', () => {
  const SETUP = path.join(BIN, 'setup-settings.js');

  // G26: cada test corre setup-settings.js contra un TARGET_DIR aislado
  // (AI_CORE_SETTINGS_TARGET_DIR) en vez del settings.json/.mcp.json reales
  // del repo -- antes esto mutaba el estado real durante toda la ejecucion
  // del archivo, con riesgo de colision bajo node --test en paralelo (otros
  // archivos que leen SETTINGS podian ver un estado transitorio). Sin .git/
  // en el target, setup-settings.js tampoco toca git config real (mismo
  // camino ya usado para instalacion como submodulo sin .git propio).
  function nuevoTarget() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-settings-target-'));
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.copyFileSync(SETTINGS, path.join(dir, '.claude', 'settings.json'));
    if (fs.existsSync(MCP_JSON)) fs.copyFileSync(MCP_JSON, path.join(dir, '.mcp.json'));
    return dir;
  }

  function runSetup(dir, extraEnv = {}) {
    return runScript(SETUP, [], { AI_CORE_SETTINGS_TARGET_DIR: dir, ...extraEnv });
  }

  function settingsDe(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'));
  }

  function mcpJsonDe(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8'));
  }

  test('genera settings.json valido y parseable', () => {
    const dir = nuevoTarget();
    const r = runSetup(dir);
    assert.equal(r.status, 0, 'setup-settings debe salir con codigo 0');
    const parsed = settingsDe(dir);
    assert.ok(!parsed.mcpServers, 'settings.json no debe tener mcpServers -- sin efecto real, ver .mcp.json (G12)');
    assert.ok(parsed.hooks, 'debe tener hooks');
    assert.ok(parsed.permissions, 'debe tener permissions');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('genera .mcp.json valido y parseable con ambos servidores', () => {
    const dir = nuevoTarget();
    runSetup(dir);
    const parsed = mcpJsonDe(dir);
    assert.ok(parsed.mcpServers['gemini-bridge'], 'debe tener gemini-bridge');
    assert.ok(parsed.mcpServers['anthropic-router'], 'debe tener anthropic-router');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('autoCompactWindow fijado por debajo del default (~95%) de Claude Code -- gap de mercado cerrado 2026-09-01', () => {
    // Investigacion comparativa (Cline/OpenCode, gist de context compaction)
    // confirmo que el umbral por defecto de Claude Code (~95% de la ventana)
    // "a menudo es demasiado tarde" segun feedback de usuarios documentado.
    // Sin fijarlo explicitamente, el arnes deja pasar el default nativo en
    // vez de compactar antes y estirar mas la cuota de sesion (Plan Pro).
    const dir = nuevoTarget();
    runSetup(dir);
    const parsed = settingsDe(dir);
    assert.ok(parsed.autoCompactWindow, 'debe declarar autoCompactWindow explicitamente, no depender del default nativo');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('el cwd de los MCP servers apunta al repositorio real', () => {
    const dir = nuevoTarget();
    runSetup(dir);
    const parsed = mcpJsonDe(dir);
    const cwd = parsed.mcpServers['gemini-bridge'].cwd;
    assert.ok(
      fs.existsSync(cwd),
      `el cwd ${cwd} debe existir en el sistema de archivos`
    );
    assert.ok(
      fs.existsSync(path.join(cwd, 'package.json')),
      'el cwd debe contener package.json del ai-core'
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('los hooks referencian rutas de archivos existentes', () => {
    const dir = nuevoTarget();
    runSetup(dir);
    const parsed = settingsDe(dir);
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
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('el output de setup-settings es coherente con settings.json en disco', () => {
    const dir = nuevoTarget();
    // Ejecuta setup-settings en seco capturando el JSON que generaria
    const generated = settingsDe(dir);
    runSetup(dir);
    const afterRun = settingsDe(dir);

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

    // MCP servers deben seguir presentes en .mcp.json (no en settings.json)
    const mcpJson = mcpJsonDe(dir);
    assert.ok(mcpJson.mcpServers['gemini-bridge'], 'gemini-bridge debe estar en .mcp.json');
    assert.ok(mcpJson.mcpServers['anthropic-router'], 'anthropic-router debe estar en .mcp.json');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('Zero-Dead-Code: regenerar purga hooks obsoletos de una version anterior', () => {
    // Simula un settings.json de un proyecto anfitrion desactualizado: un hook
    // que referencia un script eliminado/renombrado en una version posterior
    // del harness (ej. si mcp-gemini.js se fragmento y un hook viejo seguia
    // apuntando a una funcion que ahora vive en otro archivo). setup-settings.js
    // construye el objeto de settings desde cero y sobreescribe el archivo
    // completo — no mergea — por lo que cualquier entrada obsoleta desaparece
    // sin necesidad de una funcion de purga de archivos separada.
    const dir = nuevoTarget();
    const settingsPath = path.join(dir, '.claude', 'settings.json');
    const settings = settingsDe(dir);
    settings.hooks.Stop[0].hooks.push({
      type: 'command',
      command: 'node "/ruta/obsoleta/script-eliminado-v2.js" 2>/dev/null || true',
    });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

    assert.ok(
      fs.readFileSync(settingsPath, 'utf8').includes('script-eliminado-v2.js'),
      'precondicion: el hook obsoleto debe estar presente antes de regenerar'
    );

    runSetup(dir);

    const regenerado = fs.readFileSync(settingsPath, 'utf8');
    assert.ok(
      !regenerado.includes('script-eliminado-v2.js'),
      'el hook obsoleto debe desaparecer tras regenerar settings.json'
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('AI_CORE_SETTINGS_TARGET_DIR aisla la escritura del settings.json/.mcp.json reales del repo (G26)', () => {
    const contenidoRealAntes = fs.readFileSync(SETTINGS, 'utf8');
    const dir = nuevoTarget();
    runSetup(dir);
    assert.equal(fs.readFileSync(SETTINGS, 'utf8'), contenidoRealAntes, 'settings.json real no debe modificarse cuando se pasa el override');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ─── skills — conformidad de estructura ──────────────────────────────────────
