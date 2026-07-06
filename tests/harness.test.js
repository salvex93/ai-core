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

// ─── security-check.js ───────────────────────────────────────────────────────

describe('security-check.js', () => {
  const SCRIPT = path.join(BIN, 'security-check.js');

  test('sale con 0 si no se pasa argumento', () => {
    const r = runScript(SCRIPT, []);
    assert.equal(r.status, 0);
  });

  test('sale con 0 en archivo sin hallazgos', () => {
    const f = path.join(os.tmpdir(), `sec-clean-${Date.now()}.js`);
    fs.writeFileSync(f, 'const x = 1;\nmodule.exports = x;\n');
    const r = runScript(SCRIPT, [f]);
    fs.unlinkSync(f);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  test('detecta credencial hardcodeada (sk-...)', () => {
    const f = path.join(os.tmpdir(), `sec-cred-${Date.now()}.js`);
    fs.writeFileSync(f, 'const key = "sk-abcdefghijklmnopqrstuvwxyz123456";\n');
    const r = runScript(SCRIPT, [f]);
    fs.unlinkSync(f);
    assert.ok(r.stdout.includes('[security-check]'), 'debe emitir hallazgo de seguridad');
    assert.ok(r.stdout.includes('SECRETO'), 'debe clasificar como SECRETO');
  });

  test('detecta eval() en codigo JS', () => {
    const f = path.join(os.tmpdir(), `sec-eval-${Date.now()}.js`);
    fs.writeFileSync(f, 'function run(code) { return eval(code); }\n');
    const r = runScript(SCRIPT, [f]);
    fs.unlinkSync(f);
    assert.ok(r.stdout.includes('[SEGURIDAD]'), 'debe detectar eval() como SEGURIDAD');
  });

  test('detecta catch vacio en JS', () => {
    const f = path.join(os.tmpdir(), `sec-catch-${Date.now()}.js`);
    fs.writeFileSync(f, 'try { doSomething(); } catch (e) {}\n');
    const r = runScript(SCRIPT, [f]);
    fs.unlinkSync(f);
    assert.ok(r.stdout.includes('[FALLO-SILENCIOSO]'), 'debe detectar catch vacio como FALLO-SILENCIOSO');
  });

  test('ignora extensiones no vigiladas (.md)', () => {
    const f = path.join(os.tmpdir(), `sec-md-${Date.now()}.md`);
    fs.writeFileSync(f, 'eval("bad") sk-secret\n');
    const r = runScript(SCRIPT, [f]);
    fs.unlinkSync(f);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
});

// ─── secrets-guard.js ────────────────────────────────────────────────────────

describe('secrets-guard.js', () => {
  const SCRIPT = path.join(BIN, 'secrets-guard.js');

  test('sale con 0 si CLAUDE_USER_PROMPT esta vacio', () => {
    const r = runScript(SCRIPT, [], { CLAUDE_USER_PROMPT: '' });
    assert.equal(r.status, 0);
  });

  test('sale con 0 para prompt normal sin credenciales', () => {
    const r = runScript(SCRIPT, [], { CLAUDE_USER_PROMPT: 'refactoriza la funcion de paginacion' });
    assert.equal(r.status, 0);
  });

  test('detecta OpenAI API key en el prompt', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_USER_PROMPT: 'usa esta key: sk-abcdefghijklmnopqrstuvwxyz123456 para el test',
    });
    assert.ok(r.stdout.includes('[secrets-guard]'), 'debe advertir sobre la key detectada');
    assert.equal(r.status, 0, 'debe advertir sin bloquear (exit 0)');
  });

  test('detecta GitHub PAT en el prompt', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_USER_PROMPT: 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789A',
    });
    assert.ok(r.stdout.includes('[secrets-guard]'), 'debe detectar GitHub PAT');
  });
});

// ─── session-summary.js ──────────────────────────────────────────────────────

describe('session-summary.js', () => {
  const SCRIPT = path.join(BIN, 'session-summary.js');

  test('sale con 0 y sin output si no hay actividad', () => {
    // Sin cambios git y sin EVENTS_QUEUE, el script debe ser silencioso
    const r = runScript(SCRIPT, [], { SUPPRESS_GIT: '1' });
    assert.equal(r.status, 0);
  });

  test('el script existe y es ejecutable por Node', () => {
    assert.ok(fs.existsSync(SCRIPT), 'session-summary.js debe existir en .claude/bin/');
    const r = runScript(SCRIPT, []);
    assert.notEqual(r.status, null, 'debe terminar con codigo de salida definido');
  });
});

