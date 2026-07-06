#!/usr/bin/env node
/**
 * Ponytail — escalera de decision YAGNI pre-escritura
 * Adoptado de ponytail.dev. Se ejecuta en PreToolUse Write|Edit.
 * Emite advertencias al contexto; nunca bloquea (|| true en el hook).
 *
 * Evalua el archivo destino y el input de la herramienta para detectar
 * patrones de sobreingenieria antes de que el codigo sea escrito.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// --- Contexto disponible via variables de entorno de Claude Code hooks ---
const filePath    = process.env.CLAUDE_TOOL_INPUT_file_path    || '';
const newContent  = process.env.CLAUDE_TOOL_INPUT_content      || '';  // Write
const oldString   = process.env.CLAUDE_TOOL_INPUT_old_string   || '';  // Edit
const newString   = process.env.CLAUDE_TOOL_INPUT_new_string   || '';  // Edit

const targetContent = newContent || newString;

if (!targetContent) process.exit(0);

// --- Safety floor: no evaluar archivos de tests, config o infra ---
const EXEMPT_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.config\.[jt]sx?$/,
  /CLAUDE\.md$/,
  /settings\.json$/,
  /package\.json$/,
  /tokens\.json$/,
];
if (EXEMPT_PATTERNS.some(p => p.test(filePath))) process.exit(0);

const warnings = [];

// --- Escalera 1: YAGNI — detectar features "para el futuro" ---
const YAGNI_PATTERNS = [
  { re: /\/\/\s*(TODO|FUTURE|later|eventually|someday|might need|could use|for future|extensible)/gi,
    msg: 'YAGNI: comentario de feature futura detectado. Eliminar hasta que sea necesario.' },
  { re: /\/\*[\s\S]*?(future|extensible|pluggable|for later)[\s\S]*?\*\//gi,
    msg: 'YAGNI: bloque de comentario con alcance futuro. Implementar solo lo demandado ahora.' },
];

// --- Escalera 2: reutilizacion — detectar reimplementaciones de stdlib/utils ---
const REINVENTION_PATTERNS = [
  { re: /function\s+\w*(clamp|clampValue|clampNum)\s*\(/gi,
    msg: 'Stdlib: clamp() puede implementarse como Math.min(Math.max(v,min),max) en una linea.' },
  { re: /function\s+\w*(sleep|delay|wait)\s*\(\s*ms\s*\)/gi,
    msg: 'Stdlib: sleep() es new Promise(r => setTimeout(r, ms)) — no necesita funcion nombrada.' },
  { re: /function\s+\w*(capitalize|capitalizeFirst)\s*\(/gi,
    msg: 'Stdlib: capitalize es s[0].toUpperCase()+s.slice(1) — una linea, no funcion.' },
  { re: /function\s+\w*(isEmpty|isEmptyArray|isEmptyObj)\s*\(/gi,
    msg: 'Stdlib: isEmpty — usar .length === 0 o Object.keys(o).length === 0 directamente.' },
  { re: /function\s+\w*(deepClone|deepCopy)\s*\(/gi,
    msg: 'Stdlib: deepClone — usar structuredClone() nativo (Node 17+, navegadores modernos).' },
  { re: /function\s+\w*(flattenArray|flatten)\s*\(/gi,
    msg: 'Stdlib: flatten — usar Array.prototype.flat() nativo.' },
  { re: /function\s+\w*(unique|dedupe|dedup)\s*\(/gi,
    msg: 'Stdlib: unique — usar [...new Set(arr)] en una linea.' },
  { re: /function\s+\w*(uuid|generateUuid|createUuid)\s*\(/gi,
    msg: 'Stdlib: UUID — usar crypto.randomUUID() nativo (Node 15+).' },
  { re: /function\s+\w*(shuffle|shuffleArray)\s*\(/gi,
    msg: 'Stdlib: shuffle — considerar si realmente es necesario antes de implementar.' },
];

// --- Escalera 3: complejidad innecesaria ---
const COMPLEXITY_PATTERNS = [
  { re: /class\s+\w+\s*\{[\s\S]{0,200}^\s{2,}constructor/gm,
    msg: 'Complejidad: clase con constructor detectada. ¿Es necesaria la clase o basta una funcion?' },
  { re: /new\s+EventEmitter\s*\(\)/g,
    msg: 'Complejidad: EventEmitter — ¿es necesario o puede usarse un callback simple?' },
  { re: /abstract\s+class/g,
    msg: 'Complejidad: clase abstracta. Verificar que el caso de uso justifica la abstraccion.' },
];

// --- Escalera 4: lineas excesivas en un solo bloque ---
const lines = targetContent.split('\n').length;
if (lines > 200) {
  warnings.push(`Volumen: el bloque a escribir tiene ${lines} lineas. ¿Puede dividirse en modulos de <= 200?`);
}

// --- Escalera 5: funciones con demasiados parametros ---
const PARAM_PATTERN = /function\s+\w+\s*\(([^)]+)\)/g;
let match;
while ((match = PARAM_PATTERN.exec(targetContent)) !== null) {
  const paramStr = match[1].trim();
  if (!paramStr) continue;
  const params = paramStr.split(',').filter(p => p.trim().length > 0).length;
  if (params > 3) {
    warnings.push(`Parametros: funcion con ${params} parametros detectada. Consolidar en objeto de configuracion.`);
    break;
  }
}

// --- Ejecutar todos los patrones ---
for (const { re, msg } of [...YAGNI_PATTERNS, ...REINVENTION_PATTERNS, ...COMPLEXITY_PATTERNS]) {
  re.lastIndex = 0;
  if (re.test(targetContent)) warnings.push(msg);
}

// --- Output ---
if (warnings.length > 0) {
  const label = filePath ? path.basename(filePath) : 'archivo';
  process.stdout.write(`[PONYTAIL] ${label} — ${warnings.length} advertencia(s):\n`);
  warnings.forEach((w, i) => process.stdout.write(`  ${i + 1}. ${w}\n`));
}

process.exit(0);
