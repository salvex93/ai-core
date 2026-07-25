'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('detect-role.js + memory-index-stop.js (estado efimero de rol)', () => {
  const DETECT_ROLE  = path.join(BIN, 'detect-role.js');
  const STOP_WRAPPER = path.join(BIN, 'memory-index-stop.js');
  const ROLE_FILE    = path.join(REPO, '.claude', '.current_role');
  const VAULT        = path.join(REPO, '.claude', 'memory-vault');
  const RAW          = path.join(VAULT, '.raw');
  const INDEX_FILE   = path.join(VAULT, 'index.json');

  after(() => {
    if (fs.existsSync(ROLE_FILE)) fs.unlinkSync(ROLE_FILE);
  });

  test('ambos scripts existen', () => {
    assert.ok(fs.existsSync(DETECT_ROLE),  'detect-role.js debe existir en .claude/bin/');
    assert.ok(fs.existsSync(STOP_WRAPPER), 'memory-index-stop.js debe existir en .claude/bin/');
  });

  test('detect-role.js escribe .claude/.current_role con el rol detectado', () => {
    if (fs.existsSync(ROLE_FILE)) fs.unlinkSync(ROLE_FILE);
    const r = runScript(DETECT_ROLE, [], { CLAUDE_USER_PROMPT: 'audita esta dependencia por CVE de seguridad' });
    assert.equal(r.status, 0);
    assert.ok(fs.existsSync(ROLE_FILE), 'debe crear .claude/.current_role');
    assert.equal(fs.readFileSync(ROLE_FILE, 'utf8').trim(), 'auditor');
  });

  test('detect-role.js sin CLAUDE_USER_PROMPT, lee prompt_text del JSON de stdin', () => {
    // Regresion real: CLAUDE_USER_PROMPT nunca existio como variable de
    // entorno real -- UserPromptSubmit expone prompt_text via stdin
    // (confirmado contra code.claude.com/docs/en/hooks). Este hook nunca
    // clasificaba el rol real en produccion, siempre caia al fallback
    // "Architect" con confianza minima.
    if (fs.existsSync(ROLE_FILE)) fs.unlinkSync(ROLE_FILE);
    const evento = JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt_text: 'audita esta dependencia por CVE de seguridad' });
    const r = spawnSync('node', [DETECT_ROLE], { encoding: 'utf8', cwd: REPO, input: evento });
    assert.equal(r.status, 0);
    assert.equal(fs.readFileSync(ROLE_FILE, 'utf8').trim(), 'auditor', 'debe clasificar leyendo el prompt real desde stdin');
  });

  test('memory-index-stop.js consume .current_role de forma destructiva (lo elimina tras leerlo)', () => {
    fs.writeFileSync(ROLE_FILE, 'coder', 'utf8');
    fs.mkdirSync(RAW, { recursive: true });
    const r = runScript(STOP_WRAPPER);
    assert.equal(r.status, 0);
    assert.ok(!fs.existsSync(ROLE_FILE), '.current_role debe eliminarse tras ser consumido');
  });

  test('memory-index-stop.js indexa en el namespace del rol consumido', () => {
    fs.writeFileSync(ROLE_FILE, 'auditor', 'utf8');
    fs.mkdirSync(path.join(RAW, 'auditor'), { recursive: true });
    fs.writeFileSync(path.join(RAW, 'auditor', '_test-stop.md'), '# nota de prueba\n\ncontenido minimo de prueba.', 'utf8');

    runScript(STOP_WRAPPER);

    const idx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const fragsAuditor = Object.values(idx.frags).filter(f => f.rol === 'auditor' && f.source === '_test-stop');
    assert.ok(fragsAuditor.length > 0, 'debe indexar el fragmento en el namespace auditor');

    fs.unlinkSync(path.join(RAW, 'auditor', '_test-stop.md'));
    const wikiFile = path.join(VAULT, '.wiki', 'auditor', '_test-stop.md');
    if (fs.existsSync(wikiFile)) fs.unlinkSync(wikiFile);
    runScript(STOP_WRAPPER); // reindexar sin el archivo de prueba, deja el vault limpio
  });

  test('memory-index-stop.js cae a --rol=general si .current_role no existe', () => {
    if (fs.existsSync(ROLE_FILE)) fs.unlinkSync(ROLE_FILE);
    const r = runScript(STOP_WRAPPER);
    assert.equal(r.status, 0);
    assert.ok(!fs.existsSync(ROLE_FILE), 'no debe crear .current_role si no existia');
  });
});
