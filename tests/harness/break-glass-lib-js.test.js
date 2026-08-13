'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');

describe('lib/break-glass.js', () => {
  function cargarModuloAislado() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'break-glass-test-'));
    process.env.AI_CORE_BREAK_GLASS_DIR = path.join(dir, 'locks');
    process.env.AI_CORE_BREAK_GLASS_LOG = path.join(dir, 'BREAK_GLASS_LOG.jsonl');
    delete require.cache[require.resolve('../../.claude/bin/lib/break-glass')];
    const mod = require('../../.claude/bin/lib/break-glass');
    return { mod, dir };
  }

  test('solicitarBreakGlass genera un id de 8 hex chars', () => {
    const { mod, dir } = cargarModuloAislado();
    const id = mod.solicitarBreakGlass('test-guard', 'comando de prueba');
    assert.match(id, /^[a-f0-9]{8}$/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('confirmarBreakGlass con id valido retorna true y consume el lock (un solo uso)', () => {
    const { mod, dir } = cargarModuloAislado();
    const id = mod.solicitarBreakGlass('test-guard', 'comando de prueba');

    assert.equal(mod.confirmarBreakGlass(id), true, 'primera confirmacion debe ser valida');
    assert.equal(mod.confirmarBreakGlass(id), false, 'el mismo id ya consumido no debe volver a confirmar');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('confirmarBreakGlass con id inexistente retorna false', () => {
    const { mod, dir } = cargarModuloAislado();
    assert.equal(mod.confirmarBreakGlass('deadbeef'), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('confirmarBreakGlass con id vencido (TTL) retorna false', () => {
    const { mod, dir } = cargarModuloAislado();
    const id = mod.solicitarBreakGlass('test-guard', 'comando de prueba');

    const archivo = path.join(mod.LOCKS_DIR, `${id}.json`);
    const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    datos.ts = Date.now() - (10 * 60 * 1000);
    fs.writeFileSync(archivo, JSON.stringify(datos), 'utf8');

    assert.equal(mod.confirmarBreakGlass(id), false, 'un lock vencido no debe confirmar');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('una confirmacion exitosa registra una linea en BREAK_GLASS_LOG.jsonl con guardId y contexto', () => {
    const { mod, dir } = cargarModuloAislado();
    const id = mod.solicitarBreakGlass('mutating-action-guard', 'mcp__pmo__crear_tarea');
    mod.confirmarBreakGlass(id);

    const contenido = fs.readFileSync(mod.LOG_PATH, 'utf8').trim().split('\n');
    assert.equal(contenido.length, 1);
    const entrada = JSON.parse(contenido[0]);
    assert.equal(entrada.guardId, 'mutating-action-guard');
    assert.equal(entrada.contexto, 'mcp__pmo__crear_tarea');
    assert.equal(entrada.id, id);
    assert.ok(entrada.confirmadoEn > 0);
    assert.ok(entrada.solicitadoEn > 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('una confirmacion fallida (id invalido) NO registra nada en el log', () => {
    const { mod, dir } = cargarModuloAislado();
    mod.confirmarBreakGlass('deadbeef');
    assert.equal(fs.existsSync(mod.LOG_PATH), false, 'sin confirmacion exitosa, el log no debe crearse');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('confirmarBreakGlass registra el contexto como accion aprobada, consultable via accionAprobada', () => {
    const { mod, dir } = cargarModuloAislado();
    const hashAccion = 'abc123def456';
    const id = mod.solicitarBreakGlass('mutating-action-guard', hashAccion);

    assert.equal(mod.accionAprobada('mutating-action-guard', hashAccion), false, 'antes de confirmar, no debe estar aprobada');
    mod.confirmarBreakGlass(id);
    assert.equal(mod.accionAprobada('mutating-action-guard', hashAccion), true, 'tras confirmar, debe reconocerse como aprobada');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('accionAprobada consume la aprobacion (un solo reintento, no una excepcion permanente)', () => {
    const { mod, dir } = cargarModuloAislado();
    const hashAccion = 'abc123def456';
    const id = mod.solicitarBreakGlass('mutating-action-guard', hashAccion);
    mod.confirmarBreakGlass(id);

    assert.equal(mod.accionAprobada('mutating-action-guard', hashAccion), true, 'primer chequeo consume la aprobacion');
    assert.equal(mod.accionAprobada('mutating-action-guard', hashAccion), false, 'un segundo intento de la misma accion ya no debe estar aprobado');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('accionAprobada con guardId distinto al aprobado no reconoce la aprobacion', () => {
    const { mod, dir } = cargarModuloAislado();
    const hashAccion = 'abc123def456';
    const id = mod.solicitarBreakGlass('mutating-action-guard', hashAccion);
    mod.confirmarBreakGlass(id);

    assert.equal(mod.accionAprobada('otro-guard', hashAccion), false, 'una aprobacion de un guard no debe filtrarse a otro guard');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
