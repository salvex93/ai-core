/**
 * mcp-server-handlers.test.js — Tests de regresion para McpServerHandlers.js
 * Ejecutar: node --test tests/
 * Compatible: Node >= 18 (node:test nativo, sin dependencias externas)
 *
 * Cubre solo las rutas que no requieren llamada real al SDK de Gemini:
 * archivo pequeno (no delegado), archivo/manifiestos inexistentes (error
 * temprano). Las rutas que delegan a Gemini requieren GEMINI_API_KEY real
 * y estan fuera del alcance de un test unitario aislado.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

const {
  analizarArchivo,
  analizarRepositorio,
  resumirBacklog,
  buscarWeb,
} = require('../scripts/services/McpServerHandlers');

describe('analizarArchivo', () => {
  test('archivo pequeno (bajo el umbral): no delega, retorna contenido directo', async () => {
    const tmp = path.join(os.tmpdir(), `mcp-handlers-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'contenido de prueba pequeno', 'utf8');

    const resultado = await analizarArchivo({ ruta: tmp, mision: 'resumir' });
    fs.unlinkSync(tmp);

    assert.equal(resultado.delegado, false);
    assert.equal(resultado.contenido, 'contenido de prueba pequeno');
    assert.match(resultado.motivo, /Archivo pequeno/);
  });

  test('archivo inexistente: retorna error temprano sin llamar a Gemini', async () => {
    const resultado = await analizarArchivo({ ruta: '/tmp/no-existe-jamas-12345.txt', mision: 'x' });
    assert.match(resultado.error, /Archivo no encontrado/);
  });

  test('ruta fuera de process.cwd() emite advertencia en stderr pero no bloquea (tool declarada para "archivos del proyecto" sin enforcement tecnico real -- el Permission Model no cubre el proceso MCP, que corre sin --permission segun settings.json)', async () => {
    const tmp = path.join(os.tmpdir(), `mcp-handlers-fuera-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'contenido fuera del repo', 'utf8');

    let stderrCapturado = '';
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...args) => { stderrCapturado += chunk; return originalWrite(chunk, ...args); };

    let resultado;
    try {
      resultado = await analizarArchivo({ ruta: tmp, mision: 'x' });
    } finally {
      process.stderr.write = originalWrite;
      fs.unlinkSync(tmp);
    }

    assert.equal(resultado.delegado, false, 'debe seguir funcionando (no bloquea), solo advertir');
    assert.match(stderrCapturado, /fuera del directorio del proyecto/i);
  });
});

describe('analizarRepositorio', () => {
  test('sin manifiestos encontrados: retorna error temprano sin llamar a Gemini', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-handlers-repo-'));
    const resultado = await analizarRepositorio({ ruta_raiz: dir, mision: 'detectar stack' });
    fs.rmSync(dir, { recursive: true });

    assert.match(resultado.error, /No se encontraron manifiestos/);
  });
});

describe('resumirBacklog', () => {
  test('BACKLOG.md inexistente: retorna error temprano sin llamar a Gemini', async () => {
    const resultado = await resumirBacklog({ ruta_backlog: '/tmp/no-existe-backlog-12345.md' });
    assert.match(resultado.error, /Archivo no encontrado/);
  });

  test('rama catch: sin GEMINI_API_KEY, getModel() lanza sincrono y se retorna { error } en vez de propagar la excepcion', () => {
    // Gap de cobertura de rama real: el catch(err) de resumirBacklog nunca se
    // ejercitaba porque el unico test previo cubria el early-return (archivo
    // inexistente). GeminiApiClient.getGenAI() lanza 'GEMINI_API_KEY no
    // configurada en .env' de forma SINCRONA antes de cualquier llamada de
    // red -- permite disparar el catch sin mockear el SDK, siguiendo la
    // misma convencion ya documentada en este archivo (sin mocking de
    // @google/genai). Se corre en un proceso hijo con env aislado para no
    // depender de si el entorno local tiene GEMINI_API_KEY real cargada.
    const tmp = path.join(os.tmpdir(), `mcp-handlers-backlog-${Date.now()}.md`);
    fs.writeFileSync(tmp, '| #Tarea | Estatus |\n|---|---|\n| T1 | Pendiente |\n', 'utf8');

    const { spawnSync } = require('node:child_process');
    const script = `
      const { resumirBacklog } = require(${JSON.stringify(path.resolve(__dirname, '../scripts/services/McpServerHandlers.js'))});
      resumirBacklog({ ruta_backlog: ${JSON.stringify(tmp)} }).then(r => {
        process.stdout.write(JSON.stringify(r));
      });
    `;
    const envSinClave = { ...process.env };
    delete envSinClave.GEMINI_API_KEY;

    const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env: envSinClave });
    fs.unlinkSync(tmp);

    assert.equal(r.status, 0, `el proceso hijo no debe fallar: ${r.stderr}`);
    const resultado = JSON.parse(r.stdout);
    assert.match(resultado.error, /Gemini error/, 'debe retornar el error envuelto, nunca lanzar sin capturar');
    assert.match(resultado.error, /GEMINI_API_KEY no configurada/);
  });
});

describe('buscarWeb', () => {
  test('rama catch: sin GEMINI_API_KEY, retorna { error } en vez de propagar la excepcion (rama de error no cubierta previamente)', () => {
    const { spawnSync } = require('node:child_process');
    const script = `
      const { buscarWeb } = require(${JSON.stringify(path.resolve(__dirname, '../scripts/services/McpServerHandlers.js'))});
      buscarWeb({ consulta: 'x', mision: 'y' }).then(r => {
        process.stdout.write(JSON.stringify(r));
      });
    `;
    const envSinClave = { ...process.env };
    delete envSinClave.GEMINI_API_KEY;

    const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env: envSinClave });

    assert.equal(r.status, 0, `el proceso hijo no debe fallar: ${r.stderr}`);
    const resultado = JSON.parse(r.stdout);
    assert.match(resultado.error, /Gemini web search error/, 'debe retornar el error envuelto, nunca lanzar sin capturar');
    assert.match(resultado.error, /GEMINI_API_KEY no configurada/);
  });
});
