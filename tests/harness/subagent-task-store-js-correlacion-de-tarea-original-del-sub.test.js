'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('subagent-task-store.js (correlacion de tarea original del subagente)', () => {
  const SCRIPT = path.join(BIN, 'lib', 'subagent-task-store.js');
  const { guardarTarea, recuperarTarea, STORE_PATH } = require(SCRIPT);

  after(() => {
    fs.rmSync(STORE_PATH, { force: true });
  });

  test('el modulo existe', () => {
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('guardarTarea + recuperarTarea: correlaciona por session_id + prompt_id', () => {
    // Regresion evitada: verificado empiricamente (2026-07-22) que tool_use_id
    // (PreToolUse) y agent_id (SubagentStop) NO correlacionan entre si -- son
    // valores distintos. session_id + prompt_id si son identicos en ambos
    // eventos del mismo subagente, confirmado lanzando un subagente real.
    guardarTarea('sess-1', 'prompt-1', 'tarea original de prueba');
    const tarea = recuperarTarea('sess-1', 'prompt-1');
    assert.equal(tarea, 'tarea original de prueba');
  });

  test('recuperarTarea borra la entrada tras leerla (evita acumulacion)', () => {
    guardarTarea('sess-2', 'prompt-2', 'otra tarea');
    recuperarTarea('sess-2', 'prompt-2');
    const segundaLectura = recuperarTarea('sess-2', 'prompt-2');
    assert.equal(segundaLectura, null, 'la segunda lectura no debe encontrar nada, ya se consumio');
  });

  test('recuperarTarea con clave inexistente retorna null', () => {
    const tarea = recuperarTarea('sess-inexistente', 'prompt-inexistente');
    assert.equal(tarea, null);
  });

  test('entradas mas viejas que el TTL se descartan al recuperar', () => {
    const fs2 = require('node:fs');
    guardarTarea('sess-3', 'prompt-3', 'tarea vieja');
    const store = JSON.parse(fs2.readFileSync(STORE_PATH, 'utf8'));
    store['sess-3::prompt-3'].ts = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min atras
    fs2.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
    const tarea = recuperarTarea('sess-3', 'prompt-3');
    assert.equal(tarea, null, 'entradas mas viejas que el TTL no deben recuperarse');
  });
});
