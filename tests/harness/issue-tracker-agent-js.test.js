'use strict';

/**
 * issue-tracker-agent-js.test.js — Tests dedicados del flujo real detras del
 * agente .claude/agents/issue-tracker.md (capture-event.js -> EVENTS_QUEUE.json
 * -> issue-reporter.js -> gh issue create). El unico test previo que tocaba
 * este agente era el validador generico de frontmatter (validate-agents-js.test.js),
 * que audita name/description/tools por igual para los 6 agentes -- no
 * ejercita ninguna de las dos rutas de negocio reales que el .md documenta:
 * deduplicacion de eventos y comportamiento cuando gh no esta disponible.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN } = require('./_shared');

describe('issue-tracker — capture-event.js no duplica eventos ya encolados (camino feliz)', () => {
  const SCRIPT = path.join(BIN, 'capture-event.js');
  const QUEUE_PATH = path.join(os.tmpdir(), `issue-tracker-dedup-queue-${process.pid}.json`);
  const QUEUE_ENV  = { AI_CORE_EVENTS_QUEUE_PATH: QUEUE_PATH };

  function leerCola() {
    try { return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')); }
    catch { return []; }
  }

  after(() => {
    fs.rmSync(QUEUE_PATH, { force: true });
  });

  test('el mismo type/tool/error capturado dos veces seguidas encola un solo evento', () => {
    const marcador = `dup-test-${process.pid}`;
    const args = ['--type', 'hook_failure', '--tool', 'guard-read', '--error', marcador];

    const r1 = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', cwd: REPO, env: { ...process.env, ...QUEUE_ENV } });
    const r2 = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', cwd: REPO, env: { ...process.env, ...QUEUE_ENV } });

    assert.equal(r1.status, 0);
    assert.equal(r2.status, 0);

    const cola = leerCola();
    const coincidencias = cola.filter(e => e.type === 'hook_failure' && e.tool === 'guard-read' && e.error === marcador);
    assert.equal(coincidencias.length, 1, 'un evento identico repetido dentro de la ventana de 5 min no debe duplicarse en la cola');
  });

  test('el segundo intento duplicado no imprime confirmacion de encolado (silencioso, sin ruido en el log)', () => {
    const marcador = `dup-silencioso-${process.pid}`;
    const args = ['--type', 'skill_gap', '--tool', 'ninguno', '--error', marcador];

    spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', cwd: REPO, env: { ...process.env, ...QUEUE_ENV } });
    const r2 = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', cwd: REPO, env: { ...process.env, ...QUEUE_ENV } });

    assert.equal(r2.status, 0);
    assert.doesNotMatch(r2.stderr, /Evento encolado/, 'un evento duplicado no debe reportarse como encolado nuevo');
  });

  test('type/tool iguales pero error distinto SI se encola como evento separado', () => {
    const args1 = ['--type', 'hook_failure', '--tool', 'guard-x', '--error', `err-a-${process.pid}`];
    const args2 = ['--type', 'hook_failure', '--tool', 'guard-x', '--error', `err-b-${process.pid}`];

    spawnSync('node', [SCRIPT, ...args1], { encoding: 'utf8', cwd: REPO, env: { ...process.env, ...QUEUE_ENV } });
    spawnSync('node', [SCRIPT, ...args2], { encoding: 'utf8', cwd: REPO, env: { ...process.env, ...QUEUE_ENV } });

    const cola = leerCola();
    assert.ok(cola.some(e => e.error === `err-a-${process.pid}`));
    assert.ok(cola.some(e => e.error === `err-b-${process.pid}`));
  });
});

describe('issue-tracker — issue-reporter.js no falla en silencio cuando gh no esta disponible/autenticado (error esperado)', () => {
  const SCRIPT = path.join(BIN, 'issue-reporter.js');

  function crearColaConEvento() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-tracker-gh-fail-'));
    const queuePath = path.join(dir, 'EVENTS_QUEUE.json');
    const evento = {
      id: `ev-${process.pid}`, type: 'hook_failure', tool: 'test-tool',
      error: 'error de prueba', ts: new Date().toISOString(), reported: false,
    };
    fs.writeFileSync(queuePath, JSON.stringify([evento]), 'utf8');
    return { dir, queuePath };
  }

  test('gh no disponible (PATH vacio): reporta el fallo en stderr, no termina en silencio y deja el evento pendiente en cola', () => {
    const { dir, queuePath } = crearColaConEvento();

    // PATH vacio simula "gh no instalado" (mismo patron que el test de
    // umbral en issue-reporter-js.test.js) -- node se invoca por ruta
    // absoluta para que spawnSync igual encuentre el binario de node.
    const r = spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, AI_CORE_EVENTS_QUEUE_PATH: queuePath, PATH: '' },
    });

    const colaTrasEjecutar = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    fs.rmSync(dir, { recursive: true, force: true });

    assert.equal(r.status, 0, 'el script no debe terminar con codigo de error solo porque gh no este disponible');
    assert.match(r.stderr, /gh CLI no disponible o no autenticado/i, 'debe reportar explicitamente por que no se proceso la cola, nunca en silencio');
    assert.match(r.stderr, /evento\(s\) en cola para el proximo intento/i, 'debe indicar que los eventos quedan pendientes, no perdidos');
    assert.equal(colaTrasEjecutar[0].reported, false, 'el evento no debe marcarse como reportado si gh no pudo ejecutarse');
  });

  test('gh no disponible: el evento pendiente sigue intacto en la cola (no se descarta silenciosamente)', () => {
    const { dir, queuePath } = crearColaConEvento();

    spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, AI_CORE_EVENTS_QUEUE_PATH: queuePath, PATH: '' },
    });

    const colaTrasEjecutar = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    fs.rmSync(dir, { recursive: true, force: true });

    assert.equal(colaTrasEjecutar.length, 1, 'el evento no debe eliminarse de la cola cuando gh no esta disponible');
    assert.equal(colaTrasEjecutar[0].id, `ev-${process.pid}`);
  });
});
