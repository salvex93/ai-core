#!/usr/bin/env node
'use strict';
/**
 * skill-vault-write-guard.js — Compuerta de aprobacion humana para
 * escrituras del HILO PRINCIPAL a .claude/skills/** y .claude/memory-vault/**
 * (Gobierno de Agentes, hallazgo G9: "agent-snapshot respalda pero no pide
 * confirmacion" -- un backup silencioso no es lo mismo que una compuerta de
 * aprobacion previa).
 *
 * Alcance deliberado: solo el hilo principal (evento.agent_type ausente).
 * Un subagente autorizado (ej. aiops-auditor corrigiendo un SKILL.md que el
 * propio audit senalo) ya tiene su scope de rutas verificado por
 * agent-paths-guard.js via paths_allow: en su AGENT.md -- exigir tambien
 * break-glass ahi duplicaria control sobre el mismo riesgo y bloquearia un
 * flujo autonomo que CLAUDE.md ya considera legitimo (rol Auditor).
 *
 * Mismo mecanismo que code-exec-guard.js: id de un solo uso via
 * lib/break-glass.js, confirmable respondiendo "CONFIRMAR-<id>", valido
 * solo para el REINTENTO EXACTO del mismo file_path+content.
 *
 * Ejecutado via hook PreToolUse(Write|Edit) en settings.json.
 * Uso: node skill-vault-write-guard.js (recibe el evento PreToolUse por stdin)
 */

const path = require('node:path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');
const { solicitarBreakGlass, accionAprobada } = require('./lib/break-glass');

const GUARD_ID = 'skill-vault-write-guard';

const REPO_ROOT = process.env.AI_CORE_SKILL_VAULT_GUARD_REPO || path.resolve(__dirname, '..', '..');

const RUTAS_PROTEGIDAS = [
  /^\.claude\/skills\//,
  /^\.claude\/memory-vault\//,
];

function normalizarRuta(rutaCruda) {
  const absoluta = path.isAbsolute(rutaCruda) ? rutaCruda : path.resolve(REPO_ROOT, rutaCruda);
  return path.relative(REPO_ROOT, absoluta).split(path.sep).join('/');
}

const evento = leerEventoDeStdin();

// Solo el hilo principal -- un subagente ya declara y hace cumplir su scope
// via agent-paths-guard.js (paths_allow: en AGENT.md).
if (evento.agent_type) process.exit(0);

const filePath = evento.tool_input?.file_path || '';
if (!filePath) process.exit(0);

const rutaRelativa = normalizarRuta(filePath);
if (!RUTAS_PROTEGIDAS.some((re) => re.test(rutaRelativa))) process.exit(0);

const content = evento.tool_input?.content || evento.tool_input?.new_string || '';
const hashAccion = `${filePath}:${content}`;

if (accionAprobada(GUARD_ID, hashAccion)) process.exit(0);

const id = solicitarBreakGlass(GUARD_ID, hashAccion);
process.stderr.write(
  `[SKILL-VAULT-WRITE-GUARD] BLOQUEADO: escritura del hilo principal a "${rutaRelativa}" (dentro de .claude/skills/ o .claude/memory-vault/).\n` +
  'Motivo: CLAUDE.md exige compuerta de aprobacion humana antes de escribir contenido de skills o memoria persistente -- el backup de agent-snapshot.js es una red de recuperacion posterior, no una aprobacion previa.\n' +
  `Si es intencional, confirma explicitamente respondiendo unicamente: CONFIRMAR-${id}\n` +
  '(valido solo por 5 minutos y solo para reintentar esta misma escritura exacta -- no autoriza otra escritura futura a skills/vault).\n' +
  'Importante: confirmar NO reescribe el archivo por si solo -- despues de tu CONFIRMAR-<id>, hay que volver a pedir exactamente la misma escritura para que pase.\n'
);
process.exit(2);
