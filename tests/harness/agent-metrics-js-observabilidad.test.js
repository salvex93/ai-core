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

  describe('rotacion de calls por sesion (gap de production-readiness, 2026-08-27)', () => {
    // Hallazgo real de auditoria: data.sessions ya rotaba a max 20 sesiones,
    // pero session.calls DENTRO de cada sesion nunca se podaba -- una sesion
    // larga (miles de tool calls) crece sin limite indefinidamente aunque el
    // numero de sesiones este acotado. Se llama cmdRecord() directo (in-process)
    // en vez de spawnear un proceso node por llamada -- con 500+ llamadas,
    // spawnSync por iteracion tardaba ~25s por test; misma cobertura, sin el
    // costo de arrancar cientos de procesos node solo para poblar el fixture.
    // METRICS es una constante de modulo evaluada una sola vez al hacer
    // require -- hay que fijar AI_CORE_METRICS_PATH y limpiar el cache de
    // require ANTES de cada require() para que cada test tenga su propio
    // archivo aislado (mismo patron que break-glass-lib-js.test.js).
    function cargarModuloAislado() {
      const metricsPath = path.join(os.tmpdir(), `agent-metrics-rotacion-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      process.env.AI_CORE_METRICS_PATH = metricsPath;
      delete require.cache[require.resolve(SCRIPT)];
      const mod = require(SCRIPT);
      delete process.env.AI_CORE_METRICS_PATH;
      return { ...mod, metricsPath };
    }

    test('con mas de MAX_CALLS_POR_SESION llamadas, calls[] se poda y conserva solo las mas recientes', () => {
      const { cmdRecord, MAX_CALLS_POR_SESION, metricsPath } = cargarModuloAislado();

      for (let i = 0; i < MAX_CALLS_POR_SESION + 50; i++) {
        cmdRecord({ '--tool': `Tool${i}`, '--status': 'ok', '--ms': '1' }, null);
      }

      const data    = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
      const session = data.sessions[data.sessions.length - 1];
      assert.ok(session.calls.length <= MAX_CALLS_POR_SESION, `calls.length (${session.calls.length}) no debe superar el cap de ${MAX_CALLS_POR_SESION}`);
      // La ultima llamada registrada debe sobrevivir la poda -- se descartan
      // las mas viejas, no las mas nuevas.
      assert.equal(session.calls[session.calls.length - 1].tool, `Tool${MAX_CALLS_POR_SESION + 49}`);

      fs.rmSync(metricsPath, { force: true });
    });

    test('los totales acumulados (ok/fail/tokens/ms) NO se pierden al podar calls[]', () => {
      // La poda es solo del detalle por-llamada -- los agregados deben seguir
      // reflejando TODAS las llamadas historicas de la sesion, no solo las
      // que sobreviven en calls[]. Sin esto, "totals.tokens" mentiria tras podar.
      const { cmdRecord, MAX_CALLS_POR_SESION, metricsPath } = cargarModuloAislado();
      const N = MAX_CALLS_POR_SESION + 10;

      for (let i = 0; i < N; i++) {
        cmdRecord({ '--tool': 'Bash', '--status': 'ok', '--ms': '1' }, null);
      }

      const data    = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
      const session = data.sessions[data.sessions.length - 1];
      assert.equal(session.totals.ok, N, 'totals.ok debe contar todas las llamadas historicas, no solo las que sobreviven en calls[]');
      assert.ok(session.calls.length <= MAX_CALLS_POR_SESION);

      fs.rmSync(metricsPath, { force: true });
    });
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
