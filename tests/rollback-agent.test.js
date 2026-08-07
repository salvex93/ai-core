'use strict';

/**
 * rollback-agent.test.js — Tests de scripts/rollback-agent.js
 * Ejecutar: node --test tests/
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'rollback-agent.js');
const AGENT_SNAPSHOT_SCRIPT = path.join(__dirname, '..', '.claude', 'bin', 'agent-snapshot.js');

describe('rollback-agent.js', () => {
  let tmpDir, snapshotsDir, archivoTracked;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-agent-test-'));
    snapshotsDir = path.join(tmpDir, 'AGENT_SNAPSHOTS');
    archivoTracked = path.join(tmpDir, 'objetivo.txt');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(args) {
    return spawnSync('node', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, AI_CORE_AGENT_SNAPSHOTS_DIR: snapshotsDir },
    });
  }

  function crearSnapshot({ filePath, agentType = 'aiops-auditor' }) {
    return spawnSync('node', [AGENT_SNAPSHOT_SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_SUBAGENT_TYPE: agentType,
        CLAUDE_TOOL_INPUT_file_path: filePath,
        AI_CORE_AGENT_SNAPSHOTS_DIR: snapshotsDir,
      },
    });
  }

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('sin snapshots registrados: lista vacia, exit 0', () => {
    const dirVacio = path.join(tmpDir, 'sin-snapshots');
    const r = spawnSync('node', [SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, AI_CORE_AGENT_SNAPSHOTS_DIR: dirVacio },
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /no hay snapshots/i);
  });

  test('sin argumentos: lista los snapshots recientes', () => {
    fs.writeFileSync(archivoTracked, 'contenido v1', 'utf8');
    crearSnapshot({ filePath: archivoTracked });

    const r = run([]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /aiops-auditor/);
    assert.match(r.stdout, new RegExp(archivoTracked.replace(/\\/g, '\\\\')));
  });

  test('revierte un archivo modificado a su estado previo al snapshot', () => {
    fs.writeFileSync(archivoTracked, 'contenido original', 'utf8');
    crearSnapshot({ filePath: archivoTracked, agentType: 'self-healing-agent' });

    fs.writeFileSync(archivoTracked, 'contenido danado por el agente', 'utf8');

    const r = run([archivoTracked]);
    assert.equal(r.status, 0);
    assert.equal(fs.readFileSync(archivoTracked, 'utf8'), 'contenido original');
  });

  test('archivo que el agente creo de la nada: el rollback lo borra', () => {
    const archivoNuevo = path.join(tmpDir, 'creado-por-agente.txt');
    crearSnapshot({ filePath: archivoNuevo, agentType: 'map-updater' });

    fs.writeFileSync(archivoNuevo, 'contenido creado por el agente', 'utf8');
    assert.ok(fs.existsSync(archivoNuevo));

    const r = run([archivoNuevo]);
    assert.equal(r.status, 0);
    assert.ok(!fs.existsSync(archivoNuevo), 'el archivo nuevo debe quedar borrado tras el rollback');
  });

  test('--id revierte un snapshot especifico por id', () => {
    fs.writeFileSync(archivoTracked, 'version antes del id', 'utf8');
    crearSnapshot({ filePath: archivoTracked });

    const indice = JSON.parse(fs.readFileSync(path.join(snapshotsDir, 'index.json'), 'utf8'));
    const id = indice[indice.length - 1].id;

    fs.writeFileSync(archivoTracked, 'version rota', 'utf8');

    const r = run(['--id', id]);
    assert.equal(r.status, 0);
    assert.equal(fs.readFileSync(archivoTracked, 'utf8'), 'version antes del id');
  });

  test('--id con id inexistente: sale con error', () => {
    const r = run(['--id', 'no-existe']);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /no se encontro/i);
  });

  test('ruta sin ningun snapshot registrado: sale con error', () => {
    const r = run([path.join(tmpDir, 'nunca-tuvo-snapshot.txt')]);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /no hay snapshots registrados/i);
  });
});
