#!/usr/bin/env node
'use strict';
/**
 * health-worker.js — Worker background para verificaciones lentas (HTTP).
 * Corre como proceso detached spawneado por health-check.js.
 * Escribe la seccion asincrona del reporte y actualiza el models-cache.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

const ROOT        = path.resolve(__dirname, '../..');
const REPORT_PATH = path.join(ROOT, '.claude', 'HEALTH_REPORT.md');
const CACHE_PATH  = path.join(ROOT, '.claude', 'models-cache.json');
const CACHE_TTL   = 24 * 60 * 60 * 1000; // 24 horas en ms

const { buildAsyncSection } = require('./health-report');

// -------------------------------------------------------------------
// Carga de .env (mismo patrón que mcp-gemini.js)
// -------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// -------------------------------------------------------------------
// VERSION DRIFT — HTTP GET a registry.npmjs.org
// -------------------------------------------------------------------

/**
 * @param {string} dep — nombre del paquete npm
 * @returns {Promise<{ dep: string, installed: string, latest: string|null, drift: boolean, error?: string }>}
 */
function fetchLatestVersion(dep) {
  return new Promise(resolve => {
    const url = `https://registry.npmjs.org/${dep}/latest`;
    const req = https.get(url, { timeout: 5000 }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data    = JSON.parse(body);
          const latest  = data.version ?? null;
          const pkgPath = path.join(ROOT, 'node_modules', dep, 'package.json');
          const installed = fs.existsSync(pkgPath)
            ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
            : 'no instalado';
          const drift = latest !== null && installed !== latest;
          resolve({ dep, installed, latest, drift });
        } catch (e) {
          resolve({ dep, installed: '?', latest: null, drift: false, error: `parse: ${e.message}` });
        }
      });
    });
    req.on('error', e => resolve({ dep, installed: '?', latest: null, drift: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ dep, installed: '?', latest: null, drift: false, error: 'timeout' }); });
  });
}

/**
 * @param {string} root
 * @returns {Promise<Array>}
 */
async function checkVersionDrift(root) {
  const pkg  = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});
  return Promise.all(deps.map(fetchLatestVersion));
}

// -------------------------------------------------------------------
// MODELOS ANTHROPIC
// -------------------------------------------------------------------

/**
 * @returns {string[]} — modelos declarados en ModelRouter.js
 */
function getLocalModels() {
  try {
    const { MODELOS } = require('../../scripts/services/ModelRouter');
    return Object.values(MODELOS);
  } catch {
    return [];
  }
}

/**
 * Lee caché de modelos si existe y no está vencida.
 * @returns {{ data: object, stale: boolean }|null}
 */
function readModelsCache() {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    const age   = Date.now() - new Date(cache.timestamp).getTime();
    return { data: cache, stale: age > CACHE_TTL };
  } catch { return null; }
}

/**
 * @param {string} root
 * @returns {Promise<{ skipped?: boolean, reason?: string, error?: string, nuevos?: string[], retirados?: string[] }>}
 */
async function checkAnthropicModels(root) {
  loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey.length < 10) {
    return { skipped: true, reason: 'ANTHROPIC_API_KEY no configurada en .env' };
  }

  // Intentar con caché reciente primero
  const cached = readModelsCache();
  if (cached && !cached.stale) {
    return cached.data.result;
  }

  try {
    const { default: Anthropic } = require('@anthropic-ai/sdk');
    const client     = new Anthropic({ apiKey });
    const page       = await client.models.list();
    const apiModels  = page.data.map(m => m.id);
    const localModels = getLocalModels();

    // MODELOS.GEMINI no aparece en la API de Anthropic (proveedor distinto) —
    // excluirlo por referencia, no por string hardcodeado (el nombre exacto
    // del modelo Gemini cambia con el tiempo; ya cambio una vez de
    // gemini-2.5-flash a gemini-3.5-flash sin que este filtro se actualizara).
    const { MODELOS: MODELOS_LOCALES } = require('../../scripts/services/ModelRouter');
    const nuevos    = apiModels.filter(m => !localModels.includes(m));
    const retirados = localModels
      .filter(m => m !== MODELOS_LOCALES.GEMINI)
      .filter(m => !apiModels.includes(m));

    const result = { nuevos, retirados };

    // Guardar caché
    fs.writeFileSync(CACHE_PATH, JSON.stringify({
      timestamp: new Date().toISOString(),
      result,
      apiModels,
      localModels,
    }, null, 2));

    return result;
  } catch (e) {
    // Si hay caché aunque sea vencida, usarla como fallback
    if (cached) {
      return { ...cached.data.result, stale: true, staleReason: e.message };
    }
    return { error: e.message.split('\n')[0] };
  }
}

// -------------------------------------------------------------------
// APPEND AL REPORTE
// -------------------------------------------------------------------

function appendAsyncSection(reportPath, versionResults, modelsResult) {
  if (!fs.existsSync(reportPath)) return;

  const section = buildAsyncSection(versionResults, modelsResult);

  // Eliminar el placeholder de "verificaciones en curso" si existe
  let content = fs.readFileSync(reportPath, 'utf8');
  content = content.replace(
    '\n---\n_Verificaciones asincronas en curso en background..._\n',
    ''
  );

  fs.writeFileSync(reportPath, content + section);
}

// -------------------------------------------------------------------
// MAIN
// -------------------------------------------------------------------

async function main() {
  try {
    const [versionResults, modelsResult] = await Promise.all([
      checkVersionDrift(ROOT),
      checkAnthropicModels(ROOT),
    ]);
    appendAsyncSection(REPORT_PATH, versionResults, modelsResult);
  } catch (err) {
    // Worker silencioso — nunca crashear el proceso principal, pero dejar
    // rastro diagnosticable de que la seccion asincrona no se escribio.
    process.stderr.write(`[HEALTH-WORKER] fallo no bloqueante: ${err.message}\n`);
  }
}

main();
