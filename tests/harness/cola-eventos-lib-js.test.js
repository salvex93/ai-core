'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { BIN } = require('./_shared');

const LIB = path.join(BIN, 'lib', 'cola-eventos.js');
const { leerCola, escribirCola, actualizarCola } = require(LIB);

describe('lib/cola-eventos.js', () => {
  let dir; let ruta;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cola-eventos-'));
    ruta = path.join(dir, 'EVENTS_QUEUE.json');
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const hermanos = () => fs.readdirSync(dir).filter((f) => f !== 'EVENTS_QUEUE.json');

  test('leerCola devuelve [] si el archivo no existe y no crea nada', () => {
    assert.deepEqual(leerCola(ruta), []);
    assert.deepEqual(fs.readdirSync(dir), []);
  });

  test('leerCola devuelve el contenido valido', () => {
    fs.writeFileSync(ruta, JSON.stringify([{ id: 'a' }]));
    assert.deepEqual(leerCola(ruta), [{ id: 'a' }]);
  });

  for (const [nombre, contenido] of [['JSON truncado', '[{"id":"a"'], ['JSON que no es un arreglo', '{"id":"a"}']]) {
    test(`error: ${nombre} se aparta a .corrupt en lugar de sobrescribirse`, () => {
      fs.writeFileSync(ruta, contenido);
      assert.deepEqual(leerCola(ruta), []);
      assert.equal(fs.existsSync(ruta), false);
      const corrupto = hermanos().find((f) => f.includes('.corrupt-'));
      assert.ok(corrupto, 'debe existir una copia .corrupt-*');
      assert.equal(fs.readFileSync(path.join(dir, corrupto), 'utf8'), contenido);
    });
  }

  test('escribirCola es atomica: no deja temporales y el contenido es exacto', () => {
    escribirCola(ruta, [{ id: 'x' }]);
    assert.deepEqual(JSON.parse(fs.readFileSync(ruta, 'utf8')), [{ id: 'x' }]);
    assert.deepEqual(hermanos(), []);
  });

  test('actualizarCola aplica la funcion sobre la cola vigente y persiste', () => {
    escribirCola(ruta, [{ id: 'a' }]);
    actualizarCola(ruta, (cola) => [...cola, { id: 'b' }]);
    assert.deepEqual(leerCola(ruta).map((e) => e.id), ['a', 'b']);
    assert.deepEqual(hermanos(), []);
  });

  test('actualizarCola no escribe si la funcion devuelve null', () => {
    escribirCola(ruta, [{ id: 'a' }]);
    actualizarCola(ruta, () => null);
    assert.deepEqual(leerCola(ruta).map((e) => e.id), ['a']);
  });

  test('error: si la funcion lanza, la cola queda intacta y el lock se libera', () => {
    escribirCola(ruta, [{ id: 'a' }]);
    assert.throws(() => actualizarCola(ruta, () => { throw new Error('falla'); }), /falla/);
    assert.deepEqual(leerCola(ruta).map((e) => e.id), ['a']);
    actualizarCola(ruta, (cola) => [...cola, { id: 'b' }]);
    assert.equal(leerCola(ruta).length, 2);
  });

  test('procesos concurrentes no pierden eventos', async () => {
    const N = 8;
    const codigo = `const { actualizarCola } = require(${JSON.stringify(LIB)}); actualizarCola(${JSON.stringify(ruta)}, (c) => [...c, { id: process.argv[1] }]);`;
    await Promise.all(Array.from({ length: N }, (_, i) => new Promise((resolve, reject) => {
      const p = spawn('node', ['-e', codigo, `p${i}`], { stdio: 'inherit' });
      p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`hijo ${i} salio con ${c}`))));
    })));
    assert.equal(leerCola(ruta).length, N);
    assert.deepEqual(hermanos(), []);
  });

  test('capture-event con una cola corrupta la conserva como .corrupt y encola el evento nuevo', () => {
    fs.writeFileSync(ruta, '[{"id":"previo"');
    const env = { ...process.env, AI_CORE_EVENTS_QUEUE_PATH: ruta };
    delete env.AI_CORE_TEST_MODE;
    const r = spawnSync('node', [path.join(BIN, 'capture-event.js'), '--type', 'harness_error', '--tool', 'cola-corrupta', '--error', 'fallo de prueba'], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(leerCola(ruta).map((e) => e.tool), ['cola-corrupta']);
    assert.ok(hermanos().some((f) => f.includes('.corrupt-')), 'la cola original no debe perderse');
  });
});
