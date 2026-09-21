'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { execSync, spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('norm-harness.js — settings del anfitrion', () => {
  const SCRIPT = path.join(BIN, 'norm-harness.js');
  let tmpHost;
  function crearProyectoAnfitrionTemporal() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'norm-harness-test-'));
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    execSync('git add package.json', { cwd: dir });
    execSync('git commit -q -m "inicial"', { cwd: dir });
    return dir;
  }

  after(() => { if (tmpHost) fs.rmSync(tmpHost, { recursive: true, force: true }); });

  describe('settings.json del proyecto anfitrion — merge no destructivo', () => {
    // Hallazgo real de auditoria: ensureHostSettings() sobreescribia el objeto
    // ENTERO con buildSettingsForHost() cuando needsWrite era true (path drift
    // o permiso de stack nuevo), perdiendo cualquier hook, mcpServer o permiso
    // custom que el anfitrion hubiera agregado a mano. El mismo patron de
    // "preservar contenido existente del usuario" ya usado en .gitignore
    // arriba debe aplicar aqui.

    function leerSettings(dir) {
      return JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'));
    }

    test('preserva un hook custom del anfitrion al forzar needsWrite (permiso de stack nuevo)', () => {
      tmpHost = crearProyectoAnfitrionTemporal();
      const claudeDir = path.join(tmpHost, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
        mcpServers: { 'gemini-bridge': { cwd: 'ruta-vieja-que-fuerza-drift' } },
        permissions: { allow: ['Bash(npx*)'] },
        hooks: { PreToolUse: [{ matcher: 'CustomTool', hooks: [{ type: 'command', command: 'node mi-hook-custom.js' }] }] },
      }, null, 2));

      const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });
      assert.equal(r.status, 0, `debe terminar sin error (stderr: ${r.stderr})`);

      const settings = leerSettings(tmpHost);
      assert.match(JSON.stringify(settings.hooks), /mi-hook-custom\.js/, 'el hook custom del anfitrion debe sobrevivir al merge');
    });

    test('preserva un mcpServer custom del anfitrion', () => {
      tmpHost = crearProyectoAnfitrionTemporal();
      const claudeDir = path.join(tmpHost, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
        mcpServers: {
          'gemini-bridge': { cwd: 'ruta-vieja-que-fuerza-drift' },
          'mcp-propio-del-anfitrion': { command: 'node', args: ['propio.js'] },
        },
        permissions: { allow: [] },
        hooks: {},
      }, null, 2));

      spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

      const settings = leerSettings(tmpHost);
      assert.ok(settings.mcpServers['mcp-propio-del-anfitrion'], 'el mcpServer custom del anfitrion debe sobrevivir al merge');
    });

    test('permissions.allow se une (custom + stack), nunca se reemplaza', () => {
      tmpHost = crearProyectoAnfitrionTemporal();
      const claudeDir = path.join(tmpHost, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
        mcpServers: { 'gemini-bridge': { cwd: 'ruta-vieja-que-fuerza-drift' } },
        permissions: { allow: ['Bash(mi-comando-custom*)'] },
        hooks: {},
      }, null, 2));

      spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

      const settings = leerSettings(tmpHost);
      assert.ok(settings.permissions.allow.includes('Bash(mi-comando-custom*)'), 'el permiso custom del anfitrion debe sobrevivir');
      assert.ok(settings.permissions.allow.includes('Bash(npx*)'), 'los permisos de stack detectados deben seguir agregandose');
    });

    test('crea un backup .bak del settings.json anterior antes de sobreescribir', () => {
      tmpHost = crearProyectoAnfitrionTemporal();
      const claudeDir = path.join(tmpHost, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      const settingsPath = path.join(claudeDir, 'settings.json');
      const original = JSON.stringify({
        mcpServers: { 'gemini-bridge': { cwd: 'ruta-vieja-que-fuerza-drift' } },
        permissions: { allow: [] },
        hooks: {},
      }, null, 2);
      fs.writeFileSync(settingsPath, original);

      spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

      assert.ok(fs.existsSync(`${settingsPath}.bak`), 'debe dejar un backup .bak del settings.json previo a la escritura');
      assert.equal(fs.readFileSync(`${settingsPath}.bak`, 'utf8'), original, 'el backup debe ser una copia fiel del contenido anterior');
    });

    test('no crea backup si settings.json no existia previamente (primera corrida)', () => {
      tmpHost = crearProyectoAnfitrionTemporal();
      spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

      const settingsPath = path.join(tmpHost, '.claude', 'settings.json');
      assert.ok(fs.existsSync(settingsPath));
      assert.ok(!fs.existsSync(`${settingsPath}.bak`), 'no hay nada que respaldar en la primera corrida');
    });

    test('segunda corrida sin drift no reescribe ni genera backup nuevo', () => {
      tmpHost = crearProyectoAnfitrionTemporal();
      spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });
      const settingsPath = path.join(tmpHost, '.claude', 'settings.json');
      const primeraCorrida = fs.readFileSync(settingsPath, 'utf8');

      spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });
      const segundaCorrida = fs.readFileSync(settingsPath, 'utf8');

      assert.equal(segundaCorrida, primeraCorrida, 'sin drift, la segunda corrida no debe modificar settings.json');
      assert.ok(!fs.existsSync(`${settingsPath}.bak`), 'sin escritura no debe generarse backup');
    });
  });
});
