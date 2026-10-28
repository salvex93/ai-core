'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ADAPTERS } = require('./lib/adapters');
const { runOne } = require('./lib/runner');
const { toMarkdown } = require('./lib/report');
const { runSession } = require('./lib/session');
const { sessionToMarkdown } = require('./lib/session-report');
const performance = require('./tasks');
const governance = require('./tasks/governance');

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

function save(results, opts) {
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(OUT, `run-${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ opts, results }, null, 2));
  fs.writeFileSync(`${base}.md`, toMarkdown(results, opts.adapters[0]));
  return base;
}

function runSessions(opts) {
  const all = {};
  for (const name of opts.adapters) {
    all[name] = runSession({ adapterName: name, tasks: performance, model: opts.model, timeoutMs: opts.timeoutMs });
    all[name].forEach((t) => console.log(JSON.stringify({ adapter: name, turn: t.turn, task: t.task, pass: t.pass, costUsd: t.costUsd, wallMs: t.wallMs })));
  }
  fs.mkdirSync(OUT, { recursive: true });
  const base = path.join(OUT, `session-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ opts, all }, null, 2));
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
