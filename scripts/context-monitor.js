#!/usr/bin/env node
'use strict';

/**
 * context-monitor.js — Monitor de contexto para sesiones de Claude Code.
 *
 * Lee el JSONL de la sesion activa, estima tokens acumulados y emite
 * avisos estructurados cuando se acercan los umbrales de compresion.
 *
 * Invocado por el hook Stop en settings.json tras cada respuesta.
 * Variable de entorno requerida: CLAUDE_SESSION_ID (inyectada por Claude Code).
 *
 * Umbrales (modelo Sonnet 4.6 1M — ventana de 1.000.000 tokens, paridad Claude Pro web):
 *   AVISO_COMPACT : 200K tokens (20%) → sugerir /compact para liberar historial antiguo
 *   AVISO_CLEAR   : 600K tokens (60%) → sugerir /clear y nueva sesion
 *   CRITICO       : 850K tokens (85%) → advertencia fuerte, riesgo de truncado
 *
 * Estrategia de ahorro:
 *   - /compact a los 20%: Claude comprime el historial con un resumen y libera ~70% del espacio.
 *     Costo: ~500 tokens de output. Ahorro: hasta 130K tokens de historial eliminado.
 *   - /clear a los 60%: sesion limpia. Usar solo cuando el contexto de la tarea
 *     ya no es necesario (cambio de tema o feature completado).
 *   - No usar /clear prematuramente: la ventana de 1M existe para que puedas
 *     trabajar largas sesiones sin perder contexto critico.
 */

const fs   = require('fs');
const path = require('path');

const VENTANA_MAXIMA   = 1_000_000;
const UMBRAL_COMPACT   =   200_000;   // 20% — compact preventivo
const UMBRAL_CLEAR     =   600_000;   // 60% — considerar /clear
const UMBRAL_CRITICO   =   850_000;   // 85% — riesgo de truncado

// Heuristica: 1 token ≈ 4 caracteres para texto en inglés/español
const CHARS_POR_TOKEN = 4;

function proyectoActual() {
  const cwd = process.env.PWD || process.cwd();
  // Claude Code nombra el directorio del proyecto reemplazando separadores y ':' por '-'
  // Ejemplo: C:\Users\foo\bar → C--Users-foo-bar
  return cwd
    .replace(/\\/g, '/')            // normalizar a forward slash
    .replace(/^([A-Za-z]):/, '$1')  // quitar el ':' de la letra de unidad
    .replace(/\//g, '-')            // cada slash → guión
    .replace(/^-/, '');             // quitar guión inicial si lo hay
}

function rutaSesion(sessionId) {
  const home     = process.env.USERPROFILE || process.env.HOME || '';
  const proyecto = proyectoActual();
  return path.join(home, '.claude', 'projects', proyecto, `${sessionId}.jsonl`);
}

function extraerTexto(valor) {
  if (!valor) return '';
  if (typeof valor === 'string') return valor;
  if (Array.isArray(valor)) return valor.map(extraerTexto).join(' ');
  if (typeof valor === 'object') {
    // Bloques de contenido: { type: 'text', text: '...' } o { type: 'tool_result', content: '...' }
    return extraerTexto(valor.text || valor.content || '');
  }
  return '';
}

function contarTokensEnLinea(entrada) {
  try {
    const obj = JSON.parse(entrada);

    // Mensajes de usuario
    if (obj.type === 'user' && obj.message?.content) {
      return Math.ceil(extraerTexto(obj.message.content).length / CHARS_POR_TOKEN);
    }

    // Respuestas del asistente
    if (obj.message?.role === 'assistant' && obj.message?.content) {
      return Math.ceil(extraerTexto(obj.message.content).length / CHARS_POR_TOKEN);
    }
  } catch (_) { /* linea corrupta — ignorar */ }
  return 0;
}

function estimarTokensSesion(sessionId) {
  const ruta = rutaSesion(sessionId);
  if (!fs.existsSync(ruta)) return { tokens: 0, lineas: 0, ruta, encontrado: false };

  const lineas  = fs.readFileSync(ruta, 'utf8').split('\n').filter(Boolean);
  const tokens  = lineas.reduce((acc, l) => acc + contarTokensEnLinea(l), 0);
  return { tokens, lineas: lineas.length, ruta, encontrado: true };
}

function formatearNumero(n) {
  return n.toLocaleString('es-ES');
}

function porcentaje(actual, maximo) {
  return Math.min(100, Math.round((actual / maximo) * 100));
}

function barraProgreso(pct, ancho = 20) {
  const lleno  = Math.round((pct / 100) * ancho);
  const vacio  = ancho - lleno;
  return '[' + '#'.repeat(lleno) + '-'.repeat(vacio) + ']';
}

function main() {
  const sessionId = process.env.CLAUDE_SESSION_ID;

  if (!sessionId) {
    // Sin session ID no podemos hacer nada — salir silenciosamente
    process.exit(0);
  }

  const { tokens, lineas, encontrado } = estimarTokensSesion(sessionId);

  if (!encontrado) process.exit(0);

  const pct  = porcentaje(tokens, VENTANA_MAXIMA);
  const barra = barraProgreso(pct);

  // Sin umbral superado — silencio total para no contaminar respuestas normales
  if (tokens < UMBRAL_COMPACT) process.exit(0);

  let nivel, accion, detalle;

  if (tokens >= UMBRAL_CRITICO) {
    nivel  = 'CRITICO';
    accion = '/clear';
    detalle = 'Ventana al 85%+. Riesgo de truncado. Ejecuta /clear y abre nueva sesion para evitar perder contexto.';
  } else if (tokens >= UMBRAL_CLEAR) {
    nivel  = 'ALERTA';
    accion = '/clear';
    detalle = 'Ventana al 60%+. Si cambiaste de tarea o terminaste el feature, ejecuta /clear para sesion limpia.';
  } else {
    nivel  = 'AVISO';
    accion = '/compact';
    detalle = 'Ventana al 20%+. Ejecuta /compact: Claude comprime el historial y libera ~70% del espacio sin perder contexto.';
  }

  const separador = '─'.repeat(60);

  console.log('');
  console.log(separador);
  console.log(`[CONTEXT-MONITOR] ${nivel}`);
  console.log(`Tokens estimados : ${formatearNumero(tokens)} / ${formatearNumero(VENTANA_MAXIMA)}`);
  console.log(`Uso de ventana   : ${pct}% ${barra}`);
  console.log(`Turnos en sesion : ${lineas}`);
  console.log(`Accion sugerida  : ${accion}`);
  console.log(`Detalle          : ${detalle}`);
  console.log(separador);
  console.log('');
}

main();
