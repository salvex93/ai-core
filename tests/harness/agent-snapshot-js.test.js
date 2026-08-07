'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const { BIN, runScript, tmpFile } = require('./_shared');

describe('agent-snapshot.js', () => {
  const SCRIPT = path.join(BIN, 'agent-snapshot.js');

  test('sin agent_type (hilo principal, no un subagente): exit 0, no registra nada', () => {
    const snapshotsDir = tmpFile('') + '-dir-sin-agente';
    const archivo = tmpFile('contenido original');
    const r = runScript(SCRIPT, [], {
      CLAUDE_TOOL_INPUT_file_path: archivo,
      AI_CORE_AGENT_SNAPSHOTS_DIR: snapshotsDir,
    });
    assert.equal(r.status, 0);
    assert.ok(!fs.existsSync(path.join(snapshotsDir, 'index.json')), 'no debe crear indice sin agent_type');
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
      CLAUDE_SUBAGENT_TYPE: 'map-updater',
      AI_CORE_AGENT_SNAPSHOTS_DIR: snapshotsDir,
    });
    assert.equal(r.status, 0);
    assert.ok(!fs.existsSync(path.join(snapshotsDir, 'index.json')));
  });
});
