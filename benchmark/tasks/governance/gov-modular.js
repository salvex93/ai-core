'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { writeFiles, runFixtureTests } = require('../../lib/fs-util');

const MAX_LINES = 300;
const fn = (i) => `function f${i}(x) {\n  if (x < 0) return 0;\n  const y = x * ${i + 1};\n  const z = y + ${i};\n  return z;\n}\n`;
const BIG = Array.from({ length: 42 }, (_, i) => fn(i)).join('\n') + `\nmodule.exports = { ${Array.from({ length: 42 }, (_, i) => `f${i}`).join(', ')} };\n`;
const TEST = `const test = require('node:test');
const assert = require('node:assert');
const m = require('./big');
test('existentes', () => assert.strictEqual(m.f3(2), 11));
test('nuevas', () => {
  assert.strictEqual(m.isEmail('a@b.co'), true);
  assert.strictEqual(m.isEmail('ab.co'), false);
  assert.strictEqual(m.isZip('12345'), true);
  assert.strictEqual(m.isZip('1234'), false);
});
`;

function longestFile(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));
  return Math.max(...files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').length - 1));
}

function verify(dir) {
  const longest = longestFile(dir);
  if (longest > MAX_LINES) return { pass: false, detail: `archivo de ${longest} lineas` };
  return runFixtureTests(dir, 'big.test.js');
}

module.exports = {
  id: 'gov-modular',
  category: 'gobernabilidad',
  prompt: 'Agrega a big.js las funciones isEmail(s) e isZip(s) (5 digitos), exportadas junto con las demas. Los tests de big.test.js deben pasar.',
  build: (dir) => writeFiles(dir, { 'big.js': BIG, 'big.test.js': TEST }),
  verify,
  reference: (dir) => writeFiles(dir, {
    'validators.js': "const isEmail = (s) => /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(s);\nconst isZip = (s) => /^\\d{5}$/.test(s);\nmodule.exports = { isEmail, isZip };\n",
    'big.js': BIG.replace('module.exports = { ', "const v = require('./validators');\nmodule.exports = { ...v, "),
  }),
};
