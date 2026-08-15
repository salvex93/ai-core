'use strict';

/**
 * lib/deteccion-resolucion-previa.js — cierra la segunda causa raiz
 * confirmada por red-team 2026-08-15: los guards evaluaban el string crudo
 * del comando, nunca lo que ese string produce al ejecutarse (decodificar
 * base64/hex, o reconstruir un comando fragmentado en variables de shell
 * adyacentes). Esta libreria detecta la INTENCION de resolucion previa
 * (no decodifica el contenido real -- eso requeriria interpretar el shell
 * completo, fuera de alcance de un guard quirurgico) y permite negar por
 * defecto ante su presencia, en vez de solo matchear el patron final.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { BIN } = require('./_shared');

const { tieneIndicioDeResolucionPrevia, tieneIndicioDeResolucionPreviaEnTexto } = require(path.join(BIN, 'lib', 'deteccion-resolucion-previa.js'));

describe('lib/deteccion-resolucion-previa.js', () => {
  test('detecta "base64 -d" seguido de ejecucion via pipe a bash/sh', () => {
    const cmd = 'echo cm0gLXJmIC9pbXBvcnRhbnQtZGF0YQ== | base64 -d | bash';
    assert.equal(tieneIndicioDeResolucionPrevia(cmd), true);
  });

  test('detecta "base64 --decode" (forma larga del flag)', () => {
    const cmd = 'echo cm0gLXJmIC9pbXBvcnRhbnQtZGF0YQ== | base64 --decode | sh';
    assert.equal(tieneIndicioDeResolucionPrevia(cmd), true);
  });

  test('detecta Buffer.from(..., "base64") en codigo JS que luego ejecuta', () => {
    const cmd = 'node -e "eval(Buffer.from(\'Y29uc29sZS5sb2coMSk=\',\'base64\').toString())"';
    assert.equal(tieneIndicioDeResolucionPrevia(cmd), true);
  });

  test('detecta fragmentacion de comando en 2+ variables de shell seguida de ejecucion (bash -c "$A$B" o eval "$A$B")', () => {
    const cmd = 'A="rm -"; B="rf /datos"; bash -c "$A$B"';
    assert.equal(tieneIndicioDeResolucionPrevia(cmd), true);
  });

  test('detecta fragmentacion con eval en vez de bash -c', () => {
    const cmd = 'A="rm -rf"; B="/datos"; eval "$A $B"';
    assert.equal(tieneIndicioDeResolucionPrevia(cmd), true);
  });

  test('NO dispara con un solo "echo $VAR" simple sin ejecucion posterior (uso normal, no reconstruye un comando)', () => {
    const cmd = 'A="hola mundo"; echo "$A"';
    assert.equal(tieneIndicioDeResolucionPrevia(cmd), false);
  });

  test('NO dispara con comandos normales sin ningun indicio de encoding/fragmentacion', () => {
    assert.equal(tieneIndicioDeResolucionPrevia('git status --porcelain'), false);
    assert.equal(tieneIndicioDeResolucionPrevia('npm test'), false);
  });

  test('NO dispara con "base64" mencionado como texto/documentacion sin decode + ejecucion', () => {
    const cmd = 'echo "este script usa base64 para codificar el payload"';
    assert.equal(tieneIndicioDeResolucionPrevia(cmd), false);
  });

  test('input no-string retorna false sin lanzar excepcion', () => {
    assert.equal(tieneIndicioDeResolucionPrevia(undefined), false);
    assert.equal(tieneIndicioDeResolucionPrevia(null), false);
  });
});
