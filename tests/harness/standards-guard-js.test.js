'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('standards-guard.js', () => {
  const SCRIPT = path.join(BIN, 'standards-guard.js');
  const content = fs.readFileSync(SCRIPT, 'utf8');

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'standards-guard.js debe existir en .claude/bin/');
  });

  test('el evento de captura se encola via execFileSync con array de argumentos, no execSync con template string interpolado', () => {
    // Mismo antipatron de inyeccion de comandos que issue-reporter.js:
    // fileSuffix proviene de path.relative(CORE_PATH, filePath), derivado de
    // tool_input.file_path -- si un subagente o script externo genera un
    // nombre de archivo con metacaracteres de shell, execSync + template
    // string lo ejecutaria como comando adicional (`.replace(/"/g, "'")`
    // solo neutraliza comillas, no & | && ||).
    assert.doesNotMatch(
      content,
      /execSync\(\s*`node "\$\{CAPTURE\}/,
      'no debe construir el comando de captura via execSync + template string interpolado'
    );
    assert.match(
      content,
      /execFileSync\(\s*process\.execPath|execFileSync\(\s*'node'/,
      'debe invocar capture-event.js via execFileSync con array de argumentos'
    );
  });

  test('archivo de codigo con emoji: exit 2 (bloqueante)', () => {
    const f = tmpFile('const saludo = "hola \u{1F600}";\n');
    const renamed = f.replace(/\.tmp$/, '.js');
    fs.renameSync(f, renamed);
    const r = runScript(SCRIPT, [renamed]);
    fs.unlinkSync(renamed);
    assert.equal(r.status, 2, 'debe abortar con exit 2 ante emoji pictografico');
    assert.match(r.stderr, /Emoji pictografico detectado/);
  });

  test('COMMIT_EDITMSG con mas de 150 palabras: NO bloquea', () => {
    // Un mensaje de commit es documentacion tecnica del cambio (puede listar
    // varios puntos con vineta legitimamente), no prosa conversacional al
    // usuario -- solo TO_GEMINI.md queda sujeto al limite de 150 palabras.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standards-guard-'));
    const f = path.join(dir, 'COMMIT_EDITMSG');
    fs.writeFileSync(f, Array(160).fill('palabra').join(' '), 'utf8');
    const r = runScript(SCRIPT, [f]);
    fs.rmSync(dir, { recursive: true });
    assert.equal(r.status, 0, 'un mensaje de commit extenso no debe bloquearse por el limite de 150 palabras');
  });

  test('TO_GEMINI.md con mas de 150 palabras: exit 2 (bloqueante)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standards-guard-'));
    const f = path.join(dir, 'TO_GEMINI.md');
    fs.writeFileSync(f, Array(160).fill('palabra').join(' '), 'utf8');
    const r = runScript(SCRIPT, [f]);
    fs.rmSync(dir, { recursive: true });
    assert.equal(r.status, 2, 'TO_GEMINI.md si es prosa conversacional real y debe respetar el limite');
    assert.match(r.stderr, /Prosa tiene \d+ palabras/);
  });

  test('SKILL.md con prosa tecnica extensa (> 150 palabras): NO bloquea', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standards-guard-'));
    const f = path.join(dir, 'SKILL.md');
    fs.writeFileSync(f, `# Skill de prueba\n\n${Array(300).fill('palabra').join(' ')}`, 'utf8');
    const r = runScript(SCRIPT, [f]);
    fs.rmSync(dir, { recursive: true });
    assert.equal(r.status, 0, 'documentacion tecnica extensa no debe bloquearse por el limite de 150 palabras');
  });

  test('archivo sin violaciones: exit 0', () => {
    const f = tmpFile('const x = 1;\n');
    const renamed = f.replace(/\.tmp$/, '.js');
    fs.renameSync(f, renamed);
    const r = runScript(SCRIPT, [renamed]);
    fs.unlinkSync(renamed);
    assert.equal(r.status, 0);
  });

  test('sin argv ni env var, lee tool_input.file_path del JSON de stdin', () => {
    // Regresion real: CLAUDE_TOOL_INPUT_file_path nunca existio como
    // variable de entorno real.
    const f = tmpFile('const saludo = "hola \u{1F600}";\n');
    const renamed = f.replace(/\.tmp$/, '.js');
    fs.renameSync(f, renamed);
    const evento = JSON.stringify({ tool_input: { file_path: renamed } });
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: REPO, input: evento });
    fs.unlinkSync(renamed);
    assert.equal(r.status, 2, 'debe leer la ruta real desde stdin y bloquear por el emoji');
  });

  test('standards-guard registrado en PostToolUse sin "|| true" que absorba el exit code', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const postHooks = (settings.hooks?.PostToolUse || []).flatMap(h => h.hooks || []);
    const cmd = postHooks.map(h => h.command || '').find(c => c.includes('standards-guard.js'));
    assert.ok(cmd, 'standards-guard.js debe estar registrado en PostToolUse');
    assert.ok(!cmd.includes('|| true'), 'el hook no debe absorber el exit code con || true');
  });

  test('CLAUDE.md/README.md citando la marca de atribucion de IA en prosa que la prohibe: NO bloquea', () => {
    // Falso positivo real: el chequeo generico sobre `content` coincidia con
    // la cadena dentro de la oracion que PROHIBE la practica, no con una
    // violacion real. La marca solo tiene sentido semantico en un mensaje de
    // commit real (ver seccion 6, isCommitMsg).
    const marca = ['Co', 'Authored', 'By'].join('-');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standards-guard-'));
    const f = path.join(dir, 'CLAUDE.md');
    fs.writeFileSync(f, `- PROHIBIDO incluir "${marca}" en cualquier mensaje de commit\n`, 'utf8');
    const r = runScript(SCRIPT, [f]);
    fs.rmSync(dir, { recursive: true });
    assert.equal(r.status, 0, 'documentar la regla no es violarla');
  });

  test('COMMIT_EDITMSG con la marca de atribucion de IA real: exit 2 (bloqueante)', () => {
    const marca = ['Co', 'Authored', 'By'].join('-');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standards-guard-'));
    const f = path.join(dir, 'COMMIT_EDITMSG');
    fs.writeFileSync(f, `fix: ajuste menor\n\n${marca}: Autor generado <noreply@example.com>\n`, 'utf8');
    const r = runScript(SCRIPT, [f]);
    fs.rmSync(dir, { recursive: true });
    assert.equal(r.status, 2, 'un commit real con la marca debe seguir bloqueado');
    assert.match(r.stderr, new RegExp(marca));
  });

  test('secreto real en archivo "latest-config.json" SI bloquea (hallazgo red-team 2026-08-15 -- "test" como substring, no segmento de ruta real)', () => {
    // Regresion real: filePath.includes('test') eximia cualquier ruta cuyo
    // string contuviera "test" en CUALQUIER posicion, incluyendo "latest".
    // Un secreto real en un archivo de produccion llamado asi quedaba sin
    // deteccion -- el fix exige "test" como palabra/segmento real, no
    // substring generica.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standards-guard-secret-'));
    const f = path.join(dir, 'latest-config.json');
    const tokenGithub = 'ghp_' + 'A'.repeat(36);
    fs.writeFileSync(f, `{"token": "${tokenGithub}"}\n`, 'utf8');
    const r = runScript(SCRIPT, [f]);
    fs.rmSync(dir, { recursive: true });
    assert.equal(r.status, 2, 'un secreto real en un archivo con "test" como substring (no segmento) debe seguir bloqueando');
  });

  test('fixture de emoji dentro de tests/: NO bloquea', () => {
    // Falso positivo real: tests/harness.test.js usa un emoji como literal
    // de prueba para verificarEmojis() -- no es prosa/codigo real.
    const cara = String.fromCodePoint(0x1F600);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standards-guard-'));
    fs.mkdirSync(path.join(dir, 'tests'));
    const f = path.join(dir, 'tests', 'ejemplo.test.js');
    fs.writeFileSync(f, `test('detecta emoji', () => { verificarEmojis('hola ${cara}'); });\n`, 'utf8');
    const r = runScript(SCRIPT, [f]);
    fs.rmSync(dir, { recursive: true });
    assert.equal(r.status, 0, 'un fixture de emoji dentro de tests/ no debe bloquearse');
  });
});

// ─── process-guard.js (propagacion de exit code) ────────────────────────────
