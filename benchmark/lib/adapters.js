'use strict';
const fs = require('node:fs');
const path = require('node:path');

const AI_CORE_ROOT = process.env.AI_CORE_ROOT || path.resolve(__dirname, '..', '..');
const variants = require('./variants');
const { CODEX_ADAPTERS } = require('./codex');
// Raiz de la rama con carga dinamica; AI_CORE_ROOT apunta al baseline cuando se comparan ambas
const DYNAMIC_ROOT = process.env.AI_CORE_DYNAMIC_ROOT || path.resolve(__dirname, '..', '..');
const SKIP = new Set(['memory-vault', 'node_modules', '.git']);

// Copia el arnes al workdir sin estado de memoria ni historial de sesiones
function installAiCore(workdir, root = AI_CORE_ROOT) {
  fs.cpSync(path.join(root, '.claude'), path.join(workdir, '.claude'), {
    recursive: true,
    filter: (src) => !SKIP.has(path.basename(src)),
  });
  fs.copyFileSync(path.join(root, 'CLAUDE.md'), path.join(workdir, 'CLAUDE.md'));
  repointSettings(workdir, root);
}

// Los hooks usan rutas absolutas: sin reescribirlas leen el repo real y el modo permission los deja mudos
function repointSettings(workdir, root) {
  const file = path.join(workdir, '.claude', 'settings.json');
  if (!fs.existsSync(file)) return;
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').split(root).join(workdir));
}

// Permisos acotados: edicion automatica y solo node/npm via Bash, sin saltar el sistema de permisos
function claudeArgs(prompt, model, resumeId) {
  const args = ['-p', prompt, '--output-format', 'json',
    '--setting-sources', 'project,local', '--permission-mode', 'acceptEdits', '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(node:*)', 'Bash(git:*)'];
  const withModel = model ? [...args, '--model', model] : args;
  return resumeId ? [...withModel, '--resume', resumeId] : withModel;
}

// Plantilla externa: el usuario define el comando; {prompt} se sustituye como un unico argumento
function templateArgs(envVar, prompt) {
  const raw = process.env[envVar];
  if (!raw) return null;
  return JSON.parse(raw).map((a) => a.replace('{prompt}', prompt));
}

// Variante de ai-core con un recorte aplicado tras la instalacion, para atribuir costo por pieza
function aiCoreVariant(...mutators) {
  return {
    verified: true, parser: 'claude-json', bin: 'claude', sessions: true,
    setup: (dir) => { installAiCore(dir); mutators.forEach((m) => m(dir)); },
    args: (prompt, model, resumeId) => claudeArgs(prompt, model, resumeId),
  };
}

const ADAPTERS = {
  'ai-core': {
    verified: true, parser: 'claude-json', bin: 'claude',
    setup: installAiCore,
    sessions: true,
    args: (prompt, model, resumeId) => claudeArgs(prompt, model, resumeId),
  },
  'claude-vanilla': {
    verified: true, parser: 'claude-json', bin: 'claude',
    setup: () => {},
    sessions: true,
    args: (prompt, model, resumeId) => claudeArgs(prompt, model, resumeId),
  },
  'ai-core-dynamic': {
    verified: true, parser: 'claude-json', bin: 'claude', sessions: true,
    setup: (dir) => installAiCore(dir, DYNAMIC_ROOT),
    args: (prompt, model, resumeId) => claudeArgs(prompt, model, resumeId),
  },
  'ai-core-dynamic-short': {
    verified: true, parser: 'claude-json', bin: 'claude', sessions: true,
    setup: (dir) => { installAiCore(dir, DYNAMIC_ROOT); variants.shortenDescriptions(dir); },
    args: (prompt, model, resumeId) => claudeArgs(prompt, model, resumeId),
  },
  'ai-core-claudemd-min': aiCoreVariant(variants.minimizeClaudeMdIn),
  'ai-core-no-skills': aiCoreVariant(variants.removeSkills),
  'ai-core-no-hooks': aiCoreVariant(variants.removeHooks),
  ...CODEX_ADAPTERS,
  hermes: {
    verified: false, parser: 'wall-only', bin: null, envVar: 'HERMES_CMD_JSON',
    setup: () => {},
    args: (prompt) => templateArgs('HERMES_CMD_JSON', prompt),
  },
  openclaw: {
    verified: false, parser: 'wall-only', bin: null, envVar: 'OPENCLAW_CMD_JSON',
    setup: () => {},
    args: (prompt) => templateArgs('OPENCLAW_CMD_JSON', prompt),
  },
};

module.exports = { ADAPTERS, claudeArgs, installAiCore };
