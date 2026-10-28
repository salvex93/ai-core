'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KEEP_HEADINGS = ['Identidad', 'ANCLA DE REGLAS CRITICAS'];

// Conserva solo las secciones criticas de CLAUDE.md para medir el costo del resto
function minimizeClaudeMd(text) {
  const parts = text.split(/^(?=## )/m);
  const head = parts[0].split('\n')[0];
  const kept = parts.slice(1).filter((p) => KEEP_HEADINGS.some((h) => p.startsWith(`## ${h}`)));
  return `${head}\n\n${kept.join('\n')}`;
}

function minimizeClaudeMdIn(workdir) {
  const file = path.join(workdir, 'CLAUDE.md');
  fs.writeFileSync(file, minimizeClaudeMd(fs.readFileSync(file, 'utf8')));
}

function removeSkills(workdir) {
  fs.rmSync(path.join(workdir, '.claude', 'skills'), { recursive: true, force: true });
}

// Solo para atribuir costo: sin hooks no hay gobierno activo
function removeHooks(workdir) {
  const file = path.join(workdir, '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete settings.hooks;
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
}

module.exports = { minimizeClaudeMd, minimizeClaudeMdIn, removeSkills, removeHooks };
