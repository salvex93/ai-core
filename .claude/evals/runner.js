#!/usr/bin/env node
'use strict';

/**
 * runner.js — Ejecuta un promptfooconfig.yaml de .claude/evals/ y expone un
 * resumen legible + exit code acorde al resultado.
 *
 * Usa promptfoo via `npx promptfoo` (sin fijarlo como dependencia instalada:
 * el research verificado de esta sesion confirma que es CLI puro, sin
 * servidor, y npx ya lo resuelve desde el cache de npm sin reinstalar en
 * corridas repetidas dentro del mismo entorno).
 *
 * El juez de las assertions llm-rubric se fija en el propio
 * promptfooconfig.yaml de cada skill (formato nativo "google:<modelo>", los
 * custom providers file:// de promptfoo NO son aceptados como grading
 * provider -- verificado contra promptfoo.dev/docs/configuration/expected-
 * outputs/model-graded/llm-rubric/ antes de escribir este runner). Usa
 * GEMINI_API_KEY (ya declarada en el proyecto), que promptfoo acepta como
 * alias de GOOGLE_API_KEY para el prefijo "google:".
 *
 * Uso: node .claude/evals/runner.js <ruta-a-promptfooconfig.yaml>
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

/**
 * Construye el comando y argumentos para invocar promptfoo eval con salida
 * JSON en la ruta indicada.
 *
 * @param {string} configPath - ruta al promptfooconfig.yaml a ejecutar
 * @param {string} outputPath - ruta donde promptfoo escribe el resultado JSON
 * @returns {{cmd: string, args: string[]}}
 */
function construirComando(configPath, outputPath) {
  return {
    cmd: 'npx',
    args: ['--yes', 'promptfoo@latest', 'eval', '-c', configPath, '-o', outputPath, '--no-progress-bar', '--env-path', '.env'],
  };
}

/**
 * Interpreta el JSON de resultado que promptfoo escribe con -o y produce un
 * resumen: total de casos, cuantos pasaron, y si el eval en conjunto aprueba.
 *
 * @param {object} resultadoJson - contenido parseado del archivo -o de promptfoo
 * @returns {{total: number, pasaron: number, fallaron: number, aprueba: boolean}}
 */
function resumirResultado(resultadoJson) {
  const stats = resultadoJson?.results?.stats;
  if (!stats) {
    return { total: 0, pasaron: 0, fallaron: 0, aprueba: false };
  }
  const total = (stats.successes || 0) + (stats.failures || 0);
  return {
    total,
    pasaron: stats.successes || 0,
    fallaron: stats.failures || 0,
    aprueba: total > 0 && stats.failures === 0,
  };
}

/**
 * Ejecuta un promptfooconfig.yaml y retorna el resumen + exit code
 * recomendado para el proceso llamador (0 si aprueba, 1 si no).
 *
 * @param {string} configPath
 * @param {string} outputPath - ruta temporal donde escribir el JSON de resultado
 * @param {(cmd: string, args: string[]) => import('node:child_process').SpawnSyncReturns<string>} [ejecutar] - inyectable para tests
 * @param {(p: string) => object} [leerJson] - inyectable para tests
 * @returns {{resumen: ReturnType<typeof resumirResultado>, exitCode: number, spawnResult: object}}
 */
function correrEval(configPath, outputPath, ejecutar = defaultEjecutar, leerJson = defaultLeerJson) {
  const { cmd, args } = construirComando(configPath, outputPath);
  const spawnResult = ejecutar(cmd, args);

  if (spawnResult.status !== 0 && spawnResult.status !== 100) {
    // promptfoo usa exit 100 cuando el eval corrio pero algunas assertions
    // fallaron (no es un crash del propio promptfoo) -- cualquier otro codigo
    // es un fallo real de ejecucion (config invalida, red caida, etc.).
    return {
      resumen: { total: 0, pasaron: 0, fallaron: 0, aprueba: false },
      exitCode: 1,
      spawnResult,
    };
  }

  const resultadoJson = leerJson(outputPath);
  const resumen = resumirResultado(resultadoJson);
  return { resumen, exitCode: resumen.aprueba ? 0 : 1, spawnResult };
}

function defaultEjecutar(cmd, args) {
  // shell: true -- en Windows, spawnSync('npx', ...) sin shell no resuelve
  // npx.cmd (ENOENT), confirmado en el spike de esta sesion. Los argumentos
  // vienen de rutas de archivo ya controladas (configPath/outputPath propios
  // del runner), no de input externo -- no hay superficie de inyeccion nueva.
  return spawnSync(cmd, args, { encoding: 'utf8', cwd: path.resolve(__dirname, '..', '..'), shell: true });
}

function defaultLeerJson(p) {
  return JSON.parse(require('node:fs').readFileSync(p, 'utf8'));
}

if (require.main === module) {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('Uso: node .claude/evals/runner.js <ruta-a-promptfooconfig.yaml>');
    process.exit(1);
  }
  const outputPath = path.join(require('node:os').tmpdir(), `promptfoo-result-${Date.now()}.json`);
  const { resumen, exitCode, spawnResult } = correrEval(configPath, outputPath);

  if (spawnResult.error) console.error('[skill-evals] error al invocar promptfoo:', spawnResult.error);
  if (spawnResult.stdout) console.log(spawnResult.stdout);
  if (spawnResult.stderr) console.error(spawnResult.stderr);
  console.log(`[skill-evals] ${resumen.pasaron}/${resumen.total} casos pasaron -- ${resumen.aprueba ? 'APRUEBA' : 'FALLA'}`);
  process.exit(exitCode);
}

module.exports = { construirComando, resumirResultado, correrEval };
