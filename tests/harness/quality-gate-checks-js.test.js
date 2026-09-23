'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REPO } = require('./_shared');

const { revisarResiduales, revisarSecretos, revisarLimiteSkills, revisarLicencias } = require(path.join(REPO, 'scripts', 'quality-gate-checks.js'));

// Se arma en runtime para que el propio archivo de test no contenga un patron literal.
const CLAVE_GITHUB = `ghp_${'A'.repeat(36)}`;

function git(cwd, ...args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  return spawnSync('git', args, { cwd, env, encoding: 'utf8' });
}

function escribir(dir, ruta, contenido) {
  const destino = path.join(dir, ruta);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, contenido);
}

describe('quality-gate-checks.js', () => {
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-checks-'));
    git(dir, 'init', '-q');
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  describe('revisarResiduales', () => {
    test('repo sin residuales cumple', () => {
      escribir(dir, 'src/a.js', 'x');
      assert.equal(revisarResiduales(dir).ok, true);
    });

    test('detecta .new, .orig y .rej aunque no esten trackeados', () => {
      for (const f of ['a.js.new', 'b.js.orig', 'c.js.rej']) escribir(dir, f, 'x');
      const r = revisarResiduales(dir);
      assert.equal(r.ok, false);
      assert.match(r.detalle, /a\.js\.new/);
      assert.match(r.detalle, /b\.js\.orig/);
      assert.match(r.detalle, /c\.js\.rej/);
      for (const f of ['a.js.new', 'b.js.orig', 'c.js.rej']) fs.rmSync(path.join(dir, f));
    });

    test('un archivo ignorado por git no cuenta', () => {
      escribir(dir, '.gitignore', '*.new\n');
      escribir(dir, 'ignorado.new', 'x');
      assert.equal(revisarResiduales(dir).ok, true);
    });
  });

  describe('revisarSecretos', () => {
    test('working tree sin credenciales cumple', () => {
      assert.equal(revisarSecretos(dir).ok, true);
    });

    test('detecta una credencial de alta confianza en un archivo del proyecto', () => {
      escribir(dir, 'config/app.js', `const t = '${CLAVE_GITHUB}';\n`);
      const r = revisarSecretos(dir);
      assert.equal(r.ok, false);
      assert.match(r.detalle, /GitHub Personal Access Token: config\/app\.js/);
    });

    test('las credenciales falsas bajo tests/ estan exentas', () => {
      fs.rmSync(path.join(dir, 'config'), { recursive: true });
      escribir(dir, 'tests/fixture.test.js', `const t = '${CLAVE_GITHUB}';\n`);
      assert.equal(revisarSecretos(dir).ok, true);
    });

    test('un binario no se escanea', () => {
      fs.writeFileSync(path.join(dir, 'img.bin'), Buffer.concat([Buffer.from([0]), Buffer.from(CLAVE_GITHUB)]));
      assert.equal(revisarSecretos(dir).ok, true);
    });
  });

  describe('revisarLimiteSkills', () => {
    after(() => fs.rmSync(path.join(dir, '.claude'), { recursive: true, force: true }));

    test('un SKILL.md de 500 lineas o menos cumple', () => {
      escribir(dir, '.claude/skills/foo/SKILL.md', `${'x\n'.repeat(500)}`);
      assert.equal(revisarLimiteSkills(dir).ok, true);
    });

    test('un SKILL.md de mas de 500 lineas falla y cita ruta + conteo', () => {
      escribir(dir, '.claude/skills/bar/SKILL.md', `${'x\n'.repeat(501)}`);
      const r = revisarLimiteSkills(dir);
      assert.equal(r.ok, false);
      assert.match(r.detalle, /501 lineas: \.claude\/skills\/bar\/SKILL\.md/);
    });

    test('archivos dentro de references/ no cuentan para el limite', () => {
      fs.rmSync(path.join(dir, '.claude', 'skills', 'bar'), { recursive: true });
      escribir(dir, '.claude/skills/foo/references/extenso.md', `${'x\n'.repeat(2000)}`);
      assert.equal(revisarLimiteSkills(dir).ok, true);
    });
  });

  describe('revisarLicencias', () => {
    // arbolNpmLs simula la forma real de `npm ls --all --json --long`
    // (dependencies anidado recursivo) sin invocar npm de verdad -- el arbol
    // real del repo se cubre por separado en quality-gate.js via el check
    // real dentro del propio pipeline (dogfooding).
    function arbol(dependencies) {
      return JSON.stringify({ dependencies });
    }

    test('todas las licencias permisivas (MIT/Apache-2.0/ISC/BSD) cumple', () => {
      const salida = arbol({
        foo: { version: '1.0.0', license: 'MIT' },
        bar: { version: '2.0.0', license: 'Apache-2.0', dependencies: {
          baz: { version: '3.0.0', license: 'ISC' },
        } },
      });
      assert.equal(revisarLicencias(salida).ok, true);
    });

    test('detecta una dependencia con licencia GPL-3.0 (copyleft fuerte)', () => {
      const salida = arbol({
        foo: { version: '1.0.0', license: 'MIT' },
        contagiosa: { version: '1.2.3', license: 'GPL-3.0' },
      });
      const r = revisarLicencias(salida);
      assert.equal(r.ok, false);
      assert.match(r.detalle, /GPL-3\.0: contagiosa@1\.2\.3/);
    });

    test('detecta AGPL-3.0 anidada en dependencias transitivas', () => {
      const salida = arbol({
        foo: { version: '1.0.0', license: 'MIT', dependencies: {
          transitiva: { version: '0.1.0', license: 'AGPL-3.0' },
        } },
      });
      const r = revisarLicencias(salida);
      assert.equal(r.ok, false);
      assert.match(r.detalle, /AGPL-3\.0: transitiva@0\.1\.0/);
    });

    test('paquete sin campo license declarado no bloquea (advertencia, no fallo)', () => {
      const salida = arbol({ sinMetadata: { version: '1.0.0' } });
      const r = revisarLicencias(salida);
      assert.equal(r.ok, true);
      assert.match(r.detalle, /sin license declarado: sinMetadata@1\.0\.0/);
    });

    test('JSON invalido de npm ls degrada con mensaje diagnosticable, no lanza', () => {
      const r = revisarLicencias('esto no es JSON');
      assert.equal(r.ok, false);
      assert.match(r.detalle, /no se pudo interpretar la salida de "npm ls"/);
    });
  });
});