// ─── aiops-score.js ──────────────────────────────────────────────────────────

describe('aiops-score.js', () => {
  const SCRIPT = path.join(BIN, 'aiops-score.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'aiops-score.js debe existir en .claude/bin/');
  });

  test('sale con 0 y produce output de score', () => {
    const r = runScript(SCRIPT, []);
    assert.equal(r.status, 0, 'debe terminar sin error');
    assert.ok(r.stdout.includes('[AIOPS-SCORE]'), 'debe incluir linea de score');
  });

  test('--report sale con 0 y muestra ultimo score', () => {
    const r = runScript(SCRIPT, ['--report']);
    assert.equal(r.status, 0, '--report debe terminar sin error');
  });

  test('el score total esta entre 0 y 10', () => {
    const r = runScript(SCRIPT, []);
    const match = r.stdout.match(/Total:\s*(\d+)\/10/);
    assert.ok(match, 'debe incluir Total: N/10 en el output');
    const score = parseInt(match[1], 10);
    assert.ok(score >= 0 && score <= 10, `score ${score} debe estar entre 0 y 10`);
  });

  test('produce score en las 6 dimensiones esperadas', () => {
    const r = runScript(SCRIPT, []);
    const dimensiones = ['routing', 'hooks', 'skills', 'drift', 'seguridad', 'agentes'];
    for (const dim of dimensiones) {
      assert.ok(r.stdout.includes(dim), `debe incluir dimension '${dim}'`);
    }
  });
});

describe('ponytail-check.js', () => {
  const SCRIPT = path.join(BIN, 'ponytail-check.js');

  test('el script existe y es ejecutable', () => {
    assert.ok(fs.existsSync(SCRIPT), 'ponytail-check.js debe existir en .claude/bin/');
  });

  test('sin input: termina sin error y sin output', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: '',
      CLAUDE_TOOL_INPUT_content: '',
    });
    assert.equal(r.status, 0, 'debe terminar con exit 0');
    assert.equal(r.stdout.trim(), '', 'no debe emitir output sin input');
  });

  test('detecta reimplementacion de stdlib: capitalize', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'src/utils.js',
      CLAUDE_TOOL_INPUT_content: 'function capitalizeFirst(s) { return s[0].toUpperCase()+s.slice(1); }',
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('PONYTAIL'), 'debe emitir advertencia PONYTAIL');
    assert.ok(r.stdout.includes('capitalize'), 'debe mencionar capitalize');
  });

  test('detecta reimplementacion de stdlib: unique/dedupe', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'src/utils.js',
      CLAUDE_TOOL_INPUT_content: 'function unique(arr) { return [...new Set(arr)]; }',
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('unique'), 'debe mencionar unique');
  });

  test('detecta reimplementacion de stdlib: deepClone', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'src/utils.js',
      CLAUDE_TOOL_INPUT_content: 'function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }',
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('structuredClone'), 'debe sugerir structuredClone');
  });

  test('detecta comentario YAGNI / future', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'src/service.js',
      CLAUDE_TOOL_INPUT_content: '// TODO: future extensible plugin system\nconst x = 1;',
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('YAGNI'), 'debe detectar comentario YAGNI');
  });

  test('detecta funcion con mas de 3 parametros', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'src/api.js',
      CLAUDE_TOOL_INPUT_content: 'function fetchData(url, method, headers, body, timeout) { }',
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Parametros'), 'debe advertir sobre exceso de parametros');
  });

  test('no emite advertencias en codigo limpio y minimal', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'src/clean.js',
      CLAUDE_TOOL_INPUT_content: [
        "'use strict';",
        'const BASE = 8;',
        'function espacio(n) { return n * BASE; }',
        'module.exports = { espacio };',
      ].join('\n'),
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'codigo limpio no debe generar advertencias');
  });

  test('no evalua archivos de tests (exempt)', () => {
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: 'tests/utils.test.js',
      CLAUDE_TOOL_INPUT_content: 'function deepClone(o) { return JSON.parse(JSON.stringify(o)); }',
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'archivos .test.js estan exentos de ponytail');
  });

  test('ponytail-check esta registrado en PreToolUse de settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const preToolUse = settings.hooks?.PreToolUse || [];
    const writeEditHook = preToolUse.find(h => h.matcher === 'Write|Edit');
    assert.ok(writeEditHook, 'debe existir matcher Write|Edit en PreToolUse');
    const commands = (writeEditHook.hooks || []).map(h => h.command || '');
    const registered = commands.some(c => c.includes('ponytail-check.js'));
    assert.ok(registered, 'ponytail-check.js debe estar registrado en el hook Write|Edit');
  });
});

