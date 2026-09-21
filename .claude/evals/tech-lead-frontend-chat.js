'use strict';

const path = require('node:path');
const cargarSkillComoChat = require('./prompt-loader');

const SKILL_DIR = path.join(__dirname, '..', 'skills', 'tech-lead-frontend');
const RUTAS = [
  path.join(SKILL_DIR, 'SKILL.md'),
  path.join(SKILL_DIR, 'references', 'motion-design.md'),
  path.join(SKILL_DIR, 'references', '3d-web-shaders.md'),
];

module.exports = function promptFn(context) {
  return JSON.stringify(cargarSkillComoChat(RUTAS, context.vars));
};
