'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

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

  test('memory-index-stop registrado en Stop hook de settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const stopHooks = settings.hooks?.Stop?.[0]?.hooks || [];
    const cmds = stopHooks.map(h => h.command || '');
    assert.ok(
      cmds.some(c => c.includes('memory-index-stop.js')),
      'memory-index-stop.js debe estar registrado en el hook Stop'
    );
  });

  test('detect-role registrado en UserPromptSubmit hook de settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const upsHooks = settings.hooks?.UserPromptSubmit?.[0]?.hooks || [];
    const cmds = upsHooks.map(h => h.command || '');
    assert.ok(
      cmds.some(c => c.includes('detect-role.js')),
      'detect-role.js debe estar registrado en el hook UserPromptSubmit'
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

  describe('namespacing por rol', () => {
    const ROL_DIR = path.join(RAW, 'auditor');
    const ROL_FILE = path.join(ROL_DIR, '_test-auditor.md');
    const ROL_CONTENT = [
      '# Hallazgo de auditor de prueba',
      '',
      'Vulnerabilidad ficticia de inyeccion detectada en el modulo de prueba.',
    ].join('\n');

    before(() => {
      fs.mkdirSync(ROL_DIR, { recursive: true });
      fs.writeFileSync(ROL_FILE, ROL_CONTENT, 'utf8');
      runScript(SCRIPT, ['index']);
    });

    after(() => {
      if (fs.existsSync(ROL_FILE)) fs.unlinkSync(ROL_FILE);
      const wikiRolFile = path.join(WIKI, 'auditor', '_test-auditor.md');
      if (fs.existsSync(wikiRolFile)) fs.unlinkSync(wikiRolFile);
      if (fs.existsSync(ROL_DIR)) fs.rmSync(ROL_DIR, { recursive: true });
      const wikiRolDir = path.join(WIKI, 'auditor');
      if (fs.existsSync(wikiRolDir)) fs.rmSync(wikiRolDir, { recursive: true });
      runScript(SCRIPT, ['index']);
    });

    test('cmd index: etiqueta cada fragmento con su rol de origen', () => {
      const idx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      const fragsAuditor = Object.values(idx.frags).filter(f => f.rol === 'auditor');
      assert.ok(fragsAuditor.length > 0, 'debe existir al menos un fragmento con rol auditor');
    });

    test('cmd query --rol=auditor: encuentra contenido del namespace auditor', () => {
      const r = runScript(SCRIPT, ['query', 'vulnerabilidad inyeccion', '--rol=auditor']);
      assert.equal(r.status, 0);
      assert.ok(r.stdout.includes('_test-auditor'), 'debe encontrar el fragmento del namespace auditor');
    });

    test('cmd query --rol=coder: no filtra contenido de otro namespace (aislamiento)', () => {
      const r = runScript(SCRIPT, ['query', 'vulnerabilidad inyeccion', '--rol=coder']);
      assert.equal(r.status, 0);
      assert.ok(!r.stdout.includes('_test-auditor'), 'no debe filtrar contenido de auditor bajo rol coder');
    });

    test('cmd query sin --rol: busca cross-rol y encuentra el fragmento de auditor', () => {
      const r = runScript(SCRIPT, ['query', 'vulnerabilidad inyeccion']);
      assert.equal(r.status, 0);
      assert.ok(r.stdout.includes('_test-auditor'), 'sin filtro debe encontrar contenido de cualquier rol');
    });

    test('cmd status: reporta conteo de fragmentos por rol', () => {
      const r = runScript(SCRIPT, ['status']);
      assert.equal(r.status, 0);
      assert.ok(r.stdout.includes('auditor'), 'debe reportar el namespace auditor en el desglose');
    });
  });
});
