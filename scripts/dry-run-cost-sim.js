#!/usr/bin/env node
'use strict';

/**
 * dry-run-cost-sim.js — Simulacion de sesion de 5 turnos con calculo de ahorro.
 *
 * No realiza llamadas reales a la API. Usa los mismos modulos de logica
 * (ModelRouter, ventana deslizante) con tokens simulados.
 *
 * Presupuesto mensual de referencia: 55 USD.
 */

const { route, estimarCosto, MODELOS } = require('./services/ModelRouter');
const {
  aplicarVentanaDeslizante,
  estimarTokensMensajes,
  buildSystemBlocks,
} = require('./anthropic-bridge');

const PRESUPUESTO_MENSUAL_USD = 55;

// ---------------------------------------------------------------------------
// Escenario simulado: 5 turnos reales de uso del sistema
// ---------------------------------------------------------------------------
const TURNOS_SIMULADOS = [
  {
    turno:       1,
    herramienta: 'resumir_backlog',
    descripcion: 'Parseo inicial del BACKLOG.md al iniciar sesion',
    tokens_input_estimados: 1_800,
    tokens_output_estimados: 400,
  },
  {
    turno:       2,
    herramienta: 'analizar_archivo',
    descripcion: 'Analisis del mcp-gemini.js (475 lineas)',
    tokens_input_estimados: 6_200,
    tokens_output_estimados: 800,
  },
  {
    turno:       3,
    herramienta: 'analizar_contenido',
    descripcion: 'Sintesis de logs de error concatenados',
    tokens_input_estimados: 3_100,
    tokens_output_estimados: 500,
  },
  {
    turno:       4,
    herramienta: 'buscar_web',
    descripcion: 'Verificar actualizaciones del SDK Anthropic abril 2026',
    tokens_input_estimados: 2_400,
    tokens_output_estimados: 600,
  },
  {
    turno:       5,
    herramienta: 'analizar_repositorio',
    descripcion: 'Extraccion de stack tecnico del repositorio anfitrion',
    tokens_input_estimados: 4_500,
    tokens_output_estimados: 900,
  },
];

// Tokens del bloque estatico cacheado (CLAUDE.md + skills + tools)
// Este prefijo se repite en cada turno — es lo que cachea el sistema.
const TOKENS_BLOQUE_ESTATICO = 3_200;

// ---------------------------------------------------------------------------
// Simulacion del historial con ventana deslizante
// ---------------------------------------------------------------------------

function generarHistorialSimulado(numeroDeTurnos) {
  const historial = [];
  for (let i = 0; i < numeroDeTurnos; i++) {
    historial.push({ role: 'user',      content: `Mensaje usuario turno ${i + 1} — contenido tipico de 300 tokens aprox.` });
    historial.push({ role: 'assistant', content: `Respuesta asistente turno ${i + 1} — contenido tipico de 600 tokens aprox.` });
  }
  return historial;
}

// ---------------------------------------------------------------------------
// Calculo de costos por turno
// ---------------------------------------------------------------------------

/**
 * Estima tokens de una cadena de texto usando la heuristica determinista del bridge:
 * 1 token = 4 caracteres UTF-8. Metrica unica para toda la simulacion.
 * Razon: evitar mezcla con tokens_input_estimados (declarados en la tabla de escenarios)
 * que ya son tokens reales, no caracteres.
 */
function charsToTokens(chars) {
  return Math.ceil(chars / 4);
}

function calcularTurno(turnoData, historialPrevio) {
  const { herramienta, tokens_input_estimados, tokens_output_estimados } = turnoData;

  // Tokens del historial usando la misma heuristica que anthropic-bridge.js
  const tokensHistorial = estimarTokensMensajes(historialPrevio);
  // tokens_input_estimados ya es una cantidad de tokens (no chars) — se usa directamente
  const tokensContexto  = tokensHistorial + tokens_input_estimados;
  const { modelo, tier, razon } = route(herramienta, tokensContexto);

  // Sin optimizaciones: se paga el input completo cada vez
  const sinOptimizacion = estimarCosto(modelo, tokens_input_estimados, tokens_output_estimados, 0);

  // Con Model Router + Prompt Caching:
  // - Desde el turno 2 en adelante, el bloque estatico se sirve desde cache (10% del precio)
  const esCacheCalido   = turnoData.turno > 1;
  const tokensCacheHit  = esCacheCalido ? TOKENS_BLOQUE_ESTATICO : 0;
  const conOptimizacion = estimarCosto(modelo, tokens_input_estimados, tokens_output_estimados, tokensCacheHit);

  // Verificacion de fuga de tokens: el historial enviado no debe superar la ventana
  const historialVentana    = aplicarVentanaDeslizante(historialPrevio);
  const tokensFuga          = estimarTokensMensajes(historialPrevio);
  const tokensVentana       = estimarTokensMensajes(historialVentana);
  const turnosEnHistorial   = historialVentana.length;
  const hayFugaTokens       = historialPrevio.length > historialVentana.length;

  return {
    modelo,
    tier,
    razon,
    tokensCacheHit,
    esCacheCalido,
    costoSinOpt:   sinOptimizacion.costoUSD,
    costoConOpt:   conOptimizacion.costoUSD,
    ahorroPorTurno: parseFloat((sinOptimizacion.costoUSD - conOptimizacion.costoUSD).toFixed(6)),
    turnosEnHistorial,
    hayFugaTokens,
    tokensFugaEliminados: tokensFuga - tokensVentana,
  };
}

