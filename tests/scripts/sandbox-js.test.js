'use strict';

/**
 * sandbox.js — capacidad OPCIONAL de correr en contenedor Docker. Estos
 * tests verifican el comportamiento cuando Docker no esta disponible (el
 * caso comun en CI y en la mayoria de dev machines sin Docker instalado) --
 * debe fallar con mensaje claro, nunca degradar silenciosamente ni romper
 * el resto del harness.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const { spawnSync } = require('node:child_process');

const REPO   = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'sandbox.js');

describe('sandbox.js', () => {
  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('docker/Dockerfile existe', () => {
    assert.ok(fs.existsSync(path.join(REPO, 'docker', 'Dockerfile')));
  });

  test('docker/docker-compose.yml existe', () => {
    assert.ok(fs.existsSync(path.join(REPO, 'docker', 'docker-compose.yml')));
  });

  test('registrado como npm run sandbox en package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.sandbox, 'node scripts/sandbox.js');
  });

  test('sin Docker disponible: exit distinto de 0, mensaje explicativo por stderr, nunca lanza excepcion no capturada', () => {
    // Invocar node por ruta absoluta (process.execPath) en vez del PATH --
    // se vacia PATH para que "docker" no se resuelva en ningun directorio,
    // sin impedir que el propio spawnSync encuentre el binario de node.
    const r = spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
    });
    assert.notEqual(r.status, 0, 'debe fallar explicitamente si Docker no esta disponible');
    assert.match(r.stderr, /Docker no esta instalado|no esta en PATH/i);
    assert.match(r.stderr, /opcional/i, 'debe aclarar que es una capacidad opcional, no rompe el uso normal');
  });

  test('docker-compose.yml no monta secretos hardcodeados -- las API keys vienen de variables de entorno del host', () => {
    const compose = fs.readFileSync(path.join(REPO, 'docker', 'docker-compose.yml'), 'utf8');
    assert.doesNotMatch(compose, /sk-[a-zA-Z0-9]{10,}/, 'no debe haber ninguna API key literal');
    assert.match(compose, /ANTHROPIC_API_KEY/);
    assert.match(compose, /GEMINI_API_KEY/);
  });

  test('docker-compose.yml aisla el filesystem del host al volumen declarado (no monta la raiz del host)', () => {
    const compose = fs.readFileSync(path.join(REPO, 'docker', 'docker-compose.yml'), 'utf8');
    assert.doesNotMatch(compose, /- ["']?\/:\//, 'nunca debe montar la raiz del filesystem del host');
    assert.match(compose, /cap_drop/);
    assert.match(compose, /no-new-privileges/);
  });
});
