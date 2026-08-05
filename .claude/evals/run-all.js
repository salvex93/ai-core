#!/usr/bin/env node
'use strict';

/**
 * run-all.js -- Ejecuta todos los *.promptfooconfig.yaml de .claude/evals/
 * en secuencia (uno por skill) y produce un resumen consolidado.
 *
 * Secuencial y no paralelo: cada corrida ya paraleliza internamente sus
 * propios test cases (promptfoo concurrency), y correr 42 evals en paralelo
 * saturaria el rate limit del proveedor juez.
 *
 * Espera fija entre evals (calcularEsperaMs): el juez actual (Gemini,
 * google:gemini-3.6-flash) tiene un tier gratuito de 20 requests/min: cada
 * eval consume ~8 requests (4 casos x respuesta+rubric), asi que sin espera
 * el 3er eval de la corrida ya golpea 429 RESOURCE_EXHAUSTED y promptfoo
 * reintenta con backoff de 60s+ por intento -- confirmado en vivo el
 * 2026-08-05 corriendo qa-engineer.promptfooconfig.yaml aislado.
 *
 * Uso: node .claude/evals/run-all.js
 */

const path = require('node:path');
const fs   = require('node:fs');
const os   = require('node:os');
const { correrEval } = require('./runner');

const ESPERA_ENTRE_EVALS_MS = 30_000;

function calcularEsperaMs() {
  return ESPERA_ENTRE_EVALS_MS;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} dir - ruta al directorio .claude/evals/
 * @param {(d: string) => string[]} [leerDir] - inyectable para tests
 * @returns {string[]} nombres de archivo *.promptfooconfig.yaml, orden alfabetico
 */
function listarConfigs(dir, leerDir = (d) => fs.readdirSync(d)) {
  return leerDir(dir)
    .filter((f) => f.endsWith('.promptfooconfig.yaml'))
    .sort();
}

/**
 * @param {{skill: string, resumen: {total: number, pasaron: number, fallaron: number, aprueba: boolean}}[]} resultados
 * @returns {{totalSkills: number, aprobados: number, fallidos: number, skillsFallidos: string[]}}
 */
function resumirTotales(resultados) {
  const aprobados = resultados.filter((r) => r.resumen.aprueba);
  const fallidos = resultados.filter((r) => !r.resumen.aprueba);
  return {
    totalSkills: resultados.length,
    aprobados: aprobados.length,
    fallidos: fallidos.length,
    skillsFallidos: fallidos.map((r) => r.skill),
  };
}

async function main() {
  const evalsDir = __dirname;
  const configs = listarConfigs(evalsDir);
  const resultados = [];

  for (const [i, configFile] of configs.entries()) {
    const skill = configFile.replace(/\.promptfooconfig\.yaml$/, '');
    const configPath = path.join(evalsDir, configFile);
    const outputPath = path.join(os.tmpdir(), `promptfoo-result-${skill}-${Date.now()}.json`);

    if (i > 0) await esperar(calcularEsperaMs());

    process.stdout.write(`\n[eval-skills] === ${skill} ===\n`);
    const { resumen } = correrEval(configPath, outputPath);
    process.stdout.write(`[eval-skills] ${skill}: ${resumen.pasaron}/${resumen.total} -- ${resumen.aprueba ? 'APRUEBA' : 'FALLA'}\n`);
    resultados.push({ skill, resumen });
  }

  const totales = resumirTotales(resultados);
  process.stdout.write(`\n[eval-skills] RESUMEN FINAL: ${totales.aprobados}/${totales.totalSkills} skills aprueban\n`);
  if (totales.skillsFallidos.length > 0) {
    process.stdout.write(`[eval-skills] Fallan: ${totales.skillsFallidos.join(', ')}\n`);
  }
  process.exit(totales.fallidos === 0 ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { listarConfigs, resumirTotales, calcularEsperaMs };
