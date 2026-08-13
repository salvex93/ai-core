'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN } = require('./_shared');

describe('agent-paths-guard.js', () => {
  const GUARD = path.join(BIN, 'agent-paths-guard.js');
  const AGENTS_DIR_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-paths-guard-agents-'));
  const REPO_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-paths-guard-repo-'));
  const ENV = { AI_CORE_AGENTS_DIR: AGENTS_DIR_TMP, AI_CORE_PATHS_GUARD_REPO: REPO_TMP };

  function escribirAgente(nombre, pathsLine) {
    const contenido = [
      '---',
      `name: ${nombre}`,
      'description: agente de prueba',
      ...(pathsLine ? [pathsLine] : []),
      '---',
      '',
      `# ${nombre}`,
    ].join('\n');
    fs.writeFileSync(path.join(AGENTS_DIR_TMP, `${nombre}.md`), contenido, 'utf8');
  }

  before(() => {
    escribirAgente('map-updater-fake', 'paths_allow: [".claude/CONTEXT_MAP.json", ".claude/bin/**"]');
    escribirAgente('sin-scope-declarado', null);
    fs.mkdirSync(path.join(REPO_TMP, '.claude', 'bin'), { recursive: true });
  });

  after(() => {
    fs.rmSync(AGENTS_DIR_TMP, { recursive: true, force: true });
    fs.rmSync(REPO_TMP, { recursive: true, force: true });
  });

  function enviarEvento(evento) {
    return spawnSync('node', [GUARD], {
      input: JSON.stringify(evento),
      encoding: 'utf8',
      env: { ...process.env, ...ENV },
    });
  }

  test('sin agent_type (hilo principal): no bloquea', () => {
    const r = enviarEvento({ tool_name: 'Write', tool_input: { file_path: '/etc/passwd' } });
    assert.equal(r.status, 0);
  });

  test('agente sin paths_allow declarado: no bloquea (retrocompatible)', () => {
    const r = enviarEvento({
      agent_type: 'sin-scope-declarado',
      tool_name: 'Write',
      tool_input: { file_path: path.join(REPO_TMP, 'cualquier-cosa.txt') },
    });
    assert.equal(r.status, 0);
  });

  test('Write dentro de paths_allow: permite', () => {
    const r = enviarEvento({
      agent_type: 'map-updater-fake',
      tool_name: 'Write',
      tool_input: { file_path: path.join(REPO_TMP, '.claude', 'CONTEXT_MAP.json') },
    });
    assert.equal(r.status, 0);
  });

  test('Write fuera de paths_allow: emite permissionDecision:deny (exit 0 + JSON)', () => {
    // Friccion de scope declarado en AGENT.md, no riesgo de seguridad activa
    // -- permissionDecision:"deny" en vez de exit 2, recomendacion oficial
    // de Anthropic para este tipo de bloqueo (code.claude.com/docs/en/hooks).
    const r = enviarEvento({
      agent_type: 'map-updater-fake',
      tool_name: 'Write',
      tool_input: { file_path: path.join(REPO_TMP, 'informe-secreto.md') },
    });
    assert.equal(r.status, 0, 'permissionDecision:deny exige exit 0, no exit 2');
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /map-updater-fake/);
  });

  test('Edit fuera de paths_allow: deniega igual que Write', () => {
    const r = enviarEvento({
      agent_type: 'map-updater-fake',
      tool_name: 'Edit',
      tool_input: { file_path: path.join(REPO_TMP, 'otro-archivo.js') },
    });
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  });

  test('glob ** cubre subdirectorios (.claude/bin/sub/x.js dentro de .claude/bin/**)', () => {
    const r = enviarEvento({
      agent_type: 'map-updater-fake',
      tool_name: 'Write',
      tool_input: { file_path: path.join(REPO_TMP, '.claude', 'bin', 'sub', 'x.js') },
    });
    assert.equal(r.status, 0);
  });

  test('Bash de solo lectura (cat/grep/ls) fuera de scope: no bloquea -- el riesgo es escritura, no lectura', () => {
    const r = enviarEvento({
      agent_type: 'map-updater-fake',
      tool_name: 'Bash',
      tool_input: { command: 'cat /etc/passwd' },
    });
    assert.equal(r.status, 0);
  });

  test('Bash con rm sobre ruta fuera de scope: deniega -- caso real (agente exploratorio intento borrar un archivo no relacionado con su tarea)', () => {
    const r = enviarEvento({
      agent_type: 'map-updater-fake',
      tool_name: 'Bash',
      tool_input: { command: 'rm /tmp/algo-no-relacionado.txt' },
    });
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  });

  test('Bash con rm sobre ruta dentro de scope: permite', () => {
    const r = enviarEvento({
      agent_type: 'map-updater-fake',
      tool_name: 'Bash',
      tool_input: { command: `rm ${path.join(REPO_TMP, '.claude', 'bin', 'temp.js')}` },
    });
    assert.equal(r.status, 0);
  });

  test('Bash con redireccion de escritura (>) sobre ruta fuera de scope: deniega', () => {
    const r = enviarEvento({
      agent_type: 'map-updater-fake',
      tool_name: 'Bash',
      tool_input: { command: 'echo hola > /tmp/fuera-de-scope.txt' },
    });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
  });

  test('Bash con Remove-Item -Recurse -Force (PowerShell) fuera de scope: deniega', () => {
    const r = enviarEvento({
      agent_type: 'map-updater-fake',
      tool_name: 'Bash',
      tool_input: { command: 'Remove-Item -Recurse -Force /tmp/otra-carpeta' },
    });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
  });

  test('agent_type con path traversal: tratado como sin scope declarado, no bloquea (mismo criterio que agent-tools-guard.js)', () => {
    const r = enviarEvento({
      agent_type: '../secreto',
      tool_name: 'Write',
      tool_input: { file_path: '/etc/passwd' },
    });
    assert.equal(r.status, 0);
  });

  test('los 6 agentes con paths_allow real declaran al menos un patron', () => {
    const AGENTES_CON_PATHS = [
      'aiops-auditor', 'code-reviewer', 'issue-tracker', 'map-updater',
      'mcp-registry-navigator', 'security-scanner', 'self-healing-agent',
    ];
    for (const nombre of AGENTES_CON_PATHS) {
      const contenido = fs.readFileSync(path.join(REPO, '.claude', 'agents', `${nombre}.md`), 'utf8');
      assert.match(contenido, /^paths_allow:\s*\[.+\]/m, `${nombre} debe declarar paths_allow`);
    }
  });
});
