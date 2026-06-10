'use strict';

/**
 * security-check.js — Revisa archivos recién escritos en busca de patrones críticos.
 * Inspirado en ECC code-review-on-write hook. Solo imprime si hay hallazgos.
 * Uso: node security-check.js <ruta_archivo>
 */

const fs   = require('fs');
const path = require('path');

const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) process.exit(0);

const ext = path.extname(filePath).toLowerCase();
const EXTS_JS  = ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs'];
const EXTS_PY  = ['.py'];
const EXTS_ALL = [...EXTS_JS, ...EXTS_PY];

if (!EXTS_ALL.includes(ext)) process.exit(0);

const contenido = fs.readFileSync(filePath, 'utf8');
const lineas    = contenido.split('\n');
const hallazgos = [];

// ── Patrones de secretos hardcodeados ──────────────────────────────────────
const SECRETOS = [
  { re: /(['"`])sk-[A-Za-z0-9]{20,}\1/,            etiqueta: 'OpenAI API key hardcodeada' },
  { re: /(['"`])ghp_[A-Za-z0-9]{36}\1/,            etiqueta: 'GitHub PAT hardcodeado' },
  { re: /(['"`])AKIA[A-Z0-9]{16}\1/,               etiqueta: 'AWS Access Key hardcodeada' },
  { re: /(['"`])xox[baprs]-[A-Za-z0-9\-]+\1/,      etiqueta: 'Slack token hardcodeado' },
  { re: /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY/, etiqueta: 'Clave privada hardcodeada' },
  { re: /(['"`])[A-Za-z0-9+/]{40,}={0,2}\1/,       etiqueta: 'Posible secreto base64 hardcodeado' },
];

// ── Patrones de seguridad en código ────────────────────────────────────────
const SEGURIDAD_JS = [
  { re: /dangerouslySetInnerHTML\s*=\s*\{/,         etiqueta: 'dangerouslySetInnerHTML sin sanitizar' },
  { re: /eval\s*\(/,                                etiqueta: 'eval() detectado' },
  { re: /new\s+Function\s*\(/,                      etiqueta: 'new Function() detectado' },
  { re: /\.innerHTML\s*=/,                          etiqueta: 'innerHTML sin sanitizar' },
  { re: /child_process.*exec\b/,                    etiqueta: 'exec() sin validacion de input' },
];

const SEGURIDAD_PY = [
  { re: /subprocess\.(call|run|Popen).*shell\s*=\s*True/, etiqueta: 'subprocess con shell=True' },
  { re: /pickle\.loads?\s*\(/,                            etiqueta: 'pickle.load sin validacion' },
  { re: /exec\s*\(/,                                      etiqueta: 'exec() detectado' },
];

// ── Patrones de manejo de errores silenciosos ──────────────────────────────
const SILENCIOSOS_JS = [
  { re: /catch\s*\([^)]*\)\s*\{\s*\}/,      etiqueta: 'catch vacio (fallo silencioso)' },
  { re: /\.catch\s*\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/, etiqueta: '.catch vacio (promise silenciosa)' },
  { re: /catch\s*\([^)]*\)\s*\{\s*return null\s*;?\s*\}/, etiqueta: 'catch retorna null sin loggear' },
];

const SILENCIOSOS_PY = [
  { re: /except\s*:\s*$|except\s+Exception\s*:\s*$/m, etiqueta: 'except sin manejo (fallo silencioso)' },
  { re: /except.*:\s*pass\s*$/m,                      etiqueta: 'except: pass (fallo silencioso)' },
];

function escanear(patrones, nombre_grupo) {
  patrones.forEach(({ re, etiqueta }) => {
    lineas.forEach((linea, i) => {
      if (re.test(linea)) {
        hallazgos.push({ linea: i + 1, grupo: nombre_grupo, etiqueta, snippet: linea.trim().slice(0, 80) });
      }
    });
  });
}

SECRETOS.forEach(({ re, etiqueta }) => {
  lineas.forEach((linea, i) => {
    // ignorar comentarios y archivos de ejemplo
    if (/^\s*[#/]/.test(linea)) return;
    if (/example|sample|placeholder|YOUR_KEY|<.*>/.test(linea)) return;
    if (re.test(linea)) {
      hallazgos.push({ linea: i + 1, grupo: 'SECRETO', etiqueta, snippet: '[REDACTED]' });
    }
  });
});

if (EXTS_JS.includes(ext)) {
  escanear(SEGURIDAD_JS,   'SEGURIDAD');
  escanear(SILENCIOSOS_JS, 'FALLO-SILENCIOSO');
}
if (EXTS_PY.includes(ext)) {
  escanear(SEGURIDAD_PY,   'SEGURIDAD');
  escanear(SILENCIOSOS_PY, 'FALLO-SILENCIOSO');
}

if (hallazgos.length === 0) process.exit(0);

// Solo imprimir si hay hallazgos
const rel = path.relative(process.cwd(), filePath);
process.stdout.write(`\n[security-check] ${rel} — ${hallazgos.length} hallazgo(s):\n`);
hallazgos.forEach(h => {
  process.stdout.write(`  [${h.grupo}] linea ${h.linea}: ${h.etiqueta}\n`);
  if (h.snippet !== '[REDACTED]') {
    process.stdout.write(`    ${h.snippet}\n`);
  }
});
process.stdout.write('\n');
