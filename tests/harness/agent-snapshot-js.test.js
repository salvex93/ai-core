'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const { BIN, runScript, tmpFile } = require('./_shared');

describe('agent-snapshot.js', () => {
  const SCRIPT = path.join(BIN, 'agent-snapshot.js');

  test('sin agent_type (hilo principal, no un subagente): SI registra snapshot con agentType "hilo-principal" (cobertura total, hallazgo auditoria 2026-08-15)', () => {
    const snapshotsDir = tmpFile('') + '-dir-sin-agente';
    const archivo = tmpFile('contenido original');
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: archivo,
      AI_CORE_AGENT_SNAPSHOTS_DIR: snapshotsDir,
    });
    assert.equal(r.status, 0);
    const indice = JSON.parse(fs.readFileSync(path.join(snapshotsDir, 'index.json'), 'utf8'));
    assert.equal(indice.length, 1);
    assert.equal(indice[0].agentType, 'hilo-principal', 'una edicion sin agent_type es del hilo principal, no de un subagente');
    assert.equal(fs.readFileSync(indice[0].snapshotPath, 'utf8'), 'contenido original');
  });

  test('con agent_type, archivo existente: crea snapshot y lo registra en el indice', () => {
    const snapshotsDir = tmpFile('') + '-dir-existente';
    const archivo = tmpFile('contenido original v1');
    const r = runScript(SCRIPT, [], {
      CLAUDE_SUBAGENT_TYPE: 'aiops-auditor',
      CLAUDE_TOOL_INPUT_file_path: archivo,
      AI_CORE_AGENT_SNAPSHOTS_DIR: snapshotsDir,
    });
    assert.equal(r.status, 0);

    const indice = JSON.parse(fs.readFileSync(path.join(snapshotsDir, 'index.json'), 'utf8'));
    assert.equal(indice.length, 1);
    assert.equal(indice[0].agentType, 'aiops-auditor');
    assert.equal(indice[0].existiaAntes, true);
    assert.equal(fs.readFileSync(indice[0].snapshotPath, 'utf8'), 'contenido original v1');
  });

  test('con agent_type, archivo NUEVO (no existe aun): registra existiaAntes=false, sin archivo de snapshot', () => {
    const snapshotsDir = tmpFile('') + '-dir-nuevo';
    const archivoInexistente = path.join(path.dirname(tmpFile('')), `nuevo-${Date.now()}.txt`);
    const r = runScript(SCRIPT, [], {
      CLAUDE_SUBAGENT_TYPE: 'self-healing-agent',
      CLAUDE_TOOL_INPUT_file_path: archivoInexistente,
      AI_CORE_AGENT_SNAPSHOTS_DIR: snapshotsDir,
    });
    assert.equal(r.status, 0);

    const indice = JSON.parse(fs.readFileSync(path.join(snapshotsDir, 'index.json'), 'utf8'));
    assert.equal(indice[0].existiaAntes, false);
    assert.equal(indice[0].snapshotPath, null);
  });

  test('sin CLAUDE_TOOL_INPUT_file_path: exit 0, no registra nada', () => {
    const snapshotsDir = tmpFile('') + '-dir-sin-path';
    const r = runScript(SCRIPT, [], {
      CLAUDE_SUBAGENT_TYPE: 'aiops-auditor',
      AI_CORE_AGENT_SNAPSHOTS_DIR: snapshotsDir,
    });
    assert.equal(r.status, 0);
    assert.ok(!fs.existsSync(path.join(snapshotsDir, 'index.json')));
  });

  test('con agent_type real de subagente: sigue registrando el nombre real, no "hilo-principal"', () => {
    const snapshotsDir = tmpFile('') + '-dir-subagente-real';
    const archivo = tmpFile('contenido original subagente');
    const r = runScript(SCRIPT, [], {
      CLAUDE_SUBAGENT_TYPE: 'security-scanner',
      CLAUDE_TOOL_INPUT_file_path: archivo,
      AI_CORE_AGENT_SNAPSHOTS_DIR: snapshotsDir,
    });
    assert.equal(r.status, 0);
    const indice = JSON.parse(fs.readFileSync(path.join(snapshotsDir, 'index.json'), 'utf8'));
    assert.equal(indice[0].agentType, 'security-scanner');
  });

  test('cobertura total: N ediciones sucesivas del hilo principal generan N snapshots del estado ANTES de cada escritura (permite revertir a cualquier punto)', () => {
    // El hook real corre en PreToolUse -- ANTES de que Write/Edit modifique
    // el archivo. Se simula esa secuencia real: snapshot, LUEGO escribir.
    const snapshotsDir = tmpFile('') + '-dir-multi';
    const archivo = tmpFile('v1');
    runScript(SCRIPT, [], { CLAUDE_TOOL_INPUT_file_path: archivo, AI_CORE_AGENT_SNAPSHOTS_DIR: snapshotsDir }); // snapshot de v1, antes de que la tool escriba v2
    fs.writeFileSync(archivo, 'v2', 'utf8');
    runScript(SCRIPT, [], { CLAUDE_TOOL_INPUT_file_path: archivo, AI_CORE_AGENT_SNAPSHOTS_DIR: snapshotsDir }); // snapshot de v2, antes de que la tool escriba v3
    fs.writeFileSync(archivo, 'v3', 'utf8');

    const indice = JSON.parse(fs.readFileSync(path.join(snapshotsDir, 'index.json'), 'utf8'));
    assert.equal(indice.length, 2);
    assert.equal(fs.readFileSync(indice[0].snapshotPath, 'utf8'), 'v1');
    assert.equal(fs.readFileSync(indice[1].snapshotPath, 'utf8'), 'v2');
    assert.equal(fs.readFileSync(archivo, 'utf8'), 'v3', 'el archivo real ya quedo en v3 -- el snapshot es del estado previo, no del final');
  });

  test('purga del indice tambien borra los archivos fisicos huerfanos (limite 1000, sin cobertura total esto no se notaba)', () => {
    const snapshotsDir = tmpFile('') + '-dir-purga';
    const archivo = tmpFile('contenido');

    // Generar 1001 snapshots para forzar una purga de exactamente 1 entrada.
    for (let i = 0; i < 1001; i++) {
      runScript(SCRIPT, [], { CLAUDE_TOOL_INPUT_file_path: archivo, AI_CORE_AGENT_SNAPSHOTS_DIR: snapshotsDir });
    }

    const indice = JSON.parse(fs.readFileSync(path.join(snapshotsDir, 'index.json'), 'utf8'));
    assert.equal(indice.length, 1000, 'el indice se acota a 1000 registros');

    const archivosDeSnapshot = fs.readdirSync(snapshotsDir).filter(f => f !== 'index.json');
    assert.equal(archivosDeSnapshot.length, 1000, 'no deben quedar archivos fisicos huerfanos tras la purga');
  });
});
