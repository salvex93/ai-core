#!/usr/bin/env node
'use strict';
/**
 * detect-role.js — Clasifica el rol del prompt entrante y lo persiste
 * en .claude/.current_role para que el hook Stop namespace la escritura
 * de memory-vault por el rol activo de la sesion.
 *
 * Ejecutado via hook UserPromptSubmit (categoria "intent" de process-guard.js).
 * Reemplaza el `node -e "..."` inline que antes solo emitia telemetria —
 * ahora ademas escribe el estado efimero que consume memory-index.js en Stop.
 */

const fs   = require('node:fs');
const path = require('node:path');

const { clasificarConModelo } = require(path.join(__dirname, '..', '..', 'scripts', 'services', 'IntentClassifier.js'));
const { leerEventoDeStdin }   = require('./lib/hook-stdin');

const ROLE_FILE = path.join(__dirname, '..', '.current_role');

// CLAUDE_USER_PROMPT nunca existio como variable de entorno real -- el prompt
// llega por JSON en stdin (prompt_text), confirmado contra
// code.claude.com/docs/en/hooks. Invocado via process-guard.js, que hereda
// stdio (incluido stdin) del proceso padre sin modificarlo.
const r = clasificarConModelo(process.env.CLAUDE_USER_PROMPT || leerEventoDeStdin().prompt_text || '');

try {
  fs.writeFileSync(ROLE_FILE, r.rol, 'utf8');
} catch { /* estado efimero — si falla la escritura, Stop cae a su fallback */ }

if (r.rol && r.rol !== 'Architect') {
  process.stdout.write(`[ROL DETECTADO: ${r.rol} | CONFIANZA: ${r.confianza} | ${r.razonIntent}]\n`);
}