// ---------------------------------------------------------------------------
// Ejecucion y reporte
// ---------------------------------------------------------------------------

function ejecutarSimulacion() {
  const sep  = '-'.repeat(72);
  const sep2 = '='.repeat(72);

  console.log(sep2);
  console.log(' DRY-RUN: Simulacion de sesion 5 turnos — ModelRouter + Prompt Caching');
  console.log(` Presupuesto mensual de referencia: ${PRESUPUESTO_MENSUAL_USD} USD`);
  console.log(` Tokens bloque estatico cacheado (CLAUDE.md + skills): ${TOKENS_BLOQUE_ESTATICO}`);
  console.log(sep2);

  let totalSinOpt   = 0;
  let totalConOpt   = 0;
  let historialAcum = [];

  const resultados = [];

  for (const turnoData of TURNOS_SIMULADOS) {
    const res = calcularTurno(turnoData, [...historialAcum]);
    resultados.push({ turnoData, res });

    totalSinOpt += res.costoSinOpt;
    totalConOpt += res.costoConOpt;

    // Agregar turno al historial acumulado (para los siguientes turnos)
    historialAcum.push({ role: 'user',      content: turnoData.descripcion });
    historialAcum.push({ role: 'assistant', content: `[respuesta simulada turno ${turnoData.turno}]` });
  }

  // Imprimir tabla por turno
  console.log('\n DETALLE POR TURNO\n');
  for (const { turnoData, res } of resultados) {
    console.log(sep);
    console.log(` Turno ${turnoData.turno}: ${turnoData.descripcion}`);
    console.log(`   Herramienta  : ${turnoData.herramienta}`);
    console.log(`   Modelo       : ${res.modelo} [${res.tier.toUpperCase()}]`);
    console.log(`   Routing      : ${res.razon}`);
    console.log(`   Cache calido : ${res.esCacheCalido ? 'SI' : 'NO (primer turno — cache write)'}  (${res.tokensCacheHit} tokens cacheados)`);
    console.log(`   Historial    : ${res.turnosEnHistorial} mensajes en ventana (max 6 turnos = 12 mensajes)`);
    console.log(`   Fuga tokens  : ${res.hayFugaTokens ? `SI — ${res.tokensFugaEliminados} tokens eliminados` : 'NO'}`);
    console.log(`   Costo sin opt: $${res.costoSinOpt.toFixed(6)}`);
    console.log(`   Costo con opt: $${res.costoConOpt.toFixed(6)}`);
    console.log(`   Ahorro turno : $${res.ahorroPorTurno.toFixed(6)} (${res.costoSinOpt > 0 ? ((res.ahorroPorTurno / res.costoSinOpt) * 100).toFixed(1) : 0}%)`);
  }

  // Resumen financiero
  const ahorroTotal      = parseFloat((totalSinOpt - totalConOpt).toFixed(6));
  const pctAhorro        = totalSinOpt > 0 ? ((ahorroTotal / totalSinOpt) * 100).toFixed(1) : 0;
  const sesionsPorBudget = PRESUPUESTO_MENSUAL_USD / totalConOpt;
  const costoProyectado  = totalConOpt * 30 * 10; // 10 sesiones/dia * 30 dias

  console.log('\n' + sep2);
  console.log(' RESUMEN FINANCIERO');
  console.log(sep2);
  console.log(`  Costo sesion SIN optimizaciones : $${totalSinOpt.toFixed(6)}`);
  console.log(`  Costo sesion CON optimizaciones : $${totalConOpt.toFixed(6)}`);
  console.log(`  Ahorro por sesion               : $${ahorroTotal.toFixed(6)} (${pctAhorro}%)`);
  console.log(`  Sesiones en $${PRESUPUESTO_MENSUAL_USD}               : ${sesionsPorBudget.toFixed(0)} sesiones de 5 turnos`);
  console.log(`  Proyeccion mensual (10 ses/dia) : $${costoProyectado.toFixed(4)}`);
  console.log(`  Estado presupuesto             : ${costoProyectado <= PRESUPUESTO_MENSUAL_USD ? 'DENTRO DEL PRESUPUESTO' : 'EXCEDE PRESUPUESTO — revisar frecuencia'}`);

  console.log('\n DIAGNOSTICO DE FUGAS DE TOKENS\n');
  const turnosConFuga = resultados.filter(r => r.res.hayFugaTokens);
  if (turnosConFuga.length === 0) {
    console.log('  Sin fugas detectadas. La ventana deslizante funciona correctamente.');
  } else {
    for (const { turnoData, res } of turnosConFuga) {
      console.log(`  Turno ${turnoData.turno}: ${res.tokensFugaEliminados} tokens eliminados por ventana deslizante`);
    }
  }

  console.log('\n CONFIGURACION APLICADA\n');
  console.log(`  Ventana deslizante    : ${6} turnos maximo (12 mensajes)`);
  console.log(`  Prompt Caching        : cache_control: ephemeral en CLAUDE.md + skills`);
  console.log(`  Model Router          : Haiku→Sonnet→Opus segun herramienta y contexto`);
  console.log(`  Tier Haiku            : resumir_backlog, analizar_contenido`);
  console.log(`  Tier Sonnet           : analizar_archivo, analizar_repositorio, buscar_web`);
  console.log(`  Tier Opus             : refactorizar_arquitectura, disenar_sistema`);
  console.log(sep2 + '\n');
}

ejecutarSimulacion();
