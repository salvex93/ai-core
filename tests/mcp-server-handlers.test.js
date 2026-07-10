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
});
