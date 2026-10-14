'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const { spawnSync } = require('node:child_process');
const { BIN, SETTINGS } = require('./_shared');
const { BASE_PERMISSIONS, AI_CORE_EXTRA_PERMISSIONS, DENY_PERMISSIONS } = require('../../.claude/bin/lib/base-permissions');
const { buildSettingsForHost, mergeHostSettings } = require('../../.claude/bin/lib/host-settings');

const contenidoDe = (regla) => regla.slice(regla.indexOf('(') + 1, -1);

describe('permissions.deny para secretos', () => {
  test('DENY_PERMISSIONS es una lista no vacia de reglas Read(...) o Edit(...)', () => {
    assert.ok(Array.isArray(DENY_PERMISSIONS) && DENY_PERMISSIONS.length > 0);
    for (const regla of DENY_PERMISSIONS) assert.match(regla, /^(Read|Edit)\(.+\)$/, `regla invalida: ${regla}`);
  });

  test('cubre .env y claves privadas tanto en Read como en Edit', () => {
    for (const herramienta of ['Read', 'Edit']) {
      for (const ruta of ['.env', '.env.local', '.env.production', '**/*.pem', '**/*.key']) {
        assert.ok(DENY_PERMISSIONS.includes(`${herramienta}(${ruta})`), `falta ${herramienta}(${ruta})`);
      }
    }
    for (const ruta of ['~/.ssh/id_ed25519', '~/.ssh/id_rsa', '~/.aws/credentials']) {
      assert.ok(DENY_PERMISSIONS.includes(`Read(${ruta})`), `falta Read(${ruta})`);
    }
  });

  test('no bloquea .env.example ni la clave publica que el allow permite leer', () => {
    const rutas = DENY_PERMISSIONS.map(contenidoDe);
    assert.ok(!rutas.includes('.env.*'), '.env.* bloquearia .env.example');
    assert.ok(!rutas.some(r => r === '~/.ssh/**' || r === '~/.ssh/id_*'), 'un deny amplio anularia Bash(cat ~/.ssh/id_ed25519.pub)');
  });

  test('ninguna regla de deny es tambien un allow (deny gana y dejaria el allow muerto)', () => {
    const allow = new Set([...BASE_PERMISSIONS, ...AI_CORE_EXTRA_PERMISSIONS]);
    for (const regla of DENY_PERMISSIONS) assert.ok(!allow.has(regla), `contradiccion: ${regla}`);
  });

  test('sin duplicados', () => {
    assert.equal(new Set(DENY_PERMISSIONS).size, DENY_PERMISSIONS.length);
  });

  test('settings.json de ai-core contiene el deny completo', () => {
    const { permissions } = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    for (const regla of DENY_PERMISSIONS) assert.ok(permissions.deny?.includes(regla), `settings.json sin ${regla}`);
  });

  test('buildSettingsForHost incluye el deny', () => {
    const { permissions } = buildSettingsForHost('/core', []);
    assert.deepEqual(permissions.deny, [...DENY_PERMISSIONS]);
  });

  test('mergeHostSettings une el deny del anfitrion con el generado sin perder ninguno', () => {
    const existing = { permissions: { allow: [], deny: ['Read(secretos-del-cliente.txt)'] } };
    const merged = mergeHostSettings(existing, buildSettingsForHost('/core', []));
    assert.ok(merged.permissions.deny.includes('Read(secretos-del-cliente.txt)'));
    for (const regla of DENY_PERMISSIONS) assert.ok(merged.permissions.deny.includes(regla));
  });
});

describe('norm-harness.js agrega el deny a un anfitrion ya normalizado', () => {
  test('settings previo sin deny y sin path drift: se completa igual', () => {
    const host = fs.mkdtempSync(path.join(os.tmpdir(), 'deny-host-'));
    const git = (...a) => spawnSync('git', a, { cwd: host });
    git('init', '-q');
    fs.writeFileSync(path.join(host, 'package.json'), '{}');
    const primera = spawnSync('node', [path.join(BIN, 'norm-harness.js')], { cwd: host, encoding: 'utf8' });
    assert.equal(primera.status, 0, primera.stderr);

    const ruta = path.join(host, '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    delete settings.permissions.deny;
    fs.writeFileSync(ruta, JSON.stringify(settings, null, 2));

    const segunda = spawnSync('node', [path.join(BIN, 'norm-harness.js')], { cwd: host, encoding: 'utf8' });
    assert.equal(segunda.status, 0, segunda.stderr);
    const final = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    for (const regla of DENY_PERMISSIONS) assert.ok(final.permissions.deny?.includes(regla), `anfitrion sin ${regla}`);
    fs.rmSync(host, { recursive: true, force: true });
  });
});
