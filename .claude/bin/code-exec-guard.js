#!/usr/bin/env node
'use strict';
/**
 * code-exec-guard.js — Gate preventivo sobre codigo de ejecucion arbitraria
 * (ASI05 — OWASP Top 10 for Agentic Applications 2026: Unexpected Code
 * Execution). Bloquea (exit 2) ANTES de escribir si el contenido a escribir
 * contiene eval(), new Function(), exec/subprocess con shell habilitado, o
 * pickle.load -- en vez de solo reportarlo despues de escrito, como hace
 * security-check.js (PostToolUse, deteccion post-hoc sin bloqueo).
 *
 * Patrones compartidos con security-check.js via lib/risky-code-patterns.js
 * (subconjunto BLOQUEANTE: solo lo que implica ejecucion arbitraria real).
 *
 * Deliberadamente acotado a Write|Edit sobre archivos .js/.ts/.py -- no
 * evalua Bash (ya cubierto por bash-verbosity-guard.js con otro criterio) ni
 * introduce sandboxing real de ejecucion (vm2/isolated-vm), que es un cambio
 * de arquitectura, no un guard quirurgico.
 *
 * Ejecutado via hook PreToolUse(Write|Edit) en settings.json.
 * Uso: node code-exec-guard.js (recibe el evento PreToolUse por stdin)
 */

const path = require('node:path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');
const { RIESGO_EJECUCION_JS, RIESGO_EJECUCION_PY } = require('./lib/risky-code-patterns');

const evento    = leerEventoDeStdin();
const toolInput = evento.tool_input || {};

const filePath = toolInput.file_path || '';
const content  = toolInput.content || toolInput.new_string || '';

if (!filePath || !content) process.exit(0);

// Archivos de test necesitan poder contener estos patrones como DATOS de
// prueba (fixtures, assertions sobre el patron mismo) sin disparar el guard
// -- mismo criterio de exencion que ponytail-check.js.
const EXEMPT_PATTERNS = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/];
if (EXEMPT_PATTERNS.some(p => p.test(filePath))) process.exit(0);

const ext = path.extname(filePath).toLowerCase();
const EXTS_JS = ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs'];
const EXTS_PY = ['.py'];

let patrones = [];
if (EXTS_JS.includes(ext)) patrones = RIESGO_EJECUCION_JS;
else if (EXTS_PY.includes(ext)) patrones = RIESGO_EJECUCION_PY;
else process.exit(0);

const hallazgos = patrones.filter(({ re }) => re.test(content));

if (hallazgos.length === 0) process.exit(0);

process.stderr.write(
  `[CODE-EXEC-GUARD] BLOQUEADO: ${path.basename(filePath)} contiene ${hallazgos.length} patron(es) de ejecucion arbitraria:\n`
);
hallazgos.forEach(({ etiqueta }) => process.stderr.write(`  - ${etiqueta}\n`));
process.stderr.write(
  'Si es intencional (ej. sandbox de pruebas), documenta el motivo explicito en el propio codigo y confirma con el usuario antes de reintentar.\n'
);
process.exit(2);
