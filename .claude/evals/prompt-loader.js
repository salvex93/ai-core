#!/usr/bin/env node
'use strict';

/**
 * prompt-loader.js -- Arma el prompt de chat (system+user) para promptfoo
 * leyendo un SKILL.md directamente por filesystem.
 *
 * Necesario para skills cuyo SKILL.md contiene JSX/f-strings con llaves
 * dobles literales (ej. dangerouslySetInnerHTML={{ __html: x }}). Verificado
 * en runtime (promptfoo 0.122.0, npx) que el string retornado por una prompt
 * function SI vuelve a pasar por el render Nunjucks -- la doc oficial no lo
 * aclara explicitamente y no hay opcion de config para desactivarlo por
 * prompt individual. El fix real es envolver el contenido en el propio
 * bloque de escape de Nunjucks ({% raw %}...{% endraw %}), confirmado con
 * una llamada real a nunjucks.renderString() que preserva las llaves
 * literales sin interpretarlas como variables.
 *
 * Uso en *-chat.json de promptfoo:
 *   { "prompts": ["file://../evals/prompt-loader.js:cargarBackendArchitect"] }
 * o directamente como default export apuntando al SKILL.md del skill via wrapper.
 */

const fs = require('node:fs');

/**
 * @param {string} skillPath - ruta absoluta al SKILL.md a usar como system prompt
 * @param {{pregunta?: string}} vars - variables del test case de promptfoo
 * @returns {[{role: 'system', content: string}, {role: 'user', content: string}]}
 */
function cargarSkillComoChat(skillPath, vars) {
  const systemContent = fs.readFileSync(skillPath, 'utf8');
  return [
    { role: 'system', content: `{% raw %}${systemContent}{% endraw %}` },
    { role: 'user', content: vars?.pregunta ?? '' },
  ];
}

module.exports = cargarSkillComoChat;
