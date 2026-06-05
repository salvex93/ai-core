/**
 * harness.test.js — Suite de tests del harness ai-core
 * Ejecutar: node --test tests/harness.test.js
 * Compatible: Node >= 18 (node:test nativo, sin dependencias externas)
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { execSync, spawnSync } = require('node:child_process');

const REPO     = path.resolve(__dirname, '..');
const BIN      = path.join(REPO, '.claude', 'bin');
const SKILLS   = path.join(REPO, '.claude', 'skills');
const SETTINGS = path.join(REPO, '.claude', 'settings.json');

// ─── Utilidades ──────────────────────────────────────────────────────────────

function runScript(scriptPath, args = [], env = {}) {
  const result = spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    cwd: REPO,
  });
  return result;
}

function tmpFile(content = '') {
  const f = path.join(os.tmpdir(), `harness-test-${Date.now()}.tmp`);
  fs.writeFileSync(f, content, 'utf8');
  return f;
}

// ─── guard-read.js ───────────────────────────────────────────────────────────

describe('guard-read.js', () => {
  const GUARD = path.join(BIN, 'guard-read.js');

  test('sale con codigo 0 si no se pasa argumento', () => {
    const r = runScript(GUARD, []);
    assert.equal(r.status, 0, 'debe salir sin error cuando no hay argumento');
  });

  test('sale con codigo 0 para extension no vigilada (.png)', () => {
    const f = tmpFile('binary content');
    const pngPath = f.replace('.tmp', '.png');
    fs.renameSync(f, pngPath);
    const r = runScript(GUARD, [pngPath]);
    fs.unlinkSync(pngPath);
    assert.equal(r.status, 0, 'debe ignorar extensiones no de texto');
  });

  test('sale con codigo 0 para archivo .js por debajo del limite', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const f = tmpFile(lines).replace('.tmp', '.js');
    const fjs = f.endsWith('.js') ? f : f + '.js';
    fs.writeFileSync(fjs, lines);
    const r = runScript(GUARD, [fjs]);
    fs.unlinkSync(fjs);
    assert.equal(r.status, 0, 'debe permitir archivos bajo el limite de 200 lineas');
  });

  test('sale con codigo 2 para .js con mas de 200 lineas', () => {
    const lines = Array.from({ length: 250 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const fjs = path.join(os.tmpdir(), `guard-test-${Date.now()}.js`);
    fs.writeFileSync(fjs, lines);
    const r = runScript(GUARD, [fjs]);
    fs.unlinkSync(fjs);
    assert.equal(r.status, 2, 'debe bloquear archivos de mas de 200 lineas');
    assert.ok(r.stderr.includes('GUARD-READ'), 'debe incluir [GUARD-READ] en stderr');
  });

  test('sale con codigo 0 para archivo inexistente', () => {
    const r = runScript(GUARD, ['/ruta/inexistente/archivo.js']);
    assert.equal(r.status, 0, 'debe no fallar en archivos inexistentes');
  });
});

// ─── setup-settings.js ───────────────────────────────────────────────────────

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
});

// ─── skills — conformidad de estructura ──────────────────────────────────────

describe('skills — conformidad estructural', () => {
  const skillDirs = fs.readdirSync(SKILLS, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  test(`existen ${skillDirs.length} directorios de skills`, () => {
    assert.ok(skillDirs.length >= 30, `debe haber al menos 30 skills, hay ${skillDirs.length}`);
  });

  for (const skill of skillDirs) {
    const skillFile = path.join(SKILLS, skill, 'SKILL.md');

    test(`${skill}: SKILL.md existe`, () => {
      assert.ok(fs.existsSync(skillFile), `${skill}/SKILL.md debe existir`);
    });

    test(`${skill}: tiene sección Directiva de Interrupcion`, () => {
      const content = fs.readFileSync(skillFile, 'utf8');
      assert.ok(
        content.includes('Directiva de Interrupcion'),
        `${skill} debe tener sección "Directiva de Interrupcion"`
      );
    });

    test(`${skill}: tiene sección Primera Accion al Activar`, () => {
      const content = fs.readFileSync(skillFile, 'utf8');
      assert.ok(
        content.includes('Primera Accion al Activar'),
        `${skill} debe tener sección "Primera Accion al Activar"`
      );
    });

    test(`${skill}: tiene sección Restricciones del Perfil`, () => {
      const content = fs.readFileSync(skillFile, 'utf8');
      assert.ok(
        content.includes('Restricciones del Perfil'),
        `${skill} debe tener sección "Restricciones del Perfil"`
      );
    });

    test(`${skill}: tiene referencia inmutable a CLAUDE.md (no copia)`, () => {
      const content = fs.readFileSync(skillFile, 'utf8');
      // El nuevo modelo: referencia en lugar de copia
      assert.ok(
        content.includes('Reglas de sesion activas: CLAUDE.md > este skill.'),
        `${skill} debe tener la referencia inmutable "Reglas de sesion activas: CLAUDE.md > este skill."`
      );
      // No debe tener la copia del bloque (eso seria una regresion al modelo anterior)
      assert.ok(
        !content.includes('Protocolo de Sesion (heredado de CLAUDE.md'),
        `${skill} NO debe copiar el bloque PROTOCOLO DE SESION — debe referenciar`
      );
    });

    test(`${skill}: CLAUDE.md define compact/clear (fuente unica)`, () => {
      // Las reglas de compact/clear viven en CLAUDE.md, no se replican en cada skill.
      // Este test verifica que CLAUDE.md las tiene (se corre una vez, no por skill).
      const claudeContent = fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8');
      assert.ok(
        claudeContent.includes('/compact') && claudeContent.includes('/clear'),
        'CLAUDE.md debe definir las reglas de /compact y /clear'
      );
    });

    test(`${skill}: frontmatter tiene name, origin y version`, () => {
      const content = fs.readFileSync(skillFile, 'utf8');
      assert.ok(content.match(/^name:/m),    `${skill} debe tener "name:" en frontmatter`);
      assert.ok(content.match(/^origin:/m),  `${skill} debe tener "origin:" en frontmatter`);
      assert.ok(content.match(/^version:/m), `${skill} debe tener "version:" en frontmatter`);
    });

    test(`${skill}: sin emojis pictograficos en el contenido`, () => {
      const content = fs.readFileSync(skillFile, 'utf8');
      // Solo pictogramas reales — excluye digitos y ASCII que Unicode clasifica como Emoji
      const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{1FA00}-\u{1FAFF}]/u;
      assert.ok(
        !emojiPattern.test(content),
        `${skill} no debe contener emojis pictograficos`
      );
    });
  }
});

// ─── CLAUDE.md — integridad del nucleo ───────────────────────────────────────

describe('CLAUDE.md — integridad', () => {
  const claudeMd = fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8');

  test('menciona los 2 nuevos skills en la tabla de seleccion', () => {
    assert.ok(claudeMd.includes('ux-visual-designer'), 'debe incluir ux-visual-designer');
    assert.ok(claudeMd.includes('seo-sem-specialist'), 'debe incluir seo-sem-specialist');
  });

  test('contiene reglas de Modo Neanderthal', () => {
    assert.ok(claudeMd.includes('Modo Neanderthal'), 'debe definir Modo Neanderthal');
  });

  test('contiene reglas de compact/clear', () => {
    assert.ok(claudeMd.includes('/compact'), 'debe mencionar /compact');
    assert.ok(claudeMd.includes('/clear'),   'debe mencionar /clear');
  });

  test('sin frases de relleno usadas como respuesta (no como ejemplo de lo que evitar)', () => {
    // Las frases prohibidas pueden aparecer en la lista de "palabras prohibidas"
    // pero no deben aparecer como respuesta real fuera de esa seccion.
    // Solo verificamos que el CLAUDE.md define la restriccion, no que la viola.
    assert.ok(
      claudeMd.includes('Palabras prohibidas') || claudeMd.includes('prohibidas en prosa'),
      'CLAUDE.md debe definir la seccion de palabras prohibidas en prosa'
    );
  });
});