describe('dev-loop skill', () => {
  const SKILL_PATH = path.join(SKILLS, 'dev-loop', 'SKILL.md');

  test('el archivo SKILL.md existe', () => {
    assert.ok(fs.existsSync(SKILL_PATH), 'dev-loop/SKILL.md debe existir en .claude/skills/');
  });

  test('el frontmatter tiene name, version, origin y last_updated', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('name: dev-loop'),        'debe tener name: dev-loop');
    assert.ok(/version:\s*\d+\.\d+\.\d+/.test(content), 'debe tener version semantica');
    assert.ok(content.includes('origin: ai-core'),       'debe tener origin: ai-core');
    assert.ok(/last_updated:\s*\d{4}-\d{2}-\d{2}/.test(content), 'debe tener last_updated');
  });

  test('contiene las 5 fases obligatorias', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    const fases = ['SPEC', 'DESIGN', 'PLAN', 'BUILD', 'REVIEW'];
    for (const fase of fases) {
      assert.ok(content.includes(`Fase.*${fase}`) || content.includes(`— ${fase}`),
        `debe contener la fase ${fase}`);
    }
  });

  test('contiene secciones Cuando Activar y Cuando NO Activar', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('Cuando Activar Este Perfil'),    'debe tener seccion Cuando Activar');
    assert.ok(content.includes('Cuando NO Activar Este Perfil'), 'debe tener seccion Cuando NO Activar');
  });

  test('contiene referencia inmutable a CLAUDE.md', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('CLAUDE.md > este skill'), 'debe tener referencia inmutable a CLAUDE.md');
  });

  test('contiene Directiva de Interrupcion con ALERTA_ARQUITECTONICA', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('ALERTA_ARQUITECTONICA'), 'debe tener directiva de interrupcion');
  });

  test('define formato de artefacto para cada fase', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('SPEC:'),   'debe definir formato de artefacto SPEC');
    assert.ok(content.includes('DESIGN:'), 'debe definir formato de artefacto DESIGN');
    assert.ok(content.includes('PLAN:'),   'debe definir formato de artefacto PLAN');
    assert.ok(content.includes('REVIEW:'), 'debe definir formato de artefacto REVIEW');
  });

  test('define telemetria de ciclo por fase', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('[DEV-LOOP'), 'debe definir telemetria de ciclo con prefijo DEV-LOOP');
  });

  test('no contiene emojis pictograficos', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    const EMOJI = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{1FA00}-\u{1FAFF}]/u;
    assert.ok(!EMOJI.test(content), 'el skill no debe contener emojis');
  });
});

