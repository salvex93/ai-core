'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('agent-metrics.js (observabilidad)', () => {
  const SCRIPT  = path.join(BIN, 'agent-metrics.js');
  const METRICS = path.join(REPO, '.claude', 'AGENT_METRICS.json');

  after(() => {
    if (fs.existsSync(METRICS)) fs.unlinkSync(METRICS);
  });

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'agent-metrics.js debe existir en .claude/bin/');
  });

  test('record: crea AGENT_METRICS.json con la entrada correcta', () => {
    // Test aislado detectado como flaky real: AGENT_METRICS.json es un
    // archivo compartido en disco (namespaced solo por hora de sesion, no
    // por test) -- otro proceso (otro test, o una verificacion manual real
    // del operador) puede escribir en la misma ventana horaria antes de que
    // este test corra, haciendo que calls[0] ya no sea la llamada de este
    // test. Se verifica el ULTIMO call (el que este test acaba de agregar),
    // no el primero.
    const r = runScript(SCRIPT, ['record', '--tool', 'Bash', '--status', 'ok', '--ms', '100']);
    assert.equal(r.status, 0, 'debe terminar con exit 0');
    assert.ok(fs.existsSync(METRICS), 'debe crear AGENT_METRICS.json');
    const data = JSON.parse(fs.readFileSync(METRICS, 'utf8'));
    assert.ok(data.sessions.length > 0, 'debe tener al menos una sesion');
    const session  = data.sessions[data.sessions.length - 1];
    const ultimoCall = session.calls[session.calls.length - 1];
    assert.ok(session.calls.length > 0, 'debe tener al menos un call');
    assert.equal(ultimoCall.tool, 'Bash');
    assert.equal(ultimoCall.status, 'ok');
  });

  test('record: acumula calls en la misma sesion', () => {
    runScript(SCRIPT, ['record', '--tool', 'Write', '--status', 'ok', '--ms', '50']);
    const data    = JSON.parse(fs.readFileSync(METRICS, 'utf8'));
    const session = data.sessions[data.sessions.length - 1];
    assert.ok(session.calls.length >= 2, 'debe acumular calls en la misma sesion');
  });

  test('record: contabiliza tokens estimados por herramienta', () => {
    const data    = JSON.parse(fs.readFileSync(METRICS, 'utf8'));
    const session = data.sessions[data.sessions.length - 1];
    assert.ok(session.totals.tokens > 0, 'debe acumular tokens estimados');
  });

  test('report: emite resumen de sesion con metricas clave', () => {
    const r = runScript(SCRIPT, ['report']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('[metrics]'),   'debe incluir prefijo [metrics]');
    assert.ok(r.stdout.includes('tool calls'),  'debe reportar total de tool calls');
    assert.ok(r.stdout.includes('fiabilidad'),  'debe reportar fiabilidad');
    assert.ok(r.stdout.includes('tokens est.'), 'debe reportar tokens estimados');
  });

  test('report --full: incluye todas las sesiones', () => {
    const r = runScript(SCRIPT, ['report', '--full']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('[metrics]'), 'debe incluir datos de sesiones');
  });

  test('record: sin --tool, lee tool_name del JSON de stdin (contrato real de hooks Claude Code)', () => {
    // Regresion real: el hook registrado en hooks-definition.js pasaba
    // --tool "$CLAUDE_TOOL_NAME", una variable de entorno que Claude Code
    // nunca inyecta -- el nombre real llega por stdin como JSON (tool_name).
    // Sin este test, ese bug (AGENT_METRICS.json nunca se poblaba en produccion)
    // pasaba desapercibido porque el test anterior siempre paso --tool explicito.
    const evento = JSON.stringify({ session_id: 'x', hook_event_name: 'PostToolUse', tool_name: 'Edit' });
    const r = spawnSync('node', [SCRIPT, 'record', '--status', 'ok'], {
      encoding: 'utf8', cwd: REPO, input: evento,
      env: { ...process.env, AI_CORE_TEST_MODE: '1' },
    });
    assert.equal(r.status, 0);
    const data    = JSON.parse(fs.readFileSync(METRICS, 'utf8'));
    const session = data.sessions[data.sessions.length - 1];
    assert.equal(session.calls[session.calls.length - 1].tool, 'Edit');
  });

  test('record: sin --tool y sin stdin con datos, no bloquea y usa "unknown"', () => {
    const r = spawnSync('node', [SCRIPT, 'record', '--status', 'ok'], {
      encoding: 'utf8', cwd: REPO, input: '',
      env: { ...process.env, AI_CORE_TEST_MODE: '1' },
    });
    assert.equal(r.status, 0);
    const data    = JSON.parse(fs.readFileSync(METRICS, 'utf8'));
    const session = data.sessions[data.sessions.length - 1];
    assert.equal(session.calls[session.calls.length - 1].tool, 'unknown');
  });

  test('agent-metrics registrado en PostToolUse de settings.json', () => {
    const settings  = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const postHooks = settings.hooks?.PostToolUse || [];
    const metricsHook = postHooks.find(h =>
      (h.hooks || []).some(c => (c.command || '').includes('agent-metrics.js'))
    );
    assert.ok(metricsHook, 'agent-metrics.js debe estar registrado en PostToolUse');
  });
});
