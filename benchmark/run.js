'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ADAPTERS } = require('./lib/adapters');
const { runOne } = require('./lib/runner');
const { toMarkdown } = require('./lib/report');
const { runSession, TURN_ORDER_LONG } = require('./lib/session');
const { collectMeta } = require('./lib/meta');
const { sessionToMarkdown, medianTurns } = require('./lib/session-report');
const performance = require('./tasks');
const governance = require('./tasks/governance');
const recall = require('./tasks/recall');

const OUT = path.join(__dirname, 'results');

function parseArgs(argv) {
  const get = (flag, def) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : def; };
  return {
    adapters: get('--adapters', 'claude-vanilla,ai-core').split(','),
    reps: Number(get('--reps', '3')),
    model: get('--model', 'sonnet'),
    timeoutMs: Number(get('--timeout', '300')) * 1000,
    only: get('--tasks', '') ? get('--tasks').split(',') : null,
    allowUnverified: argv.includes('--allow-unverified'),
    session: argv.includes('--session'),
    long: argv.includes('--long'),
    suite: get('--suite', 'performance'),
  };
}

function checkAdapters(opts) {
  for (const name of opts.adapters) {
    if (!ADAPTERS[name]) throw new Error(`arnes desconocido: ${name}`);
    if (!ADAPTERS[name].verified && !opts.allowUnverified) {
      throw new Error(`${name} tiene comando sin verificar; define su comando y usa --allow-unverified`);
    }
  }
}

function collect(opts) {
  const pool = opts.suite === 'governance' ? governance : opts.suite === 'all' ? [...performance, ...governance] : performance;
  const selected = pool.filter((t) => !opts.only || opts.only.includes(t.id));
  const results = [];
  for (let rep = 1; rep <= opts.reps; rep++) {
    for (const task of selected) {
      for (const adapterName of opts.adapters) {
        const res = runOne({ adapterName, task, model: opts.model, timeoutMs: opts.timeoutMs });
        results.push({ adapter: adapterName, task: task.id, rep, model: opts.model, ...res });
        console.log(JSON.stringify({ adapter: adapterName, task: task.id, rep, pass: res.pass, wallMs: res.wallMs, costUsd: res.costUsd }));
      }
    }
  }
  return results;
}

// Mismas raices que usa lib/adapters.js: el baseline y la rama con carga dinamica
function benchMeta() {
  const def = path.resolve(__dirname, '..');
  return collectMeta({
    'ai-core': process.env.AI_CORE_ROOT || def,
    'ai-core-dynamic': process.env.AI_CORE_DYNAMIC_ROOT || def,
  });
}

function save(results, opts) {
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(OUT, `run-${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ meta: benchMeta(), opts, results }, null, 2));
  fs.writeFileSync(`${base}.md`, toMarkdown(results, opts.adapters[0]));
  return base;
}

function runSessions(opts) {
  const runs = Object.fromEntries(opts.adapters.map((n) => [n, []]));
  const pool = opts.long ? [...performance, ...governance, ...recall] : performance;
  for (let rep = 1; rep <= opts.reps; rep++) {
    for (const name of opts.adapters) {
      const turns = runSession({ adapterName: name, tasks: pool, model: opts.model, timeoutMs: opts.timeoutMs, order: opts.long ? TURN_ORDER_LONG : undefined });
      runs[name].push(turns);
      turns.forEach((t) => console.log(JSON.stringify({ adapter: name, rep, turn: t.turn, task: t.task, pass: t.pass, costUsd: t.costUsd, wallMs: t.wallMs })));
    }
  }
  const all = Object.fromEntries(Object.entries(runs).map(([n, r]) => [n, medianTurns(r)]));
  fs.mkdirSync(OUT, { recursive: true });
  const base = path.join(OUT, `session-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ meta: benchMeta(), opts, runs, all }, null, 2));
  const md = sessionToMarkdown(all, opts.adapters[0]);
  fs.writeFileSync(`${base}.md`, md);
  console.log(`\n${md}\nResultados: ${base}.json`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  checkAdapters(opts);
  if (opts.session) return runSessions(opts);
  const results = collect(opts);
  const base = save(results, opts);
  console.log(`\n${toMarkdown(results, opts.adapters[0])}\nResultados: ${base}.json`);
}

if (require.main === module) main();
module.exports = { parseArgs, checkAdapters };
