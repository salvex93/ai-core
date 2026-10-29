'use strict';
/**
 * quality-gate-atestacion.js — check del gate sobre la cadena de informes
 * firmados (.claude/bin/session-attest.js). La cadena es local a cada maquina y
 * esta ignorada por git: sin cadena no hay nada que verificar y el check pasa.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verificarCadena } = require('../.claude/bin/lib/session-attestation.js');
const { leerJsonl } = require('../.claude/bin/lib/session-attestation-store.js');

const REPO = path.resolve(__dirname, '..');
const CADENA = path.join(REPO, '.claude', 'ATTESTATIONS.jsonl');
const PUBLICA = path.join(process.env.AI_CORE_ATTEST_DIR || path.join(os.homedir(), '.config', 'ai-core'), 'attest.pub');

function revisarCadenaAtestacion({ cadena = CADENA, publica = PUBLICA } = {}) {
  if (!fs.existsSync(cadena)) return { ok: true, detalle: '' };
  if (!fs.existsSync(publica)) return { ok: false, detalle: `  hay cadena pero falta la clave publica: ${publica}` };
  const r = verificarCadena(leerJsonl(cadena), fs.readFileSync(publica, 'utf8'));
  return { ok: r.ok, detalle: r.ok ? '' : `  sobre ${r.indiceRoto}: ${r.motivo}` };
}

module.exports = { revisarCadenaAtestacion };
