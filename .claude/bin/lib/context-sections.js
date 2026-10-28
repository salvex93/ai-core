'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SECTIONS_DIR = path.join(__dirname, '..', '..', 'context-sections');

// Cada seccion se inyecta solo si el prompt calza con su patron; el texto vive en context-sections/.
const SECTIONS = [
  { file: 'gobierno-subagentes.md', pattern: /subagent|agente|paralel|break-?glass|confirmar-|guard|hook|jailbreak|sandbox|rollback|loop/i },
  { file: 'commits-staging.md', pattern: /commit|push|stage|stagea|git add|pull request|\bpr\b|rama|branch|merge|rebase/i },
  { file: 'vigencia-tecnologica.md', pattern: /vigencia|nuevo modelo|nueva version|release|lanzamiento|pricing|precio|free tier|deprecad/i },
  { file: 'roles-y-estilo.md', pattern: /\brol\b|architect|coder|auditor|neanderthal|diseno|arquitectura|audit|diagnostic|refactor/i },
  { file: 'skills-y-agentes.md', pattern: /skill|agente|agent\.md|crear un|nuevo skill/i },
  { file: 'ahorro-tokens.md', pattern: /gemini|token|cuota|contexto|compact|clear|\blog|archivo|repositorio|backlog|resum|web/i },
  { file: 'estandares-codigo-docs.md', pattern: /codigo|funcion|clase|modulo|implementa|crea|agrega|escrib|refactor|test|bug|\.js|\.ts|\.py|documento|readme|\.md|comentario/i },
  { file: 'instalacion-anfitrion.md', pattern: /instal|anfitrion|host|norm-harness|npm run|comando|script/i },
  { file: 'propuestas-comerciales.md', pattern: /propuesta|cotizaci|presupuesto|brief|alcance comercial/i },
];

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Devuelve los nombres de seccion cuyo patron calza con el prompt.
 * @param {string} prompt
 * @returns {string[]}
 */
function seleccionarSecciones(prompt) {
  const texto = normalizar(prompt);
  return SECTIONS.filter((s) => s.pattern.test(texto)).map((s) => s.file);
}

/**
 * Lee el texto de una seccion; null si el archivo no existe.
 * @param {string} file
 * @param {string} [dir]
 * @returns {string|null}
 */
function leerSeccion(file, dir = SECTIONS_DIR) {
  try {
    return fs.readFileSync(path.join(dir, file), 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * Compone el bloque de contexto a inyectar para un prompt, o '' si ninguna calza.
 * @param {string} prompt
 * @param {string} [dir]
 * @returns {string}
 */
function componerContexto(prompt, dir = SECTIONS_DIR) {
  const textos = seleccionarSecciones(prompt).map((f) => leerSeccion(f, dir)).filter(Boolean);
  if (textos.length === 0) return '';
  return `[CONTEXTO AI-CORE BAJO DEMANDA]\n${textos.join('\n\n')}\n`;
}

module.exports = { SECTIONS, SECTIONS_DIR, seleccionarSecciones, leerSeccion, componerContexto };
