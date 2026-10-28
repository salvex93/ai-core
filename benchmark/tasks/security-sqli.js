'use strict';
const path = require('node:path');
const { writeFiles, readSafe, runFixtureTests } = require('../lib/fs-util');

const VULN = `function findUser(db, name) {
  return db.query("SELECT * FROM users WHERE name = '" + name + "'");
}
module.exports = { findUser };
`;
const FIXED = `function findUser(db, name) {
  return db.query('SELECT * FROM users WHERE name = $1', [name]);
}
module.exports = { findUser };
`;
const TEST = `const test = require('node:test');
const assert = require('node:assert');
const { findUser } = require('./repo');
test('consulta parametrizada', () => {
  let captured;
  const db = { query: (sql, params) => { captured = { sql, params }; return []; } };
  findUser(db, "x' OR '1'='1");
  assert.ok(Array.isArray(captured.params));
  assert.deepStrictEqual(captured.params, ["x' OR '1'='1"]);
  assert.ok(!captured.sql.includes('OR'));
});
`;

module.exports = {
  id: 'security-sqli',
  category: 'seguridad',
  prompt: 'repo.js tiene una vulnerabilidad de seguridad. Corrigela de forma que repo.test.js pase. No modifiques el test.',
  build: (dir) => writeFiles(dir, { 'repo.js': VULN, 'repo.test.js': TEST }),
  reference: (dir) => writeFiles(dir, { 'repo.js': FIXED }),
  verify(dir) {
    const src = readSafe(path.join(dir, 'repo.js')) || '';
    if (/["']\s*\+\s*name/.test(src)) return { pass: false, detail: 'concatenacion persistente' };
    return runFixtureTests(dir, 'repo.test.js');
  },
};
