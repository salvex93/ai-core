'use strict';

function sorted(values) {
  return values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
}

function quantile(values, q) {
  const s = sorted(values);
  if (s.length === 0) return null;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const median = (values) => quantile(values, 0.5);
const iqr = (values) => {
  const q1 = quantile(values, 0.25);
  return q1 === null ? null : quantile(values, 0.75) - q1;
};

// Cambio porcentual de `value` respecto a `base`; negativo = ahorro
function deltaPct(value, base) {
  if (!Number.isFinite(value) || !Number.isFinite(base) || base === 0) return null;
  return ((value - base) / base) * 100;
}

module.exports = { quantile, median, iqr, deltaPct };
