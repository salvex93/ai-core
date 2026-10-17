#!/usr/bin/env node
'use strict';
/**
 * egress-guard.js -- PreToolUse (matcher: Bash).
 *
 * Bloquea salida de red hacia hosts fuera de la allowlist (curl, wget, nc,
 * scp, /dev/tcp e interpretes con API de red) y cualquier comando que combine
 * red con archivos de secretos (.env, claves, credenciales), incluso hacia un
 * host permitido. Es capa blanda: el aislamiento real de red es el sandbox del
 * sistema operativo. Allowlist extra: AI_CORE_EGRESS_ALLOWLIST (lista con comas
 * y comodines *.dominio). Break-glass: CONFIRMAR-<id>, valido para el reintento exacto.
 *
 * Uso: node egress-guard.js (evento PreToolUse por stdin)
 */

const { solicitarBreakGlass, accionAprobada } = require('./lib/break-glass');
const { normalizarTexto } = require('./lib/normalizar-texto');
const { enmascararComando } = require('./lib/enmascarar-comando');
const { analizarEgreso } = require('./lib/egress-rules');

const GUARD_ID = 'egress-guard';

function leerEvento() {
  if (process.stdin.isTTY) return {};
  try {
    const raw = require('node:fs').readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function describirMotivo({ noPermitidos, secretos }) {
  if (secretos) return 'el comando combina salida de red con archivos de secretos (.env, claves, credenciales)';
  return `salida de red hacia destinos fuera de la allowlist: ${noPermitidos.join(', ')}`;
}

function bloquear(cmd, analisis) {
  const { id } = solicitarBreakGlass(GUARD_ID, cmd);
  process.stderr.write(
    `[EGRESS-GUARD] BLOQUEADO: ${describirMotivo(analisis)}\n` +
    'Motivo: la salida de red no verificada puede exfiltrar datos del proyecto.\n' +
    `Si es intencional, confirma respondiendo unicamente: CONFIRMAR-${id}\n` +
    '(valido 5 minutos, solo para reintentar este mismo comando).\n'
  );
  process.exit(2);
}

function main() {
  const evento = process.env.CLAUDE_TOOL_INPUT_command ? {} : leerEvento();
  const original = process.env.CLAUDE_TOOL_INPUT_command || evento.tool_input?.command || '';
  if (!original) process.exit(0);

  const cmd = normalizarTexto(enmascararComando(original));
  const analisis = analizarEgreso(cmd);
  if (analisis.noPermitidos.length === 0 && !analisis.secretos) process.exit(0);
  if (accionAprobada(GUARD_ID, cmd)) process.exit(0);
  bloquear(cmd, analisis);
}

main();
