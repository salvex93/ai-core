'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('agent-tools-guard.js', () => {
  const GUARD = path.join(BIN, 'agent-tools-guard.js');
  const AGENTS_DIR_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-tools-guard-'));
  const ENV_AGENTS = { AI_CORE_AGENTS_DIR: AGENTS_DIR_TMP };

  function escribirAgente(nombre, toolsLine) {
    const contenido = [
      '---',
      `name: ${nombre}`,
      'description: agente de prueba',
      ...(toolsLine ? [toolsLine] : []),
      '---',
      '',
      `# ${nombre}`,
    ].join('\n');
    fs.writeFileSync(path.join(AGENTS_DIR_TMP, `${nombre}.md`), contenido, 'utf8');
  }

  before(() => {
    escribirAgente('scanner-solo-lectura', 'tools: [Bash, Read, Grep, Glob]');
    escribirAgente('sin-scope-declarado', null);
  });

  after(() => {
    fs.rmSync(AGENTS_DIR_TMP, { recursive: true, force: true });
  });

  function enviarEvento(evento) {
    return spawnSync('node', [GUARD], {
      input: JSON.stringify(evento),
      encoding: 'utf8',
      env: { ...process.env, ...ENV_AGENTS },
    });
  }

  test('permite una herramienta dentro del scope declarado', () => {
    const r = enviarEvento({ agent_type: 'scanner-solo-lectura', tool_name: 'Read' });
    assert.equal(r.status, 0);
  });

  test('bloquea (codigo 2) una herramienta fuera del scope declarado', () => {
    const r = enviarEvento({ agent_type: 'scanner-solo-lectura', tool_name: 'Write' });
    assert.equal(r.status, 2, 'debe bloquear Write si el agente solo declara Bash/Read/Grep/Glob');
    assert.match(r.stderr, /AGENT-TOOLS-GUARD/);
    assert.match(r.stderr, /scanner-solo-lectura/);
  });

  test('sin agent_type (tool call del hilo principal): no bloquea', () => {
    const r = enviarEvento({ tool_name: 'Write' });
    assert.equal(r.status, 0, 'sin agent_type la tool call no viene de un subagente, el guard no aplica');
  });

  test('agent_type sin AGENT.md correspondiente (ej. Explore, general-purpose): no bloquea', () => {
    const r = enviarEvento({ agent_type: 'Explore', tool_name: 'Write' });
    assert.equal(r.status, 0, 'agentes que no son de ai-core no tienen scope que verificar');
  });

  test('AGENT.md sin campo tools: declarado: no bloquea (retrocompatible)', () => {
    const r = enviarEvento({ agent_type: 'sin-scope-declarado', tool_name: 'Write' });
    assert.equal(r.status, 0, 'sin scope declarado no hay nada que verificar');
  });

  test('los 7 agentes reales de ai-core tienen scope de herramientas declarado', () => {
    const AGENTES_REALES = [
      'aiops-auditor', 'code-reviewer', 'issue-tracker', 'map-updater',
      'mcp-registry-navigator', 'security-scanner', 'self-healing-agent',
    ];
    for (const nombre of AGENTES_REALES) {
      const r = spawnSync('node', [GUARD], {
        input: JSON.stringify({ agent_type: nombre, tool_name: '__HERRAMIENTA_INEXISTENTE__' }),
        encoding: 'utf8',
        env: { ...process.env },
      });
      assert.equal(r.status, 2, `${nombre} debe tener tools: declarado y bloquear una herramienta fuera de scope`);
    }
  });

  test('self-healing-agent no tiene Write ni Edit en su scope (nunca aplica fixes)', () => {
    const contenido = fs.readFileSync(path.join(REPO, '.claude', 'agents', 'self-healing-agent.md'), 'utf8');
    const toolsLine = contenido.match(/^tools:\s*\[([^\]]*)\]/m);
    assert.ok(toolsLine, 'debe declarar tools:');
    const scope = toolsLine[1].split(',').map((t) => t.trim());
    assert.ok(!scope.includes('Write'), 'self-healing-agent nunca debe poder escribir archivos');
    assert.ok(!scope.includes('Edit'), 'self-healing-agent nunca debe poder editar archivos');
  });
});
