'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');
const { calcularMetricasDeSesion, calcularMetricasDeJsonl } = require('../../scripts/services/SessionCacheMetrics');

// Piso de "bien implementado" segun referencia de industria (blogs de
// terceros, DigitalOcean/agentbrisk, no fuente oficial primaria de
// Anthropic -- ver Protocolo de Vigencia Tecnologica de CLAUDE.md): 80-95%
// de cache-hit en contenido estatico. Umbral de alerta temprana, no un SLA
// contractual -- si una sesion real cae debajo, indica degradacion del
// mecanismo de cache_control: ephemeral (ej. CLAUDE.md o skills mutando
// tan seguido que el cache nunca calienta), no necesariamente un bug.
const UMBRAL_AHORRO_CACHE_PCT = 80;

function turnoAssistant(usage, textos = []) {
  return {
    type: 'assistant',
    message: {
      usage,
      content: textos.map((t) => ({ type: 'text', text: t })),
    },
  };
}

describe('SessionCacheMetrics — calcularMetricasDeSesion', () => {
  test('sesion sin ningun turno: todo en cero, sin division por cero', () => {
    const r = calcularMetricasDeSesion([]);
    assert.equal(r.turns, 0);
    assert.equal(r.total_tokens_real, 0);
    assert.equal(r.ahorro_por_cache_pct, 0);
  });

  test('suma input/output/cache_read/cache_creation de multiples turnos assistant', () => {
    const entries = [
      turnoAssistant({ input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 20 }),
      turnoAssistant({ input_tokens: 10, output_tokens: 30, cache_read_input_tokens: 950, cache_creation_input_tokens: 0 }),
    ];
    const r = calcularMetricasDeSesion(entries);
    assert.equal(r.input_tokens, 110);
    assert.equal(r.output_tokens, 80);
    assert.equal(r.cache_read_tokens, 1850);
    assert.equal(r.cache_creation_tokens, 20);
  });

  test('total_tokens_real excluye cache_read (tokens NO reprocesados), total_tokens_sin_cache los incluye', () => {
    const entries = [
      turnoAssistant({ input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 9000, cache_creation_input_tokens: 100 }),
    ];
    const r = calcularMetricasDeSesion(entries);
    assert.equal(r.total_tokens_real, 250); // 100 + 50 + 100, sin los 9000 de cache_read
    assert.equal(r.total_tokens_sin_cache, 9250); // 250 + 9000
  });

  test('ahorro_por_cache_pct: 95% de cache_read sobre el total sin cache produce 95', () => {
    const entries = [
      turnoAssistant({ input_tokens: 0, output_tokens: 500, cache_read_input_tokens: 9500, cache_creation_input_tokens: 0 }),
    ];
    const r = calcularMetricasDeSesion(entries);
    assert.equal(r.ahorro_por_cache_pct, 95);
  });

  test('turnos sin campo usage (ej. entradas type=user) no rompen el conteo, solo no suman tokens', () => {
    const entries = [
      { type: 'user', message: {} },
      turnoAssistant({ input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
    ];
    const r = calcularMetricasDeSesion(entries);
    assert.equal(r.turns, 2);
    assert.equal(r.input_tokens, 10);
  });

  test('entradas de tipo distinto a assistant/user (ej. summary) no cuentan como turno', () => {
    const entries = [
      { type: 'summary', message: {} },
      turnoAssistant({ input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
    ];
    const r = calcularMetricasDeSesion(entries);
    assert.equal(r.turns, 1);
  });

  test('detecta mecanismos activos por texto: GUARD-READ, gemini/analizar_archivo, /compact', () => {
    const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const entries = [
      turnoAssistant(usage, ['[GUARD-READ] bloqueado']),
      turnoAssistant(usage, ['delegando a gemini via analizar_archivo']),
      turnoAssistant(usage, ['ejecuta /compact ahora']),
    ];
    const r = calcularMetricasDeSesion(entries);
    assert.equal(r.guard_read_blocks, 1);
    assert.equal(r.gemini_delegations, 1);
    assert.equal(r.compact_executions, 1);
  });

  test('umbral de industria (>= 80% cache-hit en contenido estatico bien implementado): una sesion sintetica con 95% pasa el umbral', () => {
    const entries = [
      turnoAssistant({ input_tokens: 100, output_tokens: 5000, cache_read_input_tokens: 190000, cache_creation_input_tokens: 5000 }),
    ];
    const r = calcularMetricasDeSesion(entries);
    assert.ok(
      r.ahorro_por_cache_pct >= UMBRAL_AHORRO_CACHE_PCT,
      `ahorro ${r.ahorro_por_cache_pct}% debajo del umbral de industria ${UMBRAL_AHORRO_CACHE_PCT}%`
    );
  });

  test('umbral de industria: una sesion sintetica con cache pobre (30%) NO pasa el umbral -- el test debe poder detectar la degradacion', () => {
    const entries = [
      turnoAssistant({ input_tokens: 7000, output_tokens: 0, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 }),
    ];
    const r = calcularMetricasDeSesion(entries);
    assert.equal(r.ahorro_por_cache_pct, 30);
    assert.ok(r.ahorro_por_cache_pct < UMBRAL_AHORRO_CACHE_PCT, 'esta sesion sintetica debe quedar por debajo del umbral para validar que el check no siempre pasa');
  });
});

describe('SessionCacheMetrics — calcularMetricasDeJsonl', () => {
  test('parsea multiples lineas JSON validas separadas por salto de linea', () => {
    const raw = [
      JSON.stringify(turnoAssistant({ input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 80, cache_creation_input_tokens: 0 })),
      JSON.stringify(turnoAssistant({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })),
    ].join('\n');
    const r = calcularMetricasDeJsonl(raw);
    assert.equal(r.turns, 2);
    assert.equal(r.cache_read_tokens, 80);
  });

  test('linea corrupta (JSON invalido) se omite sin lanzar', () => {
    const raw = [
      JSON.stringify(turnoAssistant({ input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })),
      '{esto no es json valido',
      JSON.stringify(turnoAssistant({ input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })),
    ].join('\n');
    const r = calcularMetricasDeJsonl(raw);
    assert.equal(r.turns, 2, 'la linea corrupta se omite, no cuenta como turno ni rompe el parseo');
  });

  test('lineas vacias (archivo con saltos de linea sobrantes) se ignoran', () => {
    const raw = `\n${JSON.stringify(turnoAssistant({ input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }))}\n\n`;
    const r = calcularMetricasDeJsonl(raw);
    assert.equal(r.turns, 1);
  });

  test('archivo vacio: no lanza, retorna metricas en cero', () => {
    const r = calcularMetricasDeJsonl('');
    assert.equal(r.turns, 0);
    assert.equal(r.ahorro_por_cache_pct, 0);
  });
});

describe('SessionCacheMetrics — umbral aplicado a sesiones reales de esta maquina', () => {
  // Normalizacion real usada por Claude Code para nombrar la carpeta de
  // sesiones bajo ~/.claude/projects/ -- mismo calculo que
  // tests/token-metrics.js (getSessionsDir/normalizarNombreProyecto).
  function normalizarNombreProyecto(rutaAbsoluta) {
    return rutaAbsoluta.replace(/[:\\/]/g, '-');
  }

  const REPO = path.resolve(__dirname, '..', '..');
  const sessionsDir = path.join(os.homedir(), '.claude', 'projects', normalizarNombreProyecto(REPO));

  test('la sesion .jsonl mas reciente de este repo mantiene el ahorro por cache dentro del rango de industria (>= 80%) -- alerta temprana si el mecanismo de cache_control se degrada', (t) => {
    if (!fs.existsSync(sessionsDir)) {
      t.skip('sin directorio de sesiones en esta maquina (entorno CI o primera corrida) -- nada que verificar');
      return;
    }

    const archivos = fs.readdirSync(sessionsDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({ f, mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    if (archivos.length === 0) {
      t.skip('sin sesiones .jsonl registradas todavia -- nada que verificar');
      return;
    }

    const masReciente = path.join(sessionsDir, archivos[0].f);
    const raw = fs.readFileSync(masReciente, 'utf8');
    const r = calcularMetricasDeJsonl(raw);

    if (r.total_tokens_sin_cache === 0) {
      t.skip('la sesion mas reciente no tiene turnos con usage real todavia (sesion recien iniciada)');
      return;
    }

    assert.ok(
      r.ahorro_por_cache_pct >= UMBRAL_AHORRO_CACHE_PCT,
      `ahorro real de la sesion mas reciente (${archivos[0].f}) fue ${r.ahorro_por_cache_pct}%, debajo del umbral de industria ${UMBRAL_AHORRO_CACHE_PCT}% -- revisar si CLAUDE.md/skills estan mutando tan seguido que el cache nunca calienta`
    );
  });
});

module.exports = { UMBRAL_AHORRO_CACHE_PCT };
