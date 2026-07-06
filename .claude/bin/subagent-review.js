#!/usr/bin/env node
/**
 * subagent-review.js — Validacion adversarial de output de subagentes (SubagentStop hook)
 * Adaptado de adverse (Addy Osmani): 3 perspectivas en paralelo antes de integrar al padre.
 *
 * Se ejecuta en el hook SubagentStop. Lee el output del subagente desde env vars
 * y emite veredicto al stdout para que el agente padre lo evalúe.
 *
 * Perspectivas:
 *   Auditor    — correctitud, seguridad, cumplimiento de CLAUDE.md
 *   Adversario — casos borde, supuestos fragiles, puntos de fallo
 *   Pragmatico — implementabilidad real, deuda tecnica, complejidad innecesaria
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');

// Output del subagente disponible via env o stdin
const subagentOutput = process.env.CLAUDE_SUBAGENT_OUTPUT || '';
const subagentName   = process.env.CLAUDE_SUBAGENT_TYPE   || 'unknown';

// Umbral: solo activar revision si el output es significativo
const OUTPUT_THRESHOLD_LINES = 30;
const outputLines = subagentOutput.split('\n').length;

if (!subagentOutput || outputLines < OUTPUT_THRESHOLD_LINES) {
  // Output trivial — pasar sin revision
  process.exit(0);
}

// ─── Patrones de analisis por perspectiva ─────────────────────────────────────

const AUDITOR_CHECKS = [
  { pattern: /catch\s*\(\s*\)\s*\{?\s*\}|catch\s*{\s*}/g,
    severity: 'CRITICO', msg: 'catch vacio detectado — fallo silencioso' },
  { pattern: /console\.log\s*\([^)]*password|token|secret|key/gi,
    severity: 'CRITICO', msg: 'posible log de credencial' },
  { pattern: /eval\s*\(/g,
    severity: 'ALTO', msg: 'uso de eval() — riesgo de inyeccion' },
  { pattern: /innerHTML\s*=/g,
    severity: 'ALTO', msg: 'innerHTML sin sanitizar' },
  { pattern: /TODO|FIXME|HACK/g,
    severity: 'MEDIO', msg: 'codigo incompleto o workaround documentado' },
  { pattern: /any\b/g,
    severity: 'BAJO', msg: 'tipo "any" — perdida de seguridad de tipos' },
];

const ADVERSARIO_CHECKS = [
  { pattern: /if\s*\([^)]*\)\s*\{[\s\S]{0,200}\}\s*(?!else)/gm,
    severity: 'MEDIO', msg: 'rama sin else — caso no controlado posible' },
  { pattern: /\[\s*0\s*\](?!\s*[?.])/g,
    severity: 'MEDIO', msg: 'acceso a indice 0 sin validacion de longitud' },
  { pattern: /JSON\.parse\s*\([^)]+\)(?!\s*;?\s*\/\/\s*try)/g,
    severity: 'ALTO', msg: 'JSON.parse sin try/catch — falla si el input es invalido' },
  { pattern: /require\s*\(\s*[`'"][^'"`.]+[`'"]\s*\)/g,
    severity: 'BAJO', msg: 'require dinamico — verificar que la ruta siempre existe' },
];

const PRAGMATICO_CHECKS = [
  { pattern: /class\s+\w+\s*extends\s+\w+/g,
    severity: 'BAJO', msg: 'herencia — verificar que la composicion no es mas simple' },
  { pattern: /new\s+Promise\s*\(\s*\(\s*resolve\s*,\s*reject\s*\)/g,
    severity: 'BAJO', msg: 'Promise constructor manual — considerar async/await directo' },
  { pattern: /(\w+)\s*=\s*\1\s*\|\|\s*/g,
    severity: 'BAJO', msg: 'patron de default con || — considerar ?? para evitar falsy bugs' },
];

// ─── Evaluacion ───────────────────────────────────────────────────────────────

function evaluar(checks, label) {
  const hallazgos = [];
  for (const { pattern, severity, msg } of checks) {
    pattern.lastIndex = 0;
    if (pattern.test(subagentOutput)) {
      hallazgos.push({ severity, msg });
    }
  }
  return { label, hallazgos };
}

const resultados = [
  evaluar(AUDITOR_CHECKS,    'Auditor'),
  evaluar(ADVERSARIO_CHECKS, 'Adversario'),
  evaluar(PRAGMATICO_CHECKS, 'Pragmatico'),
];

const todos = resultados.flatMap(r => r.hallazgos);
const criticos = todos.filter(h => h.severity === 'CRITICO').length;
const altos    = todos.filter(h => h.severity === 'ALTO').length;

// ─── Output al padre ──────────────────────────────────────────────────────────

if (todos.length === 0) {
  console.log(`[adverse] subagente:${subagentName} — sin hallazgos (${outputLines} lineas revisadas)`);
  process.exit(0);
}

console.log(`[adverse] subagente:${subagentName} — ${todos.length} hallazgo(s): ${criticos} criticos, ${altos} altos`);

for (const { label, hallazgos } of resultados) {
  if (hallazgos.length === 0) continue;
  for (const h of hallazgos) {
    console.log(`  [${h.severity}][${label}] ${h.msg}`);
  }
}

// Salida no-zero si hay criticos — el padre puede decidir si bloquear
if (criticos > 0) {
  console.log('[adverse] CRITICO detectado — revisar antes de integrar output al contexto');
  process.exit(1);
}

process.exit(0);
