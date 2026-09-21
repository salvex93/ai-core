'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { REPO } = require('./_shared');

describe('.claude/evals/prompt-loader.js', () => {
  const MODULE = path.join(REPO, '.claude', 'evals', 'prompt-loader.js');
  const cargarSkillComoChat = require(MODULE);

  test('arma el array de mensajes system+user envolviendo el system prompt en {% raw %}', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-loader-'));
    const skillPath = path.join(dir, 'SKILL.md');
    fs.writeFileSync(skillPath, 'contenido con llaves literales {{ __html: x }} sin escapar');

    const mensajes = cargarSkillComoChat(skillPath, { pregunta: 'hola' });

    assert.deepEqual(mensajes, [
      { role: 'system', content: '{% raw %}contenido con llaves literales {{ __html: x }} sin escapar{% endraw %}' },
      { role: 'user', content: 'hola' },
    ]);
  });

  test('envuelve el contenido completo en un unico bloque {% raw %}...{% endraw %}, preservando llaves dobles de JSX/f-strings intactas', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-loader-'));
    const skillPath = path.join(dir, 'SKILL.md');
    const contenidoJsx = 'dangerouslySetInnerHTML={{ __html: userInput }};\ntransition={{ duration: 0.25 }}';
    fs.writeFileSync(skillPath, contenidoJsx);

    const [system] = cargarSkillComoChat(skillPath, { pregunta: 'x' });

    assert.equal(system.content, `{% raw %}${contenidoJsx}{% endraw %}`);
  });

  test('sustituye vars.pregunta en el mensaje user', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-loader-'));
    const skillPath = path.join(dir, 'SKILL.md');
    fs.writeFileSync(skillPath, 'system prompt');

    const [, user] = cargarSkillComoChat(skillPath, { pregunta: 'pregunta real del test' });

    assert.equal(user.content, 'pregunta real del test');
  });

  test('acepta un array de rutas y arma un mensaje system por archivo, mismo orden, antes del user', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-loader-'));
    const nucleoPath = path.join(dir, 'SKILL.md');
    const referenciaPath = path.join(dir, 'modulo-x.md');
    fs.writeFileSync(nucleoPath, 'nucleo');
    fs.writeFileSync(referenciaPath, 'modulo de referencia');

    const mensajes = cargarSkillComoChat([nucleoPath, referenciaPath], { pregunta: 'hola' });

    assert.deepEqual(mensajes, [
      { role: 'system', content: '{% raw %}nucleo{% endraw %}' },
      { role: 'system', content: '{% raw %}modulo de referencia{% endraw %}' },
      { role: 'user', content: 'hola' },
    ]);
  });
});

describe('prompt functions de promptfoo (tech-lead-frontend-chat.js, web-scraping-specialist-chat.js)', () => {
  for (const skill of ['tech-lead-frontend', 'web-scraping-specialist']) {
    test(`${skill}-chat.js retorna un string JSON con mensajes system+user leidos del SKILL.md real`, () => {
      const promptFn = require(path.join(REPO, '.claude', 'evals', `${skill}-chat.js`));
      const salida = promptFn({ vars: { pregunta: 'pregunta de prueba' } });

      assert.equal(typeof salida, 'string', 'debe retornar un string (promptfoo no debe re-templatizarlo)');
      const mensajes = JSON.parse(salida);
      // uno o mas mensajes system (SKILL.md + references/*.md tras G4), siempre
      // terminando en el mensaje user con la pregunta.
      const ultimo = mensajes[mensajes.length - 1];
      const systemMsgs = mensajes.slice(0, -1);
      assert.ok(systemMsgs.length > 0, 'debe haber al menos un mensaje system');
      for (const msg of systemMsgs) {
        assert.equal(msg.role, 'system');
        assert.ok(msg.content.length > 0, 'el system prompt debe contener contenido real, no vacio');
      }
      assert.deepEqual(ultimo, { role: 'user', content: 'pregunta de prueba' });
    });
  }
});
