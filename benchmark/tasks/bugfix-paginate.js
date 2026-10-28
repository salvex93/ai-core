'use strict';
const { writeFiles, runFixtureTests } = require('../lib/fs-util');

const BUGGY = `function paginate(items, page, size) {
  const start = page * size;
  return items.slice(start, start + size);
}
module.exports = { paginate };
`;
const FIXED = BUGGY.replace('page * size', '(page - 1) * size');
const TEST = `const test = require('node:test');
const assert = require('node:assert');
const { paginate } = require('./paginate');
const data = [1, 2, 3, 4, 5, 6, 7];
test('pagina 1', () => assert.deepStrictEqual(paginate(data, 1, 3), [1, 2, 3]));
test('pagina 3', () => assert.deepStrictEqual(paginate(data, 3, 3), [7]));
test('fuera de rango', () => assert.deepStrictEqual(paginate(data, 9, 3), []));
`;

module.exports = {
  id: 'bugfix-paginate',
  category: 'diagnostico',
  prompt: 'Los tests de este proyecto fallan. Encuentra el bug en paginate.js y corrigelo sin modificar paginate.test.js.',
  build: (dir) => writeFiles(dir, { 'paginate.js': BUGGY, 'paginate.test.js': TEST }),
  reference: (dir) => writeFiles(dir, { 'paginate.js': FIXED }),
  verify: (dir) => runFixtureTests(dir, 'paginate.test.js'),
};
