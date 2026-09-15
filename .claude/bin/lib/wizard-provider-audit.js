'use strict';
/**
 * wizard-provider-audit.js
 * Auditoria + fix activo de uso de IAs: detecta si algun modulo de
 * scripts/**\/*.js instancia un SDK de proveedor (@anthropic-ai/sdk,
 * @google/genai) por fuera de ModelRegistry.js -- el punto unico que
 * respeta la jerarquia de costo Gemini -> Haiku -> Sonnet -> Opus y evita
 * gastar cuota de Claude cuando Gemini (u otro proveedor ya configurado)
 * basta para la tarea.
 *
 * Lista blanca (verificada 2026-09-15, ver .claude/bin/wizard-provider-audit
 * en CHANGELOG.md): cada entrada tiene una razon de diseno documentada en su
 * propio archivo, no es un bypass -- son los puntos de implementacion real
 * que ModelRegistry.js y el bridge MCP de Gemini envuelven.
 *   - scripts/anthropic-bridge.js               (bridge de fallback documentado)
 *   - scripts/services/GeminiApiClient.js        (cliente bajo nivel del bridge MCP, no pasa por chat())
 *   - scripts/services/model-adapters/AnthropicAdapter.js
 *   - scripts/services/model-adapters/GeminiAdapter.js
 *   - scripts/services/ModelRegistry.js
 *
 * Solo cuenta un require/import REAL del SDK (`require('@anthropic-ai/sdk')`,
 * `from '@google/genai'`) -- una mencion en comentario o string de prosa no
 * es un hallazgo.
 */

const fs   = require('node:fs');
const path = require('node:path');

const LISTA_BLANCA = new Set([
  'anthropic-bridge.js',
  'GeminiApiClient.js',
  'AnthropicAdapter.js',
  'GeminiAdapter.js',
  'ModelRegistry.js',
]);

const SDKS_VIGILADOS = [
  { paquete: '@anthropic-ai/sdk', patron: /require\(\s*['"]@anthropic-ai\/sdk['"]\s*\)|from\s+['"]@anthropic-ai\/sdk['"]/ },
  { paquete: '@google/genai', patron: /require\(\s*['"]@google\/genai['"]\s*\)|from\s+['"]@google\/genai['"]/ },
];

function listarArchivosJs(dir) {
  const resultado = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const rutaCompleta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules') continue;
      resultado.push(...listarArchivosJs(rutaCompleta));
    } else if (entrada.isFile() && entrada.name.endsWith('.js')) {
      resultado.push(rutaCompleta);
    }
  }
  return resultado;
}

/**
 * @param {string} scriptsDir - directorio a auditar (ej. scripts/)
 * @returns {{ conforme: boolean, hallazgos: Array<{archivo: string, razon: string}> }}
 */
function auditarUsoDeProviders(scriptsDir) {
  const hallazgos = [];

  for (const archivo of listarArchivosJs(scriptsDir)) {
    if (LISTA_BLANCA.has(path.basename(archivo))) continue;

    const contenido = fs.readFileSync(archivo, 'utf8');
    for (const { paquete, patron } of SDKS_VIGILADOS) {
      if (patron.test(contenido)) {
        hallazgos.push({
          archivo,
          razon: `require/import directo de ${paquete} fuera de ModelRegistry.js -- bypasea la jerarquia de costo`,
        });
      }
    }
  }

  return { conforme: hallazgos.length === 0, hallazgos };
}

module.exports = { auditarUsoDeProviders, LISTA_BLANCA };
