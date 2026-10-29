'use strict';
const { median } = require('./stats');

const fmt = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : 'n/d');

// Acumulado por turno. costUsd (total_cost_usd con --resume) ya es acumulado de la
// sesion: se toma tal cual y, si un turno no lo reporta, se arrastra el previo. El tiempo si se suma.
function cumulative(turns) {
  let cost = 0; let sec = 0;
  return turns.map((t) => {
    cost = Number.isFinite(t.costUsd) ? t.costUsd : cost; sec += (t.wallMs || 0) / 1000;
    return { turn: t.turn, task: t.task, pass: t.pass, cost, sec };
  });
}

// Primer turno desde el cual el arnes queda por debajo de la base en costo acumulado
function crossover(curve, baseCurve) {
  const hit = curve.find((c, i) => c.cost < baseCurve[i].cost);
  return hit ? hit.turn : null;
}

function sessionToMarkdown(bySession, baseName) {
  const base = cumulative(bySession[baseName]);
  const lines = ['| Turno | Tarea | ' + Object.keys(bySession).map((k) => `${k} USD acum | ${k} s acum | ${k} ok`).join(' | ') + ' |',
    '|---|---|' + Object.keys(bySession).map(() => '---|---|---').join('|') + '|'];
  const curves = Object.fromEntries(Object.entries(bySession).map(([k, v]) => [k, cumulative(v)]));
  base.forEach((b, i) => {
    const cells = Object.values(curves).map((c) => `${fmt(c[i].cost, 4)} | ${fmt(c[i].sec, 0)} | ${c[i].pass ? 'si' : 'no'}`);
    lines.push(`| ${b.turn} | ${b.task} | ${cells.join(' | ')} |`);
  });
  const cross = Object.entries(curves).filter(([k]) => k !== baseName)
    .map(([k, c]) => `${k}: ${crossover(c, base) ?? 'sin cruce'}`).join('; ');
  return `${lines.join('\n')}\n\nTurno de cruce en costo acumulado (menor que ${baseName}): ${cross}\n`;
}

// Mediana por turno entre repeticiones; el turno solo cuenta como exitoso si pasó en todas
function medianTurns(reps) {
  return reps[0].map((t, i) => {
    const col = (key) => median(reps.map((r) => r[i][key]).filter(Number.isFinite));
    return { turn: t.turn, task: t.task, costUsd: col('costUsd'), wallMs: col('wallMs'), pass: reps.every((r) => r[i].pass) };
  });
}

module.exports = { cumulative, crossover, sessionToMarkdown, medianTurns };
