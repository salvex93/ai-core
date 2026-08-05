'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('memory-index.js (vault BM25)', () => {
  const SCRIPT = path.join(BIN, 'memory-index.js');

  // Vault aislado por proceso de test (directorio temporal, no el vault real
  // del repo) -- evita condicion de carrera con otros archivos de test que
  // tocan .claude/memory-vault/ concurrentemente (ej.
  // memory-vault-prune-check-js.test.js), ya que node --test corre archivos
  // en paralelo y ambos re-escanean/reescriben el mismo directorio compartido
  // si usan la ruta real. AI_CORE_MEMORY_VAULT_PATH redirige memory-index.js
  // a este vault temporal sin cambiar el comportamiento por defecto.
  const VAULT_TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-vault-'));
  const RAW        = path.join(VAULT_TMP, '.raw');
  const WIKI       = path.join(VAULT_TMP, '.wiki');
  const INDEX_FILE = path.join(VAULT_TMP, 'index.json');
  const ENV_VAULT  = { AI_CORE_MEMORY_VAULT_PATH: VAULT_TMP };

  function runScriptVault(args) {
    return runScript(SCRIPT, args, ENV_VAULT);
  }

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
    fs.rmSync(VAULT_TMP, { recursive: true, force: true });
  });

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'memory-index.js debe existir en .claude/bin/');
  });

  test('respeta AI_CORE_MEMORY_VAULT_PATH: opera sobre el vault temporal, no el real del repo', () => {
    runScriptVault(['index']);
    assert.ok(fs.existsSync(INDEX_FILE), 'debe crear index.json dentro del vault temporal, no en .claude/memory-vault/ real');
  });

  test('cmd index: crea index.json y .wiki/ a partir de .raw/', () => {
    const r = runScriptVault(['index']);
    assert.equal(r.status, 0, 'debe terminar con exit 0');
    assert.ok(fs.existsSync(INDEX_FILE), 'debe crear index.json');
    const idx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    assert.ok(idx.N > 0, 'el indice debe tener al menos 1 fragmento');
    assert.ok(idx.builtAt, 'debe registrar builtAt en el indice');
  });

  test('cmd query: retorna resultados relevantes con score BM25', () => {
    const r = runScriptVault(['query', 'vault memoria semantica']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('score:'), 'debe mostrar scores BM25');
    assert.ok(r.stdout.includes('[memory]'), 'debe incluir prefijo [memory]');
  });

  test('cmd query: sin resultados para termino inexistente', () => {
    const r = runScriptVault(['query', 'xyzzy123nonexistent']);
    assert.equal(r.status, 0);
    assert.ok(
      r.stdout.includes('sin resultados') || r.stdout.includes('score:'),
      'debe manejar query sin hits'
    );
  });

  test('cmd status: reporta estado del vault', () => {
    const r = runScriptVault(['status']);
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
      runScriptVault(['index']);
    });

    after(() => {
      if (fs.existsSync(ROL_FILE)) fs.unlinkSync(ROL_FILE);
      const wikiRolFile = path.join(WIKI, 'auditor', '_test-auditor.md');
      if (fs.existsSync(wikiRolFile)) fs.unlinkSync(wikiRolFile);
      if (fs.existsSync(ROL_DIR)) fs.rmSync(ROL_DIR, { recursive: true });
      const wikiRolDir = path.join(WIKI, 'auditor');
      if (fs.existsSync(wikiRolDir)) fs.rmSync(wikiRolDir, { recursive: true });
      runScriptVault(['index']);
    });

    test('cmd index: etiqueta cada fragmento con su rol de origen', () => {
      const idx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      const fragsAuditor = Object.values(idx.frags).filter(f => f.rol === 'auditor');
      assert.ok(fragsAuditor.length > 0, 'debe existir al menos un fragmento con rol auditor');
    });

    test('cmd query --rol=auditor: encuentra contenido del namespace auditor', () => {
      const r = runScriptVault(['query', 'vulnerabilidad inyeccion', '--rol=auditor']);
      assert.equal(r.status, 0);
      assert.ok(r.stdout.includes('_test-auditor'), 'debe encontrar el fragmento del namespace auditor');
    });

    test('cmd query --rol=coder: no filtra contenido de otro namespace (aislamiento)', () => {
      const r = runScriptVault(['query', 'vulnerabilidad inyeccion', '--rol=coder']);
      assert.equal(r.status, 0);
      assert.ok(!r.stdout.includes('_test-auditor'), 'no debe filtrar contenido de auditor bajo rol coder');
    });

    test('cmd query sin --rol: busca cross-rol y encuentra el fragmento de auditor', () => {
      const r = runScriptVault(['query', 'vulnerabilidad inyeccion']);
      assert.equal(r.status, 0);
      assert.ok(r.stdout.includes('_test-auditor'), 'sin filtro debe encontrar contenido de cualquier rol');
    });

    test('cmd status: reporta conteo de fragmentos por rol', () => {
      const r = runScriptVault(['status']);
      assert.equal(r.status, 0);
      assert.ok(r.stdout.includes('auditor'), 'debe reportar el namespace auditor en el desglose');
    });
  });

  describe('indice corrupto (JSON invalido)', () => {
    const VAULT_CORRUPTO  = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-vault-corrupto-'));
    const INDEX_CORRUPTO  = path.join(VAULT_CORRUPTO, 'index.json');
    const ENV_CORRUPTO    = { AI_CORE_MEMORY_VAULT_PATH: VAULT_CORRUPTO };

    before(() => {
      fs.writeFileSync(INDEX_CORRUPTO, '{ "frags": { esto no es JSON valido', 'utf8');
    });

    test('cmd query degrada con mensaje diagnosticable en vez de crashear con SyntaxError', () => {
      const r = runScript(SCRIPT, ['query', 'cualquier tema'], ENV_CORRUPTO);
      assert.notEqual(r.status, 1, `no debe crashear con excepcion no controlada: ${r.stderr}`);
      assert.doesNotMatch(r.stderr || '', /SyntaxError/, 'no debe propagar un SyntaxError crudo de JSON.parse');
    });

    test('cmd status degrada con mensaje diagnosticable en vez de crashear con SyntaxError', () => {
      const r = runScript(SCRIPT, ['status'], ENV_CORRUPTO);
      assert.doesNotMatch(r.stderr || '', /SyntaxError/, 'no debe propagar un SyntaxError crudo de JSON.parse');
    });
  });
});
