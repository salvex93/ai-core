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

  test('issue #256: reintento con espacios extra/colapsables en el comando SI reconoce la aprobacion (contexto normalizado)', () => {
    const { mod, dir } = cargarModuloAislado();
    const comandoOriginal = 'docker volume rm  mi-volumen';
    const comandoReintento = 'docker volume rm mi-volumen';
    const id = mod.solicitarBreakGlass('destructive-op-guard', comandoOriginal);
    mod.confirmarBreakGlass(id);

    assert.equal(
      mod.accionAprobada('destructive-op-guard', comandoReintento),
      true,
      'una diferencia de espacios entre el comando bloqueado y el reintento no debe invalidar la aprobacion ya confirmada'
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('cadena de hash del log (G7)', () => {
    test('cada entrada registrada incluye hashPrevio y hash propio', () => {
      const { mod, dir } = cargarModuloAislado();
      const id = mod.solicitarBreakGlass('test-guard', 'comando de prueba');
      mod.confirmarBreakGlass(id);

      const entrada = JSON.parse(fs.readFileSync(mod.LOG_PATH, 'utf8').trim());
      assert.equal(entrada.hashPrevio, '0'.repeat(64), 'la primera entrada encadena contra un hash inicial fijo (genesis)');
      assert.match(entrada.hash, /^[a-f0-9]{64}$/, 'hash SHA-256 en hex');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('la segunda entrada encadena hashPrevio contra el hash de la primera', () => {
      const { mod, dir } = cargarModuloAislado();
      const id1 = mod.solicitarBreakGlass('test-guard', 'comando 1');
      mod.confirmarBreakGlass(id1);
      const id2 = mod.solicitarBreakGlass('test-guard', 'comando 2');
      mod.confirmarBreakGlass(id2);

      const [linea1, linea2] = fs.readFileSync(mod.LOG_PATH, 'utf8').trim().split('\n');
      const entrada1 = JSON.parse(linea1);
      const entrada2 = JSON.parse(linea2);
      assert.equal(entrada2.hashPrevio, entrada1.hash, 'cada entrada encadena contra el hash real de la anterior');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('verificarCadenaLog() retorna integra: true sobre un log no manipulado', () => {
      const { mod, dir } = cargarModuloAislado();
      const id1 = mod.solicitarBreakGlass('test-guard', 'comando 1');
      mod.confirmarBreakGlass(id1);
      const id2 = mod.solicitarBreakGlass('test-guard', 'comando 2');
      mod.confirmarBreakGlass(id2);

      const resultado = mod.verificarCadenaLog();
      assert.equal(resultado.integra, true);
      assert.equal(resultado.totalEntradas, 2);
      assert.equal(resultado.primeraRota, null);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('verificarCadenaLog() detecta una entrada intermedia editada (hash ya no coincide con su propio contenido)', () => {
      const { mod, dir } = cargarModuloAislado();
      const id1 = mod.solicitarBreakGlass('test-guard', 'comando 1');
      mod.confirmarBreakGlass(id1);
      const id2 = mod.solicitarBreakGlass('test-guard', 'comando 2');
      mod.confirmarBreakGlass(id2);

      const lineas = fs.readFileSync(mod.LOG_PATH, 'utf8').trim().split('\n');
      const entrada1 = JSON.parse(lineas[0]);
      entrada1.contexto = 'comando 1 MANIPULADO';
      lineas[0] = JSON.stringify(entrada1);
      fs.writeFileSync(mod.LOG_PATH, lineas.join('\n') + '\n', 'utf8');

      const resultado = mod.verificarCadenaLog();
      assert.equal(resultado.integra, false);
      assert.equal(resultado.primeraRota, 0, 'reporta el indice de la primera entrada rota');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('verificarCadenaLog() detecta una entrada eliminada del medio (rompe hashPrevio de la siguiente)', () => {
      const { mod, dir } = cargarModuloAislado();
      const id1 = mod.solicitarBreakGlass('test-guard', 'comando 1');
      mod.confirmarBreakGlass(id1);
      const id2 = mod.solicitarBreakGlass('test-guard', 'comando 2');
      mod.confirmarBreakGlass(id2);
      const id3 = mod.solicitarBreakGlass('test-guard', 'comando 3');
      mod.confirmarBreakGlass(id3);

      const lineas = fs.readFileSync(mod.LOG_PATH, 'utf8').trim().split('\n');
      fs.writeFileSync(mod.LOG_PATH, [lineas[0], lineas[2]].join('\n') + '\n', 'utf8');

      const resultado = mod.verificarCadenaLog();
      assert.equal(resultado.integra, false);
      assert.equal(resultado.primeraRota, 1, 'la entrada sobreviviente en indice 1 ya no encadena contra la 0');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('verificarCadenaLog() sobre un log inexistente retorna integra: true con 0 entradas (nada que romper)', () => {
      const { mod, dir } = cargarModuloAislado();
      const resultado = mod.verificarCadenaLog();
      assert.equal(resultado.integra, true);
      assert.equal(resultado.totalEntradas, 0);
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });
});
