#!/usr/bin/env node
'use strict';
/**
 * subagent-budget-guard.js — Capa 1 de defensa contra runaway de subagentes:
 * techo fijo de llamadas a tools por subagente, independiente de semantica.
 *
 * Investigacion 2026-09-02 (post-mortem real, vectara/awesome-agent-failures:
 * pipeline de 4 agentes en loop no detectado 264 horas, $47k gastados, solo
 * descubierto por el dashboard de billing). Recomendacion explicita del
 * propio post-mortem: "Per-agent and per-pipeline budget caps are
 * non-negotiable" -- techo fijado ANTES de iniciar, reactivo a CONTEO de
 * llamadas, no a facturacion (que llega demasiado tarde).
 *
 * Complementa, sin sustituir:
 *   - tool-repeat-guard.js: misma tool + argumentos IDENTICOS repetidos.
 *   - loop-alternante-guard.js: 2 tools distintas alternando sin converger
 *     (argumentos DISTINTOS cada vez, patron mas dificil de detectar).
 *   - subagent-guard.js: paralelismo y recursion de spawn.
 * Esta capa es la red de seguridad final: si TODO lo demas falla en
 * detectar semantica, ningun subagente supera el techo de llamadas sin que
 * quede evidencia. Cero falsos positivos contra trabajo legitimo lento --
 * no mira contenido, solo cuenta.
 *
 * Solo aplica a subagentes (evento.agent_type presente) -- el hilo
 * principal nunca se cuenta, es responsabilidad directa del operador.
 *
 * Uso: node subagent-budget-guard.js (recibe el evento PreToolUse por stdin)
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const MAX_LLAMADAS_POR_SUBAGENTE = 40; // validado por el usuario 2026-09-02, generoso para trabajo legitimo
const TTL_MS = 30 * 60 * 1000; // ventana de "misma tarea de subagente en curso"

const STATE_DIR = process.env.AI_CORE_BUDGET_DIR
  || path.join(require('os').tmpdir(), 'ai-core-locks', 'subagent-budget');

const evento = leerEventoDeStdin();
const toolName = evento.tool_name || '';
const agentType = evento.agent_type || '';

// Sin agent_type, la llamada viene del hilo principal -- no se cuenta.
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

let estado = { count: 0, ts: Date.now() };
try {
  const previo = JSON.parse(fs.readFileSync(archivoEstado, 'utf8'));
  if ((Date.now() - previo.ts) <= TTL_MS) {
    estado = previo;
  }
} catch { /* sin estado previo o vencido, arranca en 0 */ }

estado.count += 1;
estado.ts = Date.now();

if (estado.count > MAX_LLAMADAS_POR_SUBAGENTE) {
  process.stderr.write(
    `[SUBAGENT-BUDGET-GUARD] BLOQUEADO: el subagente "${agentType}" (sesion ${sessionId}) supero el presupuesto de ` +
    `${MAX_LLAMADAS_POR_SUBAGENTE} llamadas a herramientas -- posible runaway (patron real documentado: pipeline en ` +
    `loop 264h, $47k gastados, solo detectado por billing). Revisar el trabajo del subagente antes de continuar.\n`
  );
  process.exit(2);
}

try {
  fs.writeFileSync(archivoEstado, JSON.stringify(estado), 'utf8');
} catch { /* no bloquear la tool call si el estado no se pudo escribir */ }

process.exit(0);
