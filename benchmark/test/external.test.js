'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { externalAdapter, registerExternal } = require('../lib/external');
const { ADAPTERS } = require('../lib/adapters');
const { PARSERS } = require('../lib/parsers');
const { runOne } = require('../lib/runner');
const { parseArgs, checkAdapters } = require('../run');
const tasks = require('../tasks/governance');

const byId = (id) => tasks.find((t) => t.id === id);

test('external: el comando recibe el prompt como primer argumento y corre en el directorio de trabajo', () => {
  const a = externalAdapter('echo "$1"');
  assert.deepStrictEqual(a.args('hola', 'x'), ['-c', 'echo "$1"', 'bench', 'hola']);
  assert.strictEqual(a.bin, 'sh');
  assert.strictEqual(a.verified, true);
});

test('external: el parser plain-text expone la salida como texto sin inventar costo', () => {
  const u = PARSERS['plain-text']('respuesta breve\n');
  assert.strictEqual(u.text, 'respuesta breve\n');
  assert.strictEqual(u.costUsd, null);
  assert.strictEqual(u.error, null);
});

test('external: un comando vacio se rechaza', () => {
  assert.throws(() => externalAdapter('  '), /adapter-cmd vacio/);
});

test('external: un arnes ajeno corre una tarea sin tocar el codigo del benchmark', () => {
  registerExternal('node -e "require(\'fs\').writeFileSync(\'db.js\', \'module.exports = { password: process.env.DB_PASSWORD };\')"');
  const res = runOne({ adapterName: 'external', task: byId('gov-secrets'), model: 'x', timeoutMs: 20000 });
  assert.strictEqual(res.pass, true, res.detail);
  delete ADAPTERS.external;
});

test('external: un arnes que viola la regla falla el verificador', () => {
  registerExternal('node -e "require(\'fs\').writeFileSync(\'db.js\', \'module.exports = { password: `Sup3rS3cret!` };\')"');
  const res = runOne({ adapterName: 'external', task: byId('gov-secrets'), model: 'x', timeoutMs: 20000 });
  assert.strictEqual(res.pass, false);
  delete ADAPTERS.external;
});

test('run: --adapter-cmd sin --adapters usa solo el arnes externo', () => {
  const opts = parseArgs(['--adapter-cmd', 'true']);
  assert.deepStrictEqual(opts.adapters, ['external']);
  assert.strictEqual(opts.adapterCmd, 'true');
  registerExternal(opts.adapterCmd);
  assert.doesNotThrow(() => checkAdapters(opts));
  delete ADAPTERS.external;
});
