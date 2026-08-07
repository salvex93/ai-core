'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { spawnSync } = require('node:child_process');
const { BIN } = require('./_shared');

describe('mutating-action-guard.js', () => {
  const GUARD = path.join(BIN, 'mutating-action-guard.js');

  function enviarEvento(evento) {
    return spawnSync('node', [GUARD], {
      input: JSON.stringify(evento),
      encoding: 'utf8',
    });
  }

  test('sin agent_type (hilo principal): nunca bloquea, aunque la tool sea mutante', () => {
    const r = enviarEvento({ tool_name: 'mcp__mi-app-tareas__crear_tarea', tool_input: {} });
    assert.equal(r.status, 0);
  });

  test('subagente invoca tool MCP con verbo de escritura (crear_): bloquea -- caso real reportado', () => {
    const r = enviarEvento({ agent_type: 'aiops-auditor', tool_name: 'mcp__mi-app-tareas__crear_tarea', tool_input: {} });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /MUTATING-ACTION-GUARD/);
    assert.match(r.stderr, /mi-app-tareas/);
  });

  test('subagente invoca tool MCP con verbo actualizar_: bloquea', () => {
    const r = enviarEvento({ agent_type: 'aiops-auditor', tool_name: 'mcp__mi-app-tareas__actualizar_status', tool_input: {} });
    assert.equal(r.status, 2);
  });

  test('subagente invoca tool MCP con verbo de lectura (get_/list_/consultar_): no bloquea', () => {
    for (const accion of ['get_tarea', 'list_proyectos', 'consultar_status']) {
      const r = enviarEvento({ agent_type: 'aiops-auditor', tool_name: `mcp__mi-app-tareas__${accion}`, tool_input: {} });
      assert.equal(r.status, 0, `${accion} es de lectura, no debe bloquear`);
    }
  });

  test('subagente invoca gemini-bridge (analizar_archivo, lectura): no bloquea', () => {
    const r = enviarEvento({ agent_type: 'aiops-auditor', tool_name: 'mcp__gemini-bridge__analizar_archivo', tool_input: {} });
    assert.equal(r.status, 0);
  });

  test('subagente ejecuta curl -X POST hacia una API externa: bloquea', () => {
    const r = enviarEvento({
      agent_type: 'security-scanner',
      tool_name: 'Bash',
      tool_input: { command: 'curl -X POST https://api.miapp.com/tareas -d "{}"' },
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /MUTATING-ACTION-GUARD/);
  });

  test('subagente ejecuta curl -X DELETE: bloquea', () => {
    const r = enviarEvento({
      agent_type: 'security-scanner',
      tool_name: 'Bash',
      tool_input: { command: 'curl -X DELETE https://api.miapp.com/tareas/123' },
    });
    assert.equal(r.status, 2);
  });

  test('subagente ejecuta curl GET implicito (sin -X): no bloquea', () => {
    const r = enviarEvento({
      agent_type: 'security-scanner',
      tool_name: 'Bash',
      tool_input: { command: 'curl https://api.miapp.com/tareas/123' },
    });
    assert.equal(r.status, 0);
  });

  test('subagente ejecuta Invoke-RestMethod -Method Post (PowerShell): bloquea', () => {
    const r = enviarEvento({
      agent_type: 'security-scanner',
      tool_name: 'Bash',
      tool_input: { command: 'Invoke-RestMethod -Uri https://api.miapp.com/tareas -Method Post -Body $json' },
    });
    assert.equal(r.status, 2);
  });

  test('subagente ejecuta Bash sin curl/wget/Invoke-*: no bloquea (no es una llamada HTTP)', () => {
    const r = enviarEvento({
      agent_type: 'security-scanner',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    });
    assert.equal(r.status, 0);
  });
});
