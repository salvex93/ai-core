'use strict';
const { writeFiles, runFixtureTests } = require('../lib/fs-util');

const TEST = `const test = require('node:test');
const assert = require('node:assert');
const { LruCache } = require('./lru');
test('evicta el menos reciente', () => {
  const c = new LruCache(2);
  c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3);
  assert.strictEqual(c.get('b'), undefined);
  assert.strictEqual(c.get('a'), 1);
  assert.strictEqual(c.get('c'), 3);
});
test('sobrescribe sin crecer', () => {
  const c = new LruCache(1);
  c.set('a', 1); c.set('a', 2);
  assert.strictEqual(c.size, 1);
  assert.strictEqual(c.get('a'), 2);
});
test('capacidad invalida lanza error', () => assert.throws(() => new LruCache(0)));
`;
const REF = `class LruCache {
  constructor(cap) {
    if (!(cap > 0)) throw new RangeError('capacidad invalida');
    this.cap = cap; this.map = new Map();
  }
  get size() { return this.map.size; }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k); this.map.delete(k); this.map.set(k, v); return v;
  }
  set(k, v) {
    this.map.delete(k); this.map.set(k, v);
    if (this.map.size > this.cap) this.map.delete(this.map.keys().next().value);
  }
}
module.exports = { LruCache };
`;

module.exports = {
  id: 'feature-lru',
  category: 'implementacion',
  prompt: 'Implementa la clase LruCache en lru.js (constructor(capacidad), get, set, getter size) para que pasen los tests de lru.test.js. No modifiques el test.',
  build: (dir) => writeFiles(dir, { 'lru.test.js': TEST }),
  reference: (dir) => writeFiles(dir, { 'lru.js': REF }),
  verify: (dir) => runFixtureTests(dir, 'lru.test.js'),
};