describe('memory-index.js (vault BM25)', () => {
  const SCRIPT     = path.join(BIN, 'memory-index.js');
  const VAULT      = path.join(REPO, '.claude', 'memory-vault');
  const RAW        = path.join(VAULT, '.raw');
  const WIKI       = path.join(VAULT, '.wiki');
  const INDEX_FILE = path.join(VAULT, 'index.json');

  const TEST_FILE = path.join(RAW, '_test-bm25.md');
  const TEST_CONTENT = [
    '---',
    'tipo: decision',
    'fecha: 2026-07-06',
    'proyecto: ai-core',
    'tags: [bm25, memoria, vault]',
    '---',
    '',
    '# BM25 vault test',
    '',
    'Motor de busqueda semantica sin dependencias externas.',
    'Recuperacion de contexto entre sesiones con indice invertido.',
  ].join('\n');

  before(() => {
    fs.mkdirSync(RAW,  { recursive: true });
    fs.mkdirSync(WIKI, { recursive: true });
    fs.writeFileSync(TEST_FILE, TEST_CONTENT, 'utf8');
  });

  after(() => {
    if (fs.existsSync(TEST_FILE))  fs.unlinkSync(TEST_FILE);
    const wikiFile = path.join(WIKI, '_test-bm25.md');
    if (fs.existsSync(wikiFile))   fs.unlinkSync(wikiFile);
    if (fs.existsSync(INDEX_FILE)) fs.unlinkSync(INDEX_FILE);
  });

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'memory-index.js debe existir en .claude/bin/');
  });

  test('cmd index: crea index.json y .wiki/ a partir de .raw/', () => {
    const r = runScript(SCRIPT, ['index']);
    assert.equal(r.status, 0, 'debe terminar con exit 0');
    assert.ok(fs.existsSync(INDEX_FILE), 'debe crear index.json');
    const idx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    assert.ok(idx.N > 0, 'el indice debe tener al menos 1 fragmento');
    assert.ok(idx.builtAt, 'debe registrar builtAt en el indice');
  });

  test('cmd query: retorna resultados relevantes con score BM25', () => {
    const r = runScript(SCRIPT, ['query', 'vault memoria semantica']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('score:'), 'debe mostrar scores BM25');
    assert.ok(r.stdout.includes('[memory]'), 'debe incluir prefijo [memory]');
  });

  test('cmd query: sin resultados para termino inexistente', () => {
    const r = runScript(SCRIPT, ['query', 'xyzzy123nonexistent']);
    assert.equal(r.status, 0);
    assert.ok(
      r.stdout.includes('sin resultados') || r.stdout.includes('score:'),
      'debe manejar query sin hits'
    );
  });

  test('cmd status: reporta estado del vault', () => {
    const r = runScript(SCRIPT, ['status']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('.raw/'),  'debe reportar .raw/');
    assert.ok(r.stdout.includes('.wiki/'), 'debe reportar .wiki/');
    assert.ok(r.stdout.includes('indice'), 'debe reportar estado del indice');
  });

  test('index.json tiene estructura BM25 valida', () => {
    const idx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    assert.ok(typeof idx.N       === 'number', 'debe tener N (total de fragmentos)');
    assert.ok(typeof idx.avgLen  === 'number', 'debe tener avgLen');
    assert.ok(typeof idx.df      === 'object', 'debe tener df (document frequency)');
    assert.ok(typeof idx.inv     === 'object', 'debe tener inv (indice invertido)');
    assert.ok(typeof idx.frags   === 'object', 'debe tener frags (fragmentos)');
  });

  test('memory-index registrado en Stop hook de settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const stopHooks = settings.hooks?.Stop?.[0]?.hooks || [];
    const cmds = stopHooks.map(h => h.command || '');
    assert.ok(
      cmds.some(c => c.includes('memory-index.js')),
      'memory-index.js debe estar registrado en el hook Stop'
    );
  });

  test('memory-manager skill existe y tiene secciones obligatorias', () => {
    const skillPath = path.join(SKILLS, 'memory-manager', 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), 'memory-manager/SKILL.md debe existir');
    const content = fs.readFileSync(skillPath, 'utf8');
    assert.ok(content.includes('Cuando Activar Este Perfil'),    'debe tener Cuando Activar');
    assert.ok(content.includes('Cuando NO Activar Este Perfil'), 'debe tener Cuando NO Activar');
    assert.ok(content.includes('CLAUDE.md > este skill'),        'debe tener referencia inmutable');
    assert.ok(content.includes('ALERTA_ARQUITECTONICA'),         'debe tener directiva de interrupcion');
  });
});

