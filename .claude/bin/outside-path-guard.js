#!/usr/bin/env node
'use strict';
/**
 * outside-path-guard.js -- PreToolUse (matcher: Bash).
 *
 * Bloquea comandos que escriben o borran fuera de la raiz del proyecto
 * (redirecciones >, >>, tee, rm, mv, cp, dd of=, sed -i). El temporal del
 * sistema y /dev/null se permiten salvo que el proyecto viva dentro del
 * temporal. Break-glass: CONFIRMAR-<id>, valido para el reintento exacto.
 *
 * Uso: node outside-path-guard.js (evento PreToolUse por stdin)
 */

const { solicitarBreakGlass, accionAprobada } = require('./lib/break-glass');
const { normalizarTexto } = require('./lib/normalizar-texto');
const { enmascararComando } = require('./lib/enmascarar-comando');
const { destinosDeEscritura, estaFueraDelProyecto } = require('./lib/outside-path-rules');

const GUARD_ID = 'outside-path-guard';

function leerEvento() {
  if (process.stdin.isTTY) return {};
  try {
    const raw = require('node:fs').readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function bloquear(cmd, externos) {
  const { id } = solicitarBreakGlass(GUARD_ID, cmd);
  process.stderr.write(
    `[OUTSIDE-PATH-GUARD] BLOQUEADO (escritura o borrado fuera del proyecto): ${externos.join(', ')}\n` +
    'Motivo: el comando modifica rutas fuera de la raiz del proyecto.\n' +
    `Si es intencional, confirma respondiendo unicamente: CONFIRMAR-${id}\n` +
    '(valido 5 minutos, solo para reintentar este mismo comando).\n'
  );
  process.exit(2);
}

function main() {
  const evento = process.env.CLAUDE_TOOL_INPUT_command ? {} : leerEvento();
  const original = process.env.CLAUDE_TOOL_INPUT_command || evento.tool_input?.command || '';
  if (!original) process.exit(0);

  const raiz = process.env.AI_CORE_PROJECT_ROOT || evento.cwd || process.cwd();
  const cmd = normalizarTexto(enmascararComando(original));
  const externos = destinosDeEscritura(cmd).filter(d => estaFueraDelProyecto(d, raiz));
  if (externos.length === 0) process.exit(0);
  if (accionAprobada(GUARD_ID, cmd)) process.exit(0);
  bloquear(cmd, externos);
}

main();
