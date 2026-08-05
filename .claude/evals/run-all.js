#!/usr/bin/env node
'use strict';

/**
 * run-all.js -- Ejecuta todos los *.promptfooconfig.yaml de .claude/evals/
 * en secuencia (uno por skill) y produce un resumen consolidado.
 *
 * Secuencial y no paralelo: cada corrida ya paraleliza internamente sus
 * propios test cases (promptfoo concurrency), y correr 42 evals en paralelo
 * saturaria el rate limit del proveedor juez (openai:chat:gpt-5.6-luna).
 *
 * Uso: node .claude/evals/run-all.js
 */

const path = require('node:path');
const fs   = require('node:fs');
const os   = require('node:os');
const { correrEval } = require('./runner');

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

if (require.main === module) {
  const evalsDir = __dirname;
  const configs = listarConfigs(evalsDir);
  const resultados = [];

  for (const configFile of configs) {
    const skill = configFile.replace(/\.promptfooconfig\.yaml$/, '');
    const configPath = path.join(evalsDir, configFile);
    const outputPath = path.join(os.tmpdir(), `promptfoo-result-${skill}-${Date.now()}.json`);

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

module.exports = { listarConfigs, resumirTotales };
