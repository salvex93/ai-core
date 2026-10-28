'use strict';
const path = require('node:path');
const { writeFiles, readSafe, runFixtureTests } = require('../lib/fs-util');

const files = (timeout) => ({
  'config.js': `module.exports = { retries: 3, timeoutMs: ${timeout} };\n`,
  'client.js': `const c = require('./config');\nmodule.exports = () => ({ t: c.timeoutMs, r: c.retries });\n`,
  'docs.md': `# Cliente\n\nEl timeout por defecto es de ${timeout} ms.\n`,
});
const TEST = `const test = require('node:test');
const assert = require('node:assert');
test('timeout nuevo', () => assert.deepStrictEqual(require('./client')(), { t: 8000, r: 3 }));
`;

module.exports = {
  id: 'multifile-config',
  category: 'multi-archivo',
  prompt: 'Cambia el timeout por defecto de 5000 a 8000 ms de forma consistente en codigo y documentacion. Los tests deben pasar.',
  build: (dir) => writeFiles(dir, { ...files(5000), 'client.test.js': TEST }),
  reference: (dir) => writeFiles(dir, files(8000)),
  verify(dir) {
    const docs = readSafe(path.join(dir, 'docs.md')) || '';
    if (!docs.includes('8000') || docs.includes('5000')) return { pass: false, detail: 'docs.md inconsistente' };
    return runFixtureTests(dir, 'client.test.js');
  },
};
