'use strict';
const { median, iqr, deltaPct } = require('./stats');

const nums = (runs, pick) => runs.map(pick).filter((v) => Number.isFinite(v));
const fmt = (v, d = 2) => (v === null || v === undefined ? 'n/d' : v.toFixed(d));
const fmtPct = (v) => (v === null ? 'n/d' : `${v.toFixed(0)}%`);

// Agrega las corridas de un arnes: tasa de exito y medianas de tiempo, costo y tokens
function summarize(runs) {
  const done = runs.filter((r) => !r.skipped && !r.invalid);
  const totalTok = (r) => (r.tokens ? r.tokens.input + r.tokens.output + r.tokens.cacheRead + r.tokens.cacheWrite : NaN);
  return {
    n: done.length,
    invalid: runs.filter((r) => r.invalid).length,
    successRate: done.length ? (done.filter((r) => r.pass).length / done.length) * 100 : null,
    wallSecMedian: median(nums(done, (r) => r.wallMs / 1000)),
    wallSecIqr: iqr(nums(done, (r) => r.wallMs / 1000)),
    costMedian: median(nums(done, (r) => r.costUsd)),
    tokensMedian: median(nums(done, totalTok)),
  };
}

function groupBy(results, key) {
  return results.reduce((acc, r) => { (acc[r[key]] ||= []).push(r); return acc; }, {});
}

function row(name, s, base) {
  const dt = base ? deltaPct(s.wallSecMedian, base.wallSecMedian) : null;
  const dc = base ? deltaPct(s.costMedian, base.costMedian) : null;
  return `| ${name} | ${s.n} (${s.invalid} invalidas) | ${fmt(s.successRate, 0)}% | ${fmt(s.wallSecMedian, 1)} (IQR ${fmt(s.wallSecIqr, 1)}) | ${fmtPct(dt)} | ${fmt(s.costMedian, 4)} | ${fmtPct(dc)} | ${fmt(s.tokensMedian, 0)} |`;
}

const HEAD = '| Arnes | Corridas | Exito | Tiempo mediano s | Delta tiempo | Costo mediano USD | Delta costo | Tokens medianos |\n|---|---|---|---|---|---|---|---|';

// Tabla global; el baseline es el primer arnes de la lista y el delta negativo es ahorro
function toMarkdown(results, baselineName) {
  const by = groupBy(results, 'adapter');
  const sums = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, summarize(v)]));
  const base = sums[baselineName];
  const rows = Object.entries(sums).map(([k, s]) => row(k, s, k === baselineName ? null : base));
  return `${HEAD}\n${rows.join('\n')}\n`;
}

module.exports = { summarize, toMarkdown, groupBy };
