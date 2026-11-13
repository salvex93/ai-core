'use strict';

/**
 * Regresion de la auditoria de guardianes: perfiles de --permission mas
 * estrechos que lo que el script necesita (fail-open silencioso) y el
 * patron de OpenAI que no cubria claves con prefijo.
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN } = require('./_shared');

const { buildHooksSection } = require(path.join(BIN, 'hooks-definition.js'));
const { buscarCredenciales } = require(path.join(BIN, 'lib', 'patrones-secretos.js'));

const TMP = fs.realpathSync(os.tmpdir());
const bin = (s) => `"${path.join(BIN, s)}"`;

function comandos(hooks) {
  return Object.values(hooks).flatMap((entradas) => entradas.flatMap((e) => e.hooks.map((h) => h.command)));
}

// Reemplaza el script del hook por -e para ejercitar EXACTAMENTE los flags
// de permisos que genera la configuracion, no una copia de ellos.
function ejecutarBajoPerfil(script, codigo) {
  const hooks = buildHooksSection(bin, TMP);
  const comando = comandos(hooks).find((c) => c.includes(`${script}"`) && c.includes('--permission'));
  assert.ok(comando, `${script} debe registrarse con --permission`);
  const inicio = comando.indexOf('node --permission');
  const fin = comando.indexOf(bin(script)) + bin(script).length;
  const invocacion = comando.slice(inicio, fin).replace(bin(script), `-e ${JSON.stringify(codigo)}`);
  return spawnSync(invocacion, { shell: true, cwd: REPO, encoding: 'utf8' });
}

describe('perfiles de permisos suficientes para lo que el hook realmente toca', () => {
  test('injection-quarantine-guard puede leer el directorio de cuarentena de la sesion', () => {
    const dir = path.join(TMP, 'ai-core-locks', 'injection-quarantine', `auditoria-${process.pid}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'x.json'), '{}');
    const r = ejecutarBajoPerfil('injection-quarantine-guard.js', `console.log(require('node:fs').readdirSync(${JSON.stringify(dir)}).length)`);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '1');
  });

  test('detect-role puede cargar el clasificador de scripts/services', () => {
    const clasificador = path.join(REPO, 'scripts', 'services', 'IntentClassifier.js');
    const r = ejecutarBajoPerfil('detect-role.js', `require(${JSON.stringify(clasificador)}); console.log('ok')`);
    assert.equal(r.status, 0, r.stderr);
  });

  test('subagent-grader puede cargar SubagentGrader de scripts/services', () => {
    const grader = path.join(REPO, 'scripts', 'services', 'SubagentGrader.js');
    const r = ejecutarBajoPerfil('subagent-grader.js', `require(${JSON.stringify(grader)}); console.log('ok')`);
    assert.equal(r.status, 0, r.stderr);
  });

  test('error: un perfil de solo bin/* niega la lectura del repo (el defecto original)', () => {
    const r = spawnSync('node', ['--permission', `--allow-fs-read=${BIN}/*`, '-e', `require('node:fs').readdirSync(${JSON.stringify(path.join(REPO, 'scripts'))})`], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ERR_ACCESS_DENIED/);
  });
});

describe('patrones-secretos: claves de OpenAI con prefijo', () => {
  // Las claves se arman en runtime para no dejar un literal con forma de credencial
  const cuerpo = 'a'.repeat(30);
  for (const prefijo of ['sk-', 'sk-proj-', 'sk-ant-api03-', 'sk-svcacct-']) {
    test(`detecta ${prefijo}...`, () => {
      assert.ok(buscarCredenciales(`usa ${prefijo}${cuerpo} aqui`).length > 0);
    });
  }

  test('error: texto sin credencial no dispara', () => {
    assert.equal(buscarCredenciales('el sk es corto y sin forma de clave').length, 0);
  });
});
