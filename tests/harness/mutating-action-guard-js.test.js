'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { BIN } = require('./_shared');

describe('mutating-action-guard.js', () => {
  const GUARD = path.join(BIN, 'mutating-action-guard.js');
  const JAILBREAK_GUARD = path.join(BIN, 'jailbreak-guard.js');

  function enviarEvento(evento, env = {}) {
    return spawnSync('node', [GUARD], {
      input: JSON.stringify(evento),
      encoding: 'utf8',
      env: { ...process.env, ...env },
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

  describe('break-glass: excepcion auditable con enforcement real', () => {
    function nuevoDirBreakGlass() {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'mutating-guard-breakglass-'));
    }

    test('el bloqueo genera un id CONFIRMAR-<id> real en el stderr', () => {
      const dir = nuevoDirBreakGlass();
      const r = enviarEvento(
        { agent_type: 'aiops-auditor', tool_name: 'mcp__mi-app-tareas__crear_tarea', tool_input: {} },
        { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') }
      );
      assert.equal(r.status, 2);
      assert.match(r.stderr, /CONFIRMAR-[a-f0-9]{8}/);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('confirmar el id via jailbreak-guard.js permite el REINTENTO EXACTO de la misma tool call', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const evento = { agent_type: 'aiops-auditor', tool_name: 'mcp__mi-app-tareas__crear_tarea', tool_input: {} };

      const bloqueo = enviarEvento(evento, env);
      assert.equal(bloqueo.status, 2);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];

      const confirmacion = spawnSync('node', [JAILBREAK_GUARD], {
        input: '',
        encoding: 'utf8',
        env: { ...process.env, ...env, CLAUDE_USER_PROMPT: `CONFIRMAR-${id}`, AI_CORE_JAILBREAK_BYPASS_DIR: path.join(dir, 'jb') },
      });
      assert.equal(confirmacion.status, 0);

      const reintento = enviarEvento(evento, env);
      assert.equal(reintento.status, 0, 'el reintento exacto de la misma tool call ya confirmada debe pasar');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('confirmar un id NO autoriza una accion mutante DISTINTA (no es una excepcion general)', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const eventoOriginal = { agent_type: 'aiops-auditor', tool_name: 'mcp__mi-app-tareas__crear_tarea', tool_input: {} };
      const eventoDistinto = { agent_type: 'aiops-auditor', tool_name: 'mcp__mi-app-tareas__eliminar_tarea', tool_input: {} };

      const bloqueo = enviarEvento(eventoOriginal, env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      spawnSync('node', [JAILBREAK_GUARD], {
        input: '',
        encoding: 'utf8',
        env: { ...process.env, ...env, CLAUDE_USER_PROMPT: `CONFIRMAR-${id}`, AI_CORE_JAILBREAK_BYPASS_DIR: path.join(dir, 'jb') },
      });

      const otraAccion = enviarEvento(eventoDistinto, env);
      assert.equal(otraAccion.status, 2, 'una accion mutante distinta a la aprobada debe seguir bloqueada');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('reintentar la misma accion una SEGUNDA vez tras confirmar vuelve a bloquear (un solo uso, no permanente)', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const evento = { agent_type: 'aiops-auditor', tool_name: 'mcp__mi-app-tareas__crear_tarea', tool_input: {} };

      const bloqueo = enviarEvento(evento, env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      spawnSync('node', [JAILBREAK_GUARD], {
        input: '',
        encoding: 'utf8',
        env: { ...process.env, ...env, CLAUDE_USER_PROMPT: `CONFIRMAR-${id}`, AI_CORE_JAILBREAK_BYPASS_DIR: path.join(dir, 'jb') },
      });

      enviarEvento(evento, env); // consume la aprobacion de un solo uso
      const segundoIntento = enviarEvento(evento, env);
      assert.equal(segundoIntento.status, 2, 'la aprobacion de un solo uso no debe cubrir un segundo reintento');
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });
});
