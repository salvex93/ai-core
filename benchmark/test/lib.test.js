'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { median, iqr, deltaPct } = require('../lib/stats');
const { parseClaudeJson } = require('../lib/parsers');
const { toMarkdown } = require('../lib/report');
const { checkAdapters, parseArgs } = require('../run');

test('median e iqr', () => {
  assert.strictEqual(median([3, 1, 2]), 2);
  assert.strictEqual(iqr([1, 2, 3, 4, 5]), 2);
  assert.strictEqual(median([]), null);
});

test('deltaPct negativo es ahorro y base 0 es null', () => {
  assert.strictEqual(deltaPct(50, 100), -50);
  assert.strictEqual(deltaPct(5, 0), null);
});

test('parseClaudeJson extrae costo y tokens; JSON invalido reporta error', () => {
  const ok = parseClaudeJson(JSON.stringify({ total_cost_usd: 0.1, num_turns: 3, usage: { input_tokens: 10, output_tokens: 5 } }));
  assert.strictEqual(ok.costUsd, 0.1);
  assert.strictEqual(ok.tokens.output, 5);
  assert.ok(parseClaudeJson('no json').error);
});

test('toMarkdown calcula delta contra el baseline', () => {
  const mk = (adapter, wallMs, costUsd) => ({ adapter, wallMs, costUsd, pass: true, tokens: null });
  const md = toMarkdown([mk('a', 10000, 1), mk('b', 5000, 0.5)], 'a');
  assert.match(md, /\| b \| 1 \(0 invalidas\) \| 100% \| 5\.0 .* \| -50% \| 0\.5000 \| -50% \|/);
});

test('arneses sin verificar se rechazan sin --allow-unverified', () => {
  assert.throws(() => checkAdapters(parseArgs(['--adapters', 'hermes'])), /sin verificar/);
  assert.throws(() => checkAdapters({ adapters: ['x'] }), /desconocido/);
});

test('corridas invalidas se excluyen de la tasa de exito', () => {
  const runs = [{ adapter: 'a', wallMs: 1000, pass: true }, { adapter: 'a', wallMs: 10, pass: false, invalid: true }];
  const md = toMarkdown(runs, 'a');
  assert.match(md, /\| a \| 1 \(1 invalidas\) \| 100% \|/);
});

test('cumulative y crossover detectan el turno de cruce', () => {
  const { cumulative, crossover } = require('../lib/session-report');
  const base = cumulative([{ turn: 1, costUsd: 1 }, { turn: 2, costUsd: 1 }, { turn: 3, costUsd: 1 }]);
  const h = cumulative([{ turn: 1, costUsd: 2 }, { turn: 2, costUsd: 0.2 }, { turn: 3, costUsd: 0.2 }]);
  assert.strictEqual(base[2].cost, 3);
  assert.strictEqual(crossover(h, base), 3);
  assert.strictEqual(crossover(base, base), null);
});

test('minimizeClaudeMd conserva ANCLA e Identidad y reduce el tamano', () => {
  const { minimizeClaudeMd } = require('../lib/variants');
  const real = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'CLAUDE.md'), 'utf8');
  const min = minimizeClaudeMd(real);
  assert.match(min, /ANCLA DE REGLAS CRITICAS/);
  assert.match(min, /## Identidad/);
  assert.ok(min.length < real.length * 0.5, `min=${min.length} real=${real.length}`);
});

test('installAiCore: reescribe rutas absolutas de settings.json hacia el workdir', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const { installAiCore } = require('../lib/adapters');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'root-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'work-'));
  fs.mkdirSync(path.join(root, '.claude'));
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'x');
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify({ c: root + '/.claude/bin/a.js' }));
  installAiCore(work, root);
  const out = fs.readFileSync(path.join(work, '.claude', 'settings.json'), 'utf8');
  assert.ok(!out.includes(root));
  assert.ok(out.includes(work));
});
