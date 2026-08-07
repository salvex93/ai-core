'use strict';

/**
 * SessionCacheMetrics — Calculo puro del ahorro real de prompt caching a
 * partir de los eventos usage que Anthropic reporta en cada turno assistant
 * de una sesion de Claude Code (.jsonl bajo ~/.claude/projects/<proyecto>/).
 *
 * Extraido de tests/token-metrics.js (SRP): el script de linea de comandos
 * no debe ser el unico lugar donde vive el calculo -- sin extraerlo, el
 * umbral de ahorro por cache (tests/harness/session-cache-metrics-js.test.js)
 * no tiene forma de probarse contra datos sinteticos sin invocar el proceso
 * completo ni depender de sesiones reales en disco.
 */

/**
 * Calcula las metricas de uso real de tokens de una sesion, a partir de las
 * lineas ya parseadas de su archivo .jsonl.
 *
 * @param {Array<object>} entries - entradas ya parseadas de JSON.parse por linea
 * @returns {{turns:number, input_tokens:number, output_tokens:number,
 *   cache_read_tokens:number, cache_creation_tokens:number,
 *   guard_read_blocks:number, gemini_delegations:number,
 *   compact_executions:number, total_tokens_real:number,
 *   total_tokens_sin_cache:number, ahorro_por_cache_pct:number}}
 */
function calcularMetricasDeSesion(entries) {
  let turns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let guardBlocks = 0;
  let geminiDelegations = 0;
  let compactCount = 0;

  for (const entry of entries) {
    if (entry.type !== 'assistant' && entry.type !== 'user') continue;
    turns++;

    const usage = entry.message?.usage;
    if (usage) {
      inputTokens += usage.input_tokens || 0;
      outputTokens += usage.output_tokens || 0;
      cacheReadTokens += usage.cache_read_input_tokens || 0;
      cacheCreationTokens += usage.cache_creation_input_tokens || 0;
    }

    const bloques = Array.isArray(entry.message?.content) ? entry.message.content : [];
    for (const b of bloques) {
      const texto = typeof b.text === 'string' ? b.text
        : typeof b.content === 'string' ? b.content
        : '';
      if (!texto) continue;
      if (texto.includes('GUARD-READ')) guardBlocks++;
      if (texto.includes('gemini') || texto.includes('analizar_archivo')) geminiDelegations++;
      if (texto.includes('/compact')) compactCount++;
    }
  }

  const totalReal = inputTokens + outputTokens + cacheCreationTokens;
  const totalSinCache = totalReal + cacheReadTokens;

  return {
    turns,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: cacheReadTokens,
    cache_creation_tokens: cacheCreationTokens,
    guard_read_blocks: guardBlocks,
    gemini_delegations: geminiDelegations,
    compact_executions: compactCount,
    total_tokens_real: totalReal,
    total_tokens_sin_cache: totalSinCache,
    ahorro_por_cache_pct: totalSinCache > 0 ? Math.round((cacheReadTokens / totalSinCache) * 100) : 0,
  };
}

/**
 * Parsea el contenido crudo de un archivo .jsonl de sesion (una entrada JSON
 * por linea) y calcula sus metricas. Lineas corruptas o parciales se omiten.
 *
 * @param {string} raw - contenido completo del archivo .jsonl
 * @returns {ReturnType<typeof calcularMetricasDeSesion>}
 */
function calcularMetricasDeJsonl(raw) {
  const entries = raw.trim().split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
  return calcularMetricasDeSesion(entries);
}

module.exports = { calcularMetricasDeSesion, calcularMetricasDeJsonl };
