'use strict';

/**
 * lib/git-history-secrets-scan.js — escanea el HISTORIAL de git (no solo el
 * working tree actual) en busca de credenciales de alta confianza. Gap real
 * detectado por investigacion de mercado 2026-08-15: secrets-guard.js solo
 * inspecciona el prompt entrante, security-scanner.md (paso 3) solo hace
 * grep del working tree actual -- ningun componente escaneaba commits
 * pasados donde un secreto pudo commitearse y luego borrarse del archivo
 * (sigue vivo en el historial). Patron estandar de mercado: gitleaks/
 * trufflehog escanean `git log -p`, no solo el estado actual.
 *
 * parsearLogParaSecretos() es una funcion pura que recibe el TEXTO de
 * `git log -p --format=COMMIT:%H` ya generado -- no ejecuta git por si
 * misma, para poder testearse con texto sintetico sin depender de un repo
 * git real.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { BIN } = require('./_shared');

const { parsearLogParaSecretos } = require(path.join(BIN, 'lib', 'git-history-secrets-scan.js'));

describe('lib/git-history-secrets-scan.js — parsearLogParaSecretos()', () => {
  test('detecta un GitHub PAT real en el diff de un commit', () => {
    const log = [
      'COMMIT:abc1234',
      '',
      'diff --git a/config.js b/config.js',
      '+++ b/config.js',
      '@@ -1 +1 @@',
      '+const token = "ghp_' + 'a'.repeat(36) + '";',
    ].join('\n');

    const hallazgos = parsearLogParaSecretos(log);
    assert.equal(hallazgos.length, 1);
    assert.equal(hallazgos[0].commit, 'abc1234');
    assert.equal(hallazgos[0].etiqueta, 'GitHub Personal Access Token');
  });

  test('agrupa multiples hallazgos bajo su commit correspondiente, incluso en commits distintos', () => {
    const log = [
      'COMMIT:commit1',
      '+const key = "AKIA' + 'B'.repeat(16) + '";',
      'COMMIT:commit2',
      '+const openaiKey = "sk-' + 'c'.repeat(25) + '";',
    ].join('\n');

    const hallazgos = parsearLogParaSecretos(log);
    assert.equal(hallazgos.length, 2);
    assert.equal(hallazgos[0].commit, 'commit1');
    assert.equal(hallazgos[0].etiqueta, 'AWS Access Key ID');
    assert.equal(hallazgos[1].commit, 'commit2');
    assert.equal(hallazgos[1].etiqueta, 'OpenAI API key');
  });

  test('ignora lineas de contexto/eliminadas del diff (solo evalua lineas añadidas, prefijo "+")', () => {
    // Una credencial que aparece SOLO en una linea eliminada (prefijo "-")
    // significa que ya fue removida en ese mismo commit -- igual sigue
    // viva en el historial por el commit que la introdujo originalmente,
    // pero contarla en el commit que la borra duplicaria el hallazgo.
    const log = [
      'COMMIT:commit1',
      '-const token = "ghp_' + 'a'.repeat(36) + '";',
      '+const token = process.env.GH_TOKEN;',
    ].join('\n');

    const hallazgos = parsearLogParaSecretos(log);
    assert.equal(hallazgos.length, 0, 'no debe contar credenciales solo en lineas eliminadas del commit que las borra');
  });

  test('texto vacio o sin commits retorna array vacio', () => {
    assert.deepEqual(parsearLogParaSecretos(''), []);
    assert.deepEqual(parsearLogParaSecretos('diff sin marcador de commit'), []);
  });

  test('no reporta duplicados si la misma credencial aparece en varias lineas del mismo commit', () => {
    const key = 'AIza' + 'x'.repeat(35);
    const log = [
      'COMMIT:commit1',
      `+const a = "${key}";`,
      `+const b = "${key}";`,
    ].join('\n');

    const hallazgos = parsearLogParaSecretos(log);
    assert.equal(hallazgos.length, 1, 'no debe duplicar el mismo hallazgo (etiqueta+commit) mas de una vez');
  });
});