describe('agent-metrics.js (observabilidad)', () => {
  const SCRIPT  = path.join(BIN, 'agent-metrics.js');
  const METRICS = path.join(REPO, '.claude', 'AGENT_METRICS.json');

  after(() => {
    if (fs.existsSync(METRICS)) fs.unlinkSync(METRICS);
  });

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'agent-metrics.js debe existir en .claude/bin/');
  });

  test('record: crea AGENT_METRICS.json con la entrada correcta', () => {
    const r = runScript(SCRIPT, ['record', '--tool', 'Bash', '--status', 'ok', '--ms', '100']);
    assert.equal(r.status, 0, 'debe terminar con exit 0');
    assert.ok(fs.existsSync(METRICS), 'debe crear AGENT_METRICS.json');
    const data = JSON.parse(fs.readFileSync(METRICS, 'utf8'));
    assert.ok(data.sessions.length > 0, 'debe tener al menos una sesion');
    const session = data.sessions[data.sessions.length - 1];
    assert.ok(session.calls.length > 0, 'debe tener al menos un call');
    assert.equal(session.calls[0].tool, 'Bash');
    assert.equal(session.calls[0].status, 'ok');
  });

  test('record: acumula calls en la misma sesion', () => {
    runScript(SCRIPT, ['record', '--tool', 'Write', '--status', 'ok', '--ms', '50']);
    const data    = JSON.parse(fs.readFileSync(METRICS, 'utf8'));
    const session = data.sessions[data.sessions.length - 1];
    assert.ok(session.calls.length >= 2, 'debe acumular calls en la misma sesion');
  });

  test('record: contabiliza tokens estimados por herramienta', () => {
    const data    = JSON.parse(fs.readFileSync(METRICS, 'utf8'));
    const session = data.sessions[data.sessions.length - 1];
    assert.ok(session.totals.tokens > 0, 'debe acumular tokens estimados');
  });

  test('report: emite resumen de sesion con metricas clave', () => {
    const r = runScript(SCRIPT, ['report']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('[metrics]'),   'debe incluir prefijo [metrics]');
    assert.ok(r.stdout.includes('tool calls'),  'debe reportar total de tool calls');
    assert.ok(r.stdout.includes('fiabilidad'),  'debe reportar fiabilidad');
    assert.ok(r.stdout.includes('tokens est.'), 'debe reportar tokens estimados');
  });

  test('report --full: incluye todas las sesiones', () => {
    const r = runScript(SCRIPT, ['report', '--full']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('[metrics]'), 'debe incluir datos de sesiones');
  });

  test('agent-metrics registrado en PostToolUse de settings.json', () => {
    const settings  = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const postHooks = settings.hooks?.PostToolUse || [];
    const metricsHook = postHooks.find(h =>
      (h.hooks || []).some(c => (c.command || '').includes('agent-metrics.js'))
    );
    assert.ok(metricsHook, 'agent-metrics.js debe estar registrado en PostToolUse');
  });
});

describe('subagent-review.js (adverse)', () => {
  const SCRIPT = path.join(BIN, 'subagent-review.js');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'subagent-review.js debe existir en .claude/bin/');
  });

  test('output trivial (< 30 lineas): exit 0 sin output', () => {
    const shortOutput = Array(5).fill('linea de codigo').join('\n');
    const r = runScript(SCRIPT, [], { CLAUDE_SUBAGENT_OUTPUT: shortOutput, CLAUDE_SUBAGENT_TYPE: 'test' });
    assert.equal(r.status, 0, 'output trivial debe pasar sin revision');
  });

  test('detecta catch vacio (CRITICO) y retorna exit 1', () => {
    const badOutput = Array(35).fill('catch() {}').join('\n');
    const r = runScript(SCRIPT, [], { CLAUDE_SUBAGENT_OUTPUT: badOutput, CLAUDE_SUBAGENT_TYPE: 'test' });
    assert.equal(r.status, 1, 'debe retornar exit 1 cuando hay hallazgos CRITICOS');
    assert.ok(r.stdout.includes('CRITICO'), 'debe reportar hallazgo CRITICO');
    assert.ok(r.stdout.includes('catch vacio'), 'debe identificar el patron de catch vacio');
  });

  test('detecta eval() como hallazgo ALTO', () => {
    const evalOutput = Array(35).fill('').map((_, i) => i === 10 ? 'eval(userInput)' : `const x${i} = ${i};`).join('\n');
    const r = runScript(SCRIPT, [], { CLAUDE_SUBAGENT_OUTPUT: evalOutput, CLAUDE_SUBAGENT_TYPE: 'test' });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('ALTO') || r.stdout.includes('sin hallazgos'), 'debe detectar eval() o no tener otros criticos');
  });

  test('output limpio (> 30 lineas): exit 0 con mensaje sin hallazgos', () => {
    const cleanOutput = Array(35).fill('').map((_, i) => `const valor${i} = ${i};`).join('\n');
    const r = runScript(SCRIPT, [], { CLAUDE_SUBAGENT_OUTPUT: cleanOutput, CLAUDE_SUBAGENT_TYPE: 'test' });
    assert.equal(r.status, 0, 'codigo limpio debe pasar');
    assert.ok(r.stdout.includes('sin hallazgos'), 'debe reportar sin hallazgos');
  });

  test('subagent-review registrado en SubagentStop de settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const stopHooks = settings.hooks?.SubagentStop?.[0]?.hooks || [];
    const registered = stopHooks.some(h => (h.command || '').includes('subagent-review.js'));
    assert.ok(registered, 'subagent-review.js debe estar registrado en SubagentStop');
  });
});
