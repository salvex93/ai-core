#!/usr/bin/env node
'use strict';
/**
 * loop-alternante-guard.js — Capa 2 de defensa contra runaway de subagentes:
 * detecta el patron A-B-A-B-A-B entre 2 tools distintas alternando sin
 * converger, AUNQUE los argumentos sean distintos en cada vuelta.
 *
 * Gap real que tool-repeat-guard.js no cubre: ese guard solo bloquea la
 * MISMA tool con argumentos IDENTICOS repetidos -- un loop real entre dos
 * agentes/turnos con argumentos DISTINTOS cada vez (ej. "leer archivo X" /
 * "corregir archivo X" alternando indefinidamente sin cerrar la tarea)
 * pasa desapercibido.
 *
 * Investigacion 2026-09-02 (docs.openhands.dev/sdk/guides/agent-stuck-detector):
 * OpenHands StuckDetector usa exactamente este patron en produccion --
 * compara firma de "tool_name" (ignora argumentos exactos, solo mira si
 * alternan 2 tools distintas) sobre una ventana de eventos, sin embeddings
 * ni LLM-as-judge (el propio paper de semantic early-stopping, arXiv
 * 2606.27009, confirma que anadir un juez por ronda es CONTRAPRODUCENTE en
 * costo). Umbral validado en produccion: 6+ ciclos alternantes.
 *
 * Comportamiento de 2 pasos validado por el usuario (2026-09-02): la
 * PRIMERA deteccion solo ADVIERTE (exit 0, log visible) -- da oportunidad
 * de auto-correccion. Si el mismo patron persiste en una SEGUNDA ventana
 * completa despues de la advertencia, BLOQUEA (exit 2).
 *
 * Uso: node loop-alternante-guard.js (recibe el evento PreToolUse por stdin)
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const VENTANA = 12;       // 6 ciclos A-B (validado por OpenHands StuckDetector)
const CICLOS_MINIMOS = 6;
const TTL_MS = 30 * 60 * 1000;

const STATE_DIR = process.env.AI_CORE_ALTERNANTE_DIR
  || path.join(require('os').tmpdir(), 'ai-core-locks', 'loop-alternante');

const evento = leerEventoDeStdin();
const toolName = evento.tool_name || '';
const agentType = evento.agent_type || '';

if (!toolName || !agentType) {
  process.exit(0);
}

const sessionId = evento.session_id || 'sin-sesion';

function ensureDir() {
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); } catch { /* ya existe */ }
}

const clave = `${sessionId}__${agentType}`;
const archivoEstado = path.join(STATE_DIR, `${crypto.createHash('sha256').update(clave).digest('hex')}.json`);

ensureDir();

let estado = { historial: [], advertido: false, ts: Date.now() };
try {
  const previo = JSON.parse(fs.readFileSync(archivoEstado, 'utf8'));
  if ((Date.now() - previo.ts) <= TTL_MS) {
    estado = previo;
  }
} catch { /* sin estado previo o vencido, arranca vacio */ }

estado.historial.push(toolName);
estado.ts = Date.now();

// Solo se evalua cuando el historial alcanza exactamente el tamano de
// ventana -- evita re-evaluar en cada llamada intermedia y hace el umbral
// de "persiste" (segunda ventana completa) natural: cada VENTANA llamadas
// es una oportunidad de deteccion, no una ventana deslizante continua.
function esPatronAlternante(historial) {
  if (historial.length < VENTANA) return false;
  const ultimos = historial.slice(-VENTANA);
  const [a, b] = ultimos;
  if (a === b) return false; // no es alternante si ambas posiciones son la misma tool
  let ciclos = 0;
  for (let i = 0; i < ultimos.length; i++) {
    const esperado = i % 2 === 0 ? a : b;
    if (ultimos[i] !== esperado) return false;
    if (i % 2 === 1) ciclos++;
  }
  return ciclos >= CICLOS_MINIMOS;
}

if (estado.historial.length >= VENTANA && estado.historial.length % VENTANA === 0) {
  const detectado = esPatronAlternante(estado.historial);

  if (detectado && estado.advertido) {
    process.stderr.write(
      `[LOOP-ALTERNANTE-GUARD] BLOQUEADO: el subagente "${agentType}" (sesion ${sessionId}) sigue alternando entre ` +
      `2 herramientas sin converger tras la advertencia anterior -- patron real documentado (OpenHands StuckDetector, ` +
      `caso vectara/awesome-agent-failures de $47k). Revisar si la tarea esta realmente progresando antes de continuar.\n`
    );
    process.exit(2);
  }

  if (detectado && !estado.advertido) {
    console.log(
      `[LOOP-ALTERNANTE-GUARD] ADVERTENCIA: el subagente "${agentType}" (sesion ${sessionId}) alterno entre 2 ` +
      `herramientas ${CICLOS_MINIMOS}+ veces seguidas sin variar el patron -- posible falta de progreso real, ` +
      `aunque los argumentos difieran en cada llamada. Si esto es intencional (refinamiento legitimo), continua; ` +
      `si persiste, la proxima ventana bloqueara.`
    );
    estado.advertido = true;
  }

  if (!detectado) {
    estado.advertido = false;
  }

  estado.historial = []; // arranca ventana nueva tras evaluar
}

try {
  fs.writeFileSync(archivoEstado, JSON.stringify(estado), 'utf8');
} catch { /* no bloquear la tool call si el estado no se pudo escribir */ }

process.exit(0);
