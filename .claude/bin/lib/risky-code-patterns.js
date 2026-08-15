'use strict';

/**
 * risky-code-patterns.js — Patrones de ejecucion de codigo de alto riesgo,
 * compartidos entre security-check.js (deteccion post-hoc, PostToolUse) y
 * code-exec-guard.js (bloqueo preventivo, PreToolUse).
 *
 * Subconjunto BLOQUEANTE: solo patrones donde el riesgo de ejecucion
 * arbitraria es inequivoco (eval, exec de shell, deserializacion insegura).
 * No incluye patrones de menor severidad (innerHTML, dangerouslySetInnerHTML)
 * que security-check.js sigue reportando solo como advertencia.
 */

const RIESGO_EJECUCION_JS = [
  { re: /[^/'"]\beval\s*\(/,           etiqueta: 'eval() — ejecucion arbitraria de codigo' },
  { re: /new\s+Function\s*\(/,        etiqueta: 'new Function() — ejecucion arbitraria equivalente a eval' },
  // Version anterior exigia "child_process" y la llamada exec(Sync)? SIN
  // punto y coma de por medio -- codigo idiomatico real que asigna
  // require('child_process') a una variable y la invoca en una statement
  // separada evadia el patron sin ninguna ofuscacion deliberada (hallazgo
  // red-team 2026-08-15). [\s\S]*? (cualquier caracter, incluye saltos de
  // linea y ";") ya no exige que ambas partes esten en la misma statement.
  { re: /child_process[\s\S]*?exec(Sync)?\s*\([^)]*shell\s*:\s*true/i, etiqueta: 'exec/execSync con shell:true — inyeccion de comandos' },
];

const RIESGO_EJECUCION_PY = [
  { re: /exec\s*\(/,                                       etiqueta: 'exec() — ejecucion arbitraria de codigo' },
  { re: /subprocess\.(call|run|Popen)\([^)]*shell\s*=\s*True/, etiqueta: 'subprocess con shell=True — inyeccion de comandos' },
  { re: /pickle\.loads?\s*\(/,                              etiqueta: 'pickle.load — deserializacion insegura, ejecucion arbitraria' },
];

module.exports = { RIESGO_EJECUCION_JS, RIESGO_EJECUCION_PY };
