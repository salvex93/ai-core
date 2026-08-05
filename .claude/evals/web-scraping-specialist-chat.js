'use strict';

const path = require('node:path');
const cargarSkillComoChat = require('./prompt-loader');

const SKILL_MD = path.join(__dirname, '..', 'skills', 'web-scraping-specialist', 'SKILL.md');

module.exports = function promptFn(context) {
  return JSON.stringify(cargarSkillComoChat(SKILL_MD, context.vars));
};
