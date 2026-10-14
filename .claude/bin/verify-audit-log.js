#!/usr/bin/env node
'use strict';

/**
 * verify-audit-log.js — CLI que expone verificarCadenaLog() (lib/break-glass.js)
 * al operador humano bajo demanda.
 *
 * El hash-chain de BREAK_GLASS_LOG.jsonl ya existia (registrarUso/
 * verificarCadenaLog, cubierto por tests/harness/break-glass-lib-js.test.js)
 * pero solo se invocaba desde tests -- sin este comando, un log
 * "tamper-evident" que nadie corre a verificar no cumple su proposito real
 * de auditoria (gap detectado en revision de gobierno 2026-09-22, comparacion
 * contra el control de "audit trail" del marco enterprise de agentes).
 *
 * Uso: npm run verify-audit-log
 */

const { verificarCadenaLog, LOG_PATH } = require('./lib/break-glass');

const resultado = verificarCadenaLog();

if (resultado.totalEntradas === 0) {
  console.log(`[verify-audit-log] ${LOG_PATH} no existe o esta vacio -- nada que verificar.`);
  process.exit(0);
}

if (resultado.integra) {
  console.log(`[verify-audit-log] OK -- ${resultado.totalEntradas} entrada(s), cadena de hashes integra.`);
  process.exit(0);
}

console.error(`[verify-audit-log] CADENA ROTA -- entrada #${resultado.primeraRota} de ${resultado.totalEntradas} no coincide con su hash o con el hashPrevio esperado.`);
console.error(`Revisar ${LOG_PATH} manualmente: una edicion o borrado retroactivo es la causa mas probable.`);
process.exit(1);
