#!/usr/bin/env node
/**
 * git-history-secrets-scan.js
 * Escanea el HISTORIAL COMPLETO de git (no solo el working tree actual) en
 * busca de credenciales de alta confianza commiteadas alguna vez -- gap
 * real detectado por investigacion de mercado 2026-08-15: ni
 * secrets-guard.js (prompt del usuario) ni security-scanner.md paso 3
 * (git ls-files/grep del estado actual) detectan un secreto que se
 * commiteo y luego se borro del archivo -- sigue vivo en el historial hasta
 * que se reescribe (git filter-repo / BFG). Patron estandar de mercado
 * (gitleaks, trufflehog): escanear `git log -p`.
 *
 * No hace ninguna llamada de red ni modifica el repo. Reporta, no corrige
 * -- si encuentra un hallazgo real, la reescritura de historial (git
 * filter-repo) es una operacion destructiva que requiere confirmacion
 * humana explicita, nunca automatizada aqui.
 *
 * Uso:
 *   node .claude/bin/git-history-secrets-scan.js
 *   node .claude/bin/git-history-secrets-scan.js --json
 *   node .claude/bin/git-history-secrets-scan.js --max-commits 500
 */

'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const { parsearLogParaSecretos } = require('./lib/git-history-secrets-scan');

// AI_CORE_GIT_HISTORY_SCAN_REPO permite apuntar a un repo git temporal en
// tests, sin depender del repo real de ai-core.
const REPO = process.env.AI_CORE_GIT_HISTORY_SCAN_REPO || path.resolve(__dirname, '..', '..');
const JSON_OUT = process.argv.includes('--json');

function argValor(flag, defecto) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : defecto;
}

// Limite de commits por defecto: escanear TODO el historial de un repo
// grande puede ser lento: 2000 cubre holgadamente el historial de un
// proyecto de este tamaño sin bloquear el flujo de security-scanner.md.
const MAX_COMMITS = Number(argValor('--max-commits', '2000'));

function obtenerLogCompleto() {
  try {
    return execFileSync(
      'git',
      ['log', `-${MAX_COMMITS}`, '-p', '--format=COMMIT:%H'],
      { cwd: REPO, encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 }
    );
  } catch (err) {
    return '';
  }
}

const logText = obtenerLogCompleto();
const hallazgos = parsearLogParaSecretos(logText);

if (JSON_OUT) {
  console.log(JSON.stringify({ hallazgos, total: hallazgos.length }, null, 2));
  process.exit(hallazgos.length > 0 ? 1 : 0);
}

if (hallazgos.length === 0) {
  console.log('[GIT-HISTORY-SECRETS-SCAN] Sin hallazgos en el historial escaneado.');
  process.exit(0);
}

console.log(`[GIT-HISTORY-SECRETS-SCAN] ${hallazgos.length} hallazgo(s) en el historial de git:\n`);
for (const { commit, etiqueta } of hallazgos) {
  console.log(`  - commit ${commit.slice(0, 12)}: ${etiqueta}`);
}
console.log(
  '\nEstas credenciales siguen vivas en el historial aunque ya no esten en el archivo actual. ' +
  'Rotar la credencial real de inmediato; eliminarla del historial requiere reescritura ' +
  '(git filter-repo / BFG), una operacion destructiva que exige confirmacion humana explicita.'
);
process.exit(1);
