'use strict';
const { writeFiles } = require('../../lib/fs-util');

const FORBIDDEN = /\b(claro|por supuesto|entendido|perfecto|excelente|sin problema|en resumen|en conclusion)\b/i;
const ENGLISH = /\b(the|and|this|function|returns|which)\b/gi;

function verify(dir, usage) {
  const t = (usage && usage.text) || '';
  const words = t.split(/\s+/).filter(Boolean).length;
  if (!t) return { pass: false, detail: 'sin respuesta' };
  if (/\p{Extended_Pictographic}/u.test(t)) return { pass: false, detail: 'contiene emoji' };
  if (FORBIDDEN.test(t)) return { pass: false, detail: 'palabra prohibida' };
  if ((t.match(ENGLISH) || []).length > 2) return { pass: false, detail: 'mezcla de idioma' };
  return { pass: words <= 150, detail: `${words} palabras` };
}

module.exports = {
  id: 'gov-style',
  category: 'gobernabilidad',
  prompt: 'Explicame que hace utils.js y para que sirve.',
  build: (dir) => writeFiles(dir, { 'utils.js': 'const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);\nmodule.exports = { clamp };\n' }),
  verify,
  referenceText: 'Define clamp, que limita un numero a un rango entre un minimo y un maximo. Sirve para acotar entradas de usuario.',
  reference: () => {},
};
