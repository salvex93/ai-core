'use strict';

/**
 * issue-reporter-js-camino-gh-disponible.test.js — cubre el camino con `gh`
 * CLI disponible, ausente en issue-reporter-js.test.js (que solo ejercita
 * PATH vacio / gh no disponible). issue-reporter.js invoca `gh` via
 * execFileSync/execSync SIN shell (deliberado, ver comentario junto a
 * openIssue() -- inmune a inyeccion de comandos), asi que un fake `gh.cmd`
 * o `gh.bat` antepuesto al PATH nunca se resuelve en Windows: Node v24
 * spawnSync/execFileSync sin shell:true solo invoca binarios PE (.exe/.com)
 * directamente y prioriza el gh.exe real del sistema sin importar el orden
 * del PATH (confirmado por experimentacion -- where.exe si resuelve el
 * fake primero, pero el resolver interno de Node no). Por eso el fake aqui
 * es un binario PE real: una copia de node.exe renombrada a gh.exe, cuyo
 * comportamiento se controla via NODE_OPTIONS=--require <hook>, que
 * intercepta antes de que Node intente resolver argv[1] como script.
 *
 * En POSIX (Linux/macOS) el mismo problema no existe -- execFileSync sin
 * shell busca literalmente `gh` (sin extension) en el PATH, y cualquier
 * archivo con el bit ejecutable alcanza. Ahi el fake es una copia de
 * process.execPath nombrada `gh` (no `gh.exe`) con permisos 0o755,
 * verificado en CI real (ubuntu-latest/macos-latest) tras el fallo del
 * nombre fijo `gh.exe` heredado del diseño original en Windows.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { BIN } = require('./_shared');

const SCRIPT = path.join(BIN, 'issue-reporter.js');

function crearFakeGh(dir) {
  const nombreGh = process.platform === 'win32' ? 'gh.exe' : 'gh';
  const ghExe = path.join(dir, nombreGh);
  fs.copyFileSync(process.execPath, ghExe);
  if (process.platform !== 'win32') {
    fs.chmodSync(ghExe, 0o755);
  }

  const hookScript = path.join(dir, 'fake-gh-hook.js');
  fs.writeFileSync(hookScript, `
'use strict';
const fs = require('fs');

// NODE_OPTIONS se hereda tambien al proceso principal (node issue-reporter.js),
// que no es el binario gh -- sin este guard, el hook interferiria con el
// propio script bajo prueba y lo terminaria antes de que arranque.
const nombreBinario = ${JSON.stringify(nombreGh)}.toLowerCase();
if (!process.execPath.toLowerCase().endsWith(nombreBinario)) {
  module.exports = {};
  return;
}

const crudo = process.argv[1];
const cwd = process.cwd();
let primerArg = crudo.slice(cwd.length).replace(/^[\\\\/]+/, '');
const args = [primerArg, ...process.argv.slice(2)];

const modo = process.env.FAKE_GH_MODE || 'ok';

if (args[0] === 'auth' && args[1] === 'status') {
  process.exit(modo === 'sin_auth' ? 1 : 0);
}

if (args[0] === 'issue' && args[1] === 'list') {
  const titulos = JSON.parse(process.env.FAKE_GH_TITULOS_ABIERTOS || '[]');
  process.stdout.write(JSON.stringify(titulos.map(title => ({ title }))));
  process.exit(0);
}

if (args[0] === 'issue' && args[1] === 'create') {
  if (modo === 'issue_create_falla') {
    process.stderr.write('gh: error simulado al crear issue\\n');
    process.exit(1);
  }
  const bodyFileIdx = args.indexOf('--body-file');
  const bodyFile = args[bodyFileIdx + 1];
  const bodyContenido = fs.readFileSync(bodyFile, 'utf8');
  if (process.env.FAKE_GH_ULTIMO_BODY_FILE_OUT) {
    fs.writeFileSync(process.env.FAKE_GH_ULTIMO_BODY_FILE_OUT, bodyContenido, 'utf8');
  }
  process.stdout.write('https://github.com/salvex93/ai-core/issues/999\\n');
  process.exit(0);
}

process.exit(1);
`, 'utf8');

  return { ghExe, hookScript };
}

function crearCola(eventos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-reporter-gh-'));
  const queuePath = path.join(dir, 'EVENTS_QUEUE.json');
  fs.writeFileSync(queuePath, JSON.stringify(eventos, null, 2), 'utf8');
  return { dir, queuePath };
}

function correr(queuePath, envExtra = {}) {
  const dirFakeGh = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-reporter-fakebin-'));
  const { hookScript } = crearFakeGh(dirFakeGh);
  const r = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AI_CORE_EVENTS_QUEUE_PATH: queuePath,
      PATH: `${dirFakeGh}${path.delimiter}${process.env.PATH || ''}`,
      NODE_OPTIONS: `--require ${JSON.stringify(hookScript)}`,
      ...envExtra,
    },
  });
  fs.rmSync(dirFakeGh, { recursive: true, force: true });
  return r;
}

describe('issue-reporter.js — camino con gh CLI disponible', () => {
  test('sin eventos pendientes: no invoca gh, informa cola vacia', () => {
    const { dir, queuePath } = crearCola([]);
    const r = correr(queuePath);
    fs.rmSync(dir, { recursive: true, force: true });

    assert.equal(r.status, 0);
    assert.match(r.stderr, /Sin eventos pendientes/);
  });

  test('con eventos pendientes de un tipo: abre 1 issue, marca reported=true y persiste la cola', () => {
    const { dir, queuePath } = crearCola([
      { id: 'ev-1', type: 'hook_failure', tool: 'standards-guard', error: 'archivo demasiado largo', ts: new Date().toISOString(), reported: false },
    ]);
    const r = correr(queuePath, { FAKE_GH_TITULOS_ABIERTOS: '[]' });

    const colaFinal = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    fs.rmSync(dir, { recursive: true, force: true });

    assert.equal(r.status, 0);
    assert.match(r.stderr, /1 evento\(s\) reportados a salvex93\/ai-core/);
    assert.equal(colaFinal[0].reported, true);
  });

  test('eventos de dos tipos distintos generan dos issues separados', () => {
    const { dir, queuePath } = crearCola([
      { id: 'ev-1', type: 'hook_failure', tool: 'standards-guard', error: 'error A', ts: new Date().toISOString(), reported: false },
      { id: 'ev-2', type: 'skill_gap',    tool: 'n/a',             error: 'error B', ts: new Date().toISOString(), reported: false },
    ]);
    const r = correr(queuePath, { FAKE_GH_TITULOS_ABIERTOS: '[]' });

    const colaFinal = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    fs.rmSync(dir, { recursive: true, force: true });

    assert.match(r.stderr, /2 evento\(s\) reportados/);
    assert.ok(colaFinal.every(e => e.reported === true));
  });

  test('titulo ya existe entre los issues abiertos: se omite la creacion pero igual se marca reported=true', () => {
    const { dir, queuePath } = crearCola([
      { id: 'ev-1', type: 'hook_failure', tool: 'standards-guard', error: 'archivo demasiado largo en pmo/assets/js/app.js', ts: new Date().toISOString(), reported: false },
    ]);
    const tituloExistente = '[HOOK-FAIL] standards-guard — archivo demasiado largo en pmo/assets/js/app.js (x5)';
    const r = correr(queuePath, { FAKE_GH_TITULOS_ABIERTOS: JSON.stringify([tituloExistente]) });

    const colaFinal = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    fs.rmSync(dir, { recursive: true, force: true });

    assert.match(r.stderr, /Omitido \(ya existe issue abierto equivalente\)/);
    assert.equal(colaFinal[0].reported, true);
  });

  test('gh issue create falla: el evento NO se marca reported=true, para reintentar despues', () => {
    const { dir, queuePath } = crearCola([
      { id: 'ev-1', type: 'mcp_failure', tool: 'gemini-bridge', error: 'timeout', ts: new Date().toISOString(), reported: false },
    ]);
    const r = correr(queuePath, { FAKE_GH_MODE: 'issue_create_falla', FAKE_GH_TITULOS_ABIERTOS: '[]' });

    const colaFinal = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    fs.rmSync(dir, { recursive: true, force: true });

    assert.match(r.stderr, /Error al abrir issue/);
    assert.equal(colaFinal[0].reported, false);
    assert.match(r.stderr, /0 evento\(s\) reportados/);
  });

  test('eventos reportados con mas de 7 dias de antiguedad se eliminan de la cola tras el ciclo', () => {
    const viejo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const reciente = new Date().toISOString();
    const { dir, queuePath } = crearCola([
      { id: 'ev-viejo', type: 'hook_failure', tool: 'x', error: 'y', ts: viejo, reported: true },
      { id: 'ev-nuevo', type: 'skill_gap',    tool: 'x', error: 'z', ts: reciente, reported: false },
    ]);
    const r = correr(queuePath, { FAKE_GH_TITULOS_ABIERTOS: '[]' });

    const colaFinal = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    fs.rmSync(dir, { recursive: true, force: true });

    assert.equal(r.status, 0);
    assert.equal(colaFinal.length, 1);
    assert.equal(colaFinal[0].id, 'ev-nuevo');
  });

  test('el body del issue incluye version del harness, sesiones afectadas y seccion de reproduccion/propuesta', () => {
    const { dir, queuePath } = crearCola([
      { id: 'ev-1', type: 'skill_gap', tool: 'n/a', context: 'falta soporte para X', error: 'sin skill adecuado', session: 'sesion-abc', ts: new Date().toISOString(), reported: false },
    ]);
    const bodyOutPath = path.join(dir, 'body_capturado.md');
    const r = correr(queuePath, {
      FAKE_GH_TITULOS_ABIERTOS: '[]',
      FAKE_GH_ULTIMO_BODY_FILE_OUT: bodyOutPath,
    });

    assert.equal(r.status, 0);
    const body = fs.readFileSync(bodyOutPath, 'utf8');
    fs.rmSync(dir, { recursive: true, force: true });

    assert.match(body, /## Contexto/);
    assert.match(body, /sesion-abc/);
    assert.match(body, /## Reproduccion/);
    assert.match(body, /## Propuesta/);
    assert.match(body, /falta soporte para X/);
  });
});
