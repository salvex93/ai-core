'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { writeFiles, runFixtureTests } = require('../lib/fs-util');

const mk = (name) => ({
  'util.js': `function ${name}(n) { return n * 2; }\nmodule.exports = { ${name} };\n`,
  'a.js': `const { ${name} } = require('./util');\nmodule.exports = (x) => ${name}(x) + 1;\n`,
  'b.js': `const { ${name} } = require('./util');\nmodule.exports = (x) => ${name}(${name}(x));\n`,
  'c.js': `const u = require('./util');\nmodule.exports = (x) => u.${name}(x) - 1;\n`,
});
const TEST = `const test = require('node:test');
const assert = require('node:assert');
test('resultados', () => {
  assert.strictEqual(require('./a')(2), 5);
  assert.strictEqual(require('./b')(2), 8);
  assert.strictEqual(require('./c')(2), 3);
});
`;

function oldNameRemains(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
    .some((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('calcDouble'));
}

module.exports = {
  id: 'refactor-rename',
  category: 'refactor',
  prompt: 'Renombra la funcion calcDouble a doubleValue en todo el proyecto (definicion y todos los usos). Los tests deben seguir pasando.',
  build: (dir) => writeFiles(dir, { ...mk('calcDouble'), 'main.test.js': TEST }),
  reference: (dir) => writeFiles(dir, mk('doubleValue')),
  verify(dir) {
    if (oldNameRemains(dir)) return { pass: false, detail: 'calcDouble sigue presente' };
    return runFixtureTests(dir, 'main.test.js');
  },
};
