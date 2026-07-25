'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('CrossVerifier.js (verificacion cross-model)', () => {
  const SCRIPT = path.join(REPO, 'scripts', 'services', 'CrossVerifier.js');
  const { seleccionarVerificador, parsearVeredicto, verificar, PROVEEDORES_VERIFICADOR } = require(SCRIPT);

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'CrossVerifier.js debe existir en scripts/services/');
  });

  test('seleccionarVerificador: elige proveedor distinto al actor', () => {
    const disponibles = [
      { provider: 'anthropic', available: true },
      { provider: 'deepseek',  available: true },
      { provider: 'openai',    available: true },
    ];
    const elegido = seleccionarVerificador('anthropic', disponibles);
    assert.notEqual(elegido, 'anthropic', 'el verificador nunca debe ser el mismo proveedor que el actor');
    assert.ok(PROVEEDORES_VERIFICADOR.includes(elegido), 'debe elegir de la lista de proveedores validos');
  });

  test('seleccionarVerificador: lanza error si no hay proveedor distinto disponible', () => {
    const disponibles = [{ provider: 'anthropic', available: true }];
    assert.throws(
      () => seleccionarVerificador('anthropic', disponibles),
      /Sin proveedor verificador disponible/,
      'debe fallar explicitamente en vez de usar el mismo proveedor del actor'
    );
  });

  test('parsearVeredicto: camino feliz — JSON valido con pass true', () => {
    const veredicto = parsearVeredicto('{"pass": true, "hallazgos": []}');
    assert.equal(veredicto.pass, true);
    assert.deepEqual(veredicto.hallazgos, []);
  });

  test('parsearVeredicto: detecta regresion con hallazgos', () => {
    const texto = '{"pass": false, "hallazgos": [{"severidad": "alta", "descripcion": "rompe test X"}]}';
    const veredicto = parsearVeredicto(texto);
    assert.equal(veredicto.pass, false);
    assert.equal(veredicto.hallazgos.length, 1);
    assert.equal(veredicto.hallazgos[0].severidad, 'alta');
  });

  test('parsearVeredicto: output no parseable falla cerrado (pass=false)', () => {
    const veredicto = parsearVeredicto('esto no es JSON');
    assert.equal(veredicto.pass, false, 'output no parseable debe fallar cerrado, nunca asumir pass=true');
    assert.ok(veredicto.hallazgos.length > 0, 'debe reportar el fallo de parseo como hallazgo');
  });

  test('verificar: diff vacio pasa sin llamar a ningun proveedor', async () => {
    const resultado = await verificar({ diff: '', tarea: 'tarea sin cambios' });
    assert.equal(resultado.pass, true);
    assert.equal(resultado.proveedor, null);
  });

  test('verificar: sin proveedor disponible distinto al actor, propaga el error', async () => {
    await assert.rejects(
      () => verificar({
        diff: '+ const x = 1;',
        tarea: 'agregar constante',
        proveedorActor: 'anthropic',
        disponibles: [{ provider: 'anthropic', available: true }],
      }),
      /Sin proveedor verificador disponible/
    );
  });

  test('ModelRouter: tier verificador no asigna modelo Anthropic', () => {
    const { route } = require(path.join(REPO, 'scripts', 'services', 'ModelRouter.js'));
    const resultado = route('verificar_diff');
    assert.equal(resultado.tier, 'verificador');
    assert.equal(resultado.modelo, null, 'la seleccion de proveedor se delega a CrossVerifier, no al router de costo');
  });
});
