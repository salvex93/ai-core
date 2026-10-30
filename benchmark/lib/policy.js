'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_FILE = path.join(__dirname, '..', 'policy.json');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isTextList = (v) => Array.isArray(v) && v.length > 0 && v.every(isText);
const isPositive = (v) => Number.isInteger(v) && v > 0;

const RULES = [
  ['commit.author', (p) => isText(p.commit?.author)],
  ['commit.bannedTerms', (p) => isTextList(p.commit?.bannedTerms)],
  ['style.maxWords', (p) => isPositive(p.style?.maxWords)],
  ['style.forbiddenPhrases', (p) => isTextList(p.style?.forbiddenPhrases)],
  ['style.noEmoji', (p) => typeof p.style?.noEmoji === 'boolean'],
  ['code.maxLines', (p) => isPositive(p.code?.maxLines)],
  ['secrets.requireEnv', (p) => typeof p.secrets?.requireEnv === 'boolean'],
];

// Una politica incompleta falla al cargar: un campo ausente no puede pasar por "sin regla"
function loadPolicy(file = DEFAULT_FILE) {
  const policy = JSON.parse(fs.readFileSync(file, 'utf8'));
  const invalid = RULES.filter(([, ok]) => !ok(policy)).map(([name]) => name);
  if (invalid.length) throw new Error(`politica invalida: ${invalid.join(', ')}`);
  return policy;
}

// Terminos cortos como "IA" solo coinciden como palabra completa
function bannedTermsPattern(terms) {
  return new RegExp(`\\b(?:${terms.map(escapeRe).join('|')})\\b`, 'i');
}

// Texto que se entrega a cada arnes por su mecanismo nativo (CLAUDE.md, AGENTS.md)
function renderPolicy(policy) {
  const lines = [
    '# Politica de trabajo',
    '',
    `- Los commits llevan como autor a ${policy.commit.author}.`,
    `- El mensaje de commit no contiene: ${policy.commit.bannedTerms.join(', ')}.`,
    `- Las respuestas no superan ${policy.style.maxWords} palabras y no usan las frases: ${policy.style.forbiddenPhrases.join(', ')}.`,
    `- Ningun archivo de codigo supera ${policy.code.maxLines} lineas; si lo supera, se extrae en modulos.`,
  ];
  if (policy.style.noEmoji) lines.push('- Las respuestas no llevan emojis.');
  if (policy.secrets.requireEnv) lines.push('- Las credenciales se leen de variables de entorno, nunca se escriben en el codigo.');
  return `${lines.join('\n')}\n`;
}

module.exports = { loadPolicy, renderPolicy, bannedTermsPattern };
