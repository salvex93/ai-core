#!/usr/bin/env node
/**
 * wizard.js — npm run wizard
 *
 * Configuracion interactiva de un solo comando: API keys de proveedores de
 * IA, credenciales externas (GitHub token, alias SSH), verificacion de
 * integridad del harness (codigo legacy, conformidad de skills, vigencia
 * de mercado, instalacion como submodulo, version vs CHANGELOG) y
 * auditoria + fix de uso de providers fuera de ModelRegistry.js.
 *
 * Cada seccion delega su logica pura a .claude/bin/lib/wizard-*.js -- este
 * script solo orquesta prompts de readline y lectura/escritura de .env.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { execFileSync, spawnSync } = require('node:child_process');

const { validarGitHubToken, validarProveedorIA, validarSshHostAlias } = require('./lib/wizard-credentials');
const { auditarUsoDeProviders } = require('./lib/wizard-provider-audit');
const { verificarIntegridad } = require('./lib/wizard-integrity');
const { esSubmoduloDeHost } = require('./lib/submodule-detect');

const REPO = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(REPO, '.env');
const CHANGELOG_PATH = path.join(REPO, 'CHANGELOG.md');
const PKG_PATH = path.join(REPO, 'package.json');

const PROVIDERS = [
  { key: 'GEMINI_API_KEY', provider: 'gemini' },
  { key: 'ANTHROPIC_API_KEY', provider: 'anthropic' },
  { key: 'OPENAI_API_KEY', provider: 'openai' },
  { key: 'DEEPSEEK_API_KEY', provider: 'deepseek' },
  { key: 'KIMI_API_KEY', provider: 'kimi' },
];

function leerEnv(envPath = ENV_PATH) {
  if (!fs.existsSync(envPath)) return {};
  const vars = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) vars[m[1].trim()] = m[2].trim();
  }
  return vars;
}

function escribirEnvVar(clave, valor, envPath = ENV_PATH) {
  const actual = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const patron = new RegExp(`^${clave}=.*$`, 'm');
  const linea = `${clave}=${valor}`;
  const nuevo = patron.test(actual) ? actual.replace(patron, linea) : `${actual}\n${linea}\n`;
  fs.writeFileSync(envPath, nuevo);
}

async function preguntar(rl, texto) {
  try {
    const r = await rl.question(texto);
    return r.trim();
  } catch {
    return '';
  }
}

async function seccionProveedoresIA(rl) {
  console.log('\n=== API keys de proveedores de IA ===');
  const env = leerEnv();

  for (const { key, provider } of PROVIDERS) {
    const actual = env[key] || process.env[key] || '';
    if (actual) {
      const r = await validarProveedorIA(provider, actual, (p, m, o) => require('../../scripts/services/ModelRegistry').chat(p, m, o));
      console.log(`[${provider}] ${r.valido ? 'OK' : 'INVALIDO'} -- ${r.razon}`);
      continue;
    }
    const valor = await preguntar(rl, `${key} (enter para omitir): `);
    if (!valor) continue;
    escribirEnvVar(key, valor);
    const r = await validarProveedorIA(provider, valor, (p, m, o) => require('../../scripts/services/ModelRegistry').chat(p, m, o));
    console.log(`[${provider}] ${r.valido ? 'OK guardado' : 'GUARDADO PERO INVALIDO'} -- ${r.razon}`);
  }
}

async function seccionGitHub(rl) {
  console.log('\n=== Token de GitHub ===');
  const env = leerEnv();
  const actual = env.GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
  const token = actual || await preguntar(rl, 'GITHUB_TOKEN (enter para omitir): ');
  if (!token) return;
  if (!actual) escribirEnvVar('GITHUB_TOKEN', token);
  const r = await validarGitHubToken(token);
  console.log(`[github] ${r.valido ? 'OK' : 'INVALIDO'} -- ${r.razon}`);
}

async function seccionSsh(rl) {
  console.log('\n=== Alias de host SSH (nunca se pide la clave privada) ===');
  const env = leerEnv();
  const actual = env.SSH_HOST_ALIAS || process.env.SSH_HOST_ALIAS || '';
  const alias = actual || await preguntar(rl, 'SSH_HOST_ALIAS ya definido en ~/.ssh/config (enter para omitir): ');
  if (!alias) return;
  if (!actual) escribirEnvVar('SSH_HOST_ALIAS', alias);

  const deps = {
    leerSshConfig: () => {
      const cfg = path.join(require('node:os').homedir(), '.ssh', 'config');
      return fs.existsSync(cfg) ? fs.readFileSync(cfg, 'utf8') : '';
    },
    listarIdentidadesAgent: () => execFileSync('ssh-add', ['-L'], { encoding: 'utf8' }),
  };
  const r = validarSshHostAlias(alias, deps);
  console.log(`[ssh] ${r.valido ? 'OK' : 'INVALIDO'} -- ${r.razon}`);
}

function correrScript(rutaRelativa, args = []) {
  const res = spawnSync('node', [path.join(REPO, rutaRelativa), ...args], {
    cwd: REPO,
    encoding: 'utf8',
  });
  return { ok: res.status === 0, salida: `${res.stdout || ''}${res.stderr || ''}` };
}

function leerUltimaVersionChangelog(changelogPath = CHANGELOG_PATH) {
  if (!fs.existsSync(changelogPath)) return null;
  const m = fs.readFileSync(changelogPath, 'utf8').match(/^## \[(\d+\.\d+\.\d+)\]/m);
  return m ? m[1] : null;
}

function leerVersionPkg(pkgPath = PKG_PATH) {
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
}

function seccionIntegridad() {
  console.log('\n=== Integridad del harness ===');
  const resultado = verificarIntegridad({
    runDetox: () => correrScript(path.join('.claude', 'bin', 'detox.js')),
    runValidateGlobals: () => correrScript(path.join('.claude', 'bin', 'validate-globals.js')),
    runAuditMarketStale: () => correrScript(path.join('.claude', 'bin', 'audit-market.js'), ['--only-stale']),
    esSubmoduloDeHostImpl: (hostDir) => esSubmoduloDeHost(hostDir || path.resolve(REPO, '..')),
    leerVersionPkg,
    leerUltimaVersionChangelog,
    hostDir: null,
  });

  console.log(`Instalado como submodulo: ${resultado.submodulo.esSubmodulo ? 'si' : 'no'} (${resultado.submodulo.razon})`);
  if (resultado.hallazgos.length === 0) {
    console.log('Sin hallazgos.');
  }
  for (const h of resultado.hallazgos) {
    console.log(`[${h.bloqueante ? 'BLOQUEANTE' : 'info'}] ${h.detalle}`);
  }
  console.log(`Conforme: ${resultado.conforme ? 'si' : 'NO'}`);
  return resultado;
}

function seccionAuditoriaProviders() {
  console.log('\n=== Auditoria de uso de providers (bypass de ModelRegistry) ===');
  const r = auditarUsoDeProviders(path.join(REPO, 'scripts'));
  if (r.conforme) {
    console.log('Sin bypass detectado.');
  } else {
    for (const h of r.hallazgos) console.log(`[BLOQUEANTE] ${h.archivo}: ${h.razon}`);
  }
  return r;
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('AI-CORE Wizard — configuracion y validacion de integridad\n');
    await seccionProveedoresIA(rl);
    await seccionGitHub(rl);
    await seccionSsh(rl);
    const integridad = seccionIntegridad();
    const providers = seccionAuditoriaProviders();

    console.log('\n=== Resumen ===');
    const conforme = integridad.conforme && providers.conforme;
    console.log(conforme ? 'Wizard completo: todo conforme.' : 'Wizard completo: hay hallazgos bloqueantes arriba.');
    process.exitCode = conforme ? 0 : 1;
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { leerEnv, escribirEnvVar, leerUltimaVersionChangelog, leerVersionPkg };
