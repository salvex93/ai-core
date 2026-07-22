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
  { re: /child_process[^;]*exec(Sync)?\s*\([^)]*shell\s*:\s*true/i, etiqueta: 'exec/execSync con shell:true — inyeccion de comandos' },
];

const RIESGO_EJECUCION_PY = [
  { re: /exec\s*\(/,                                       etiqueta: 'exec() — ejecucion arbitraria de codigo' },
  { re: /subprocess\.(call|run|Popen)\([^)]*shell\s*=\s*True/, etiqueta: 'subprocess con shell=True — inyeccion de comandos' },
  { re: /pickle\.loads?\s*\(/,                              etiqueta: 'pickle.load — deserializacion insegura, ejecucion arbitraria' },
];

module.exports = { RIESGO_EJECUCION_JS, RIESGO_EJECUCION_PY };
