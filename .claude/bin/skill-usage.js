#!/usr/bin/env node
'use strict';
/**
 * skill-usage.js — Registra cada invocacion del tool Skill en SKILL_USAGE.jsonl.
 *
 * Una linea JSON por invocacion: fecha, sesion y skill. Es la unica fuente de
 * datos para decidir que skills se fusionan o se recortan.
 * AI_CORE_SKILL_USAGE_PATH permite redirigir la salida en tests.
 */
const fs   = require('fs');
const path = require('path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const CORE_PATH  = path.resolve(__dirname, '../..');
const USAGE_PATH = process.env.AI_CORE_SKILL_USAGE_PATH || path.join(CORE_PATH, '.claude', 'SKILL_USAGE.jsonl');

function construirRegistro(evento) {
  const skill = evento.tool_input && evento.tool_input.skill;
  if (evento.tool_name !== 'Skill' || typeof skill !== 'string' || !skill) return null;
  return {
    ts: new Date().toISOString(),
    session: evento.session_id || process.env.CLAUDE_CODE_SESSION_ID || 'desconocida',
    skill,
  };
}

// En modo test solo se escribe si el test redirige la salida, para no ensuciar el log real
function debeEscribir() {
  return process.env.AI_CORE_TEST_MODE !== '1' || Boolean(process.env.AI_CORE_SKILL_USAGE_PATH);
}

function main() {
  const registro = construirRegistro(leerEventoDeStdin());
  if (!registro || !debeEscribir()) return;
  try {
    fs.appendFileSync(USAGE_PATH, JSON.stringify(registro) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(JSON.stringify({ level: 'error', hook: 'skill-usage', msg: err.message }) + '\n');
  }
}

if (require.main === module) main();

module.exports = { construirRegistro };
