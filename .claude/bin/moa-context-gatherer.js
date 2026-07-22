#!/usr/bin/env node
'use strict';
/**
 * moa-context-gatherer.js — Fan-out MoA antes de que Claude procese el prompt.
 *
 * Invoca ModelDispatcher.executeMoATask(userPrompt): Gemini (ContextGathering)
 * y DeepSeek (SyntaxDrafting) mapean el terreno en paralelo mientras Claude
 * (SurgicalEdit) espera el resultado combinado. Escribe .claude/moa_context.md
 * como estado efimero — el siguiente turno lo sobrescribe.
 *
 * Guard de disponibilidad: si falta GEMINI_API_KEY o DEEPSEEK_API_KEY, no se
 * invoca la red. Sin esto, cada turno de CADA sesion pagaria latencia de red
 * por un worker condenado a fallar en cualquier entorno sin ambas keys
 * configuradas — el caso mas comun hoy (DeepSeek no viene configurado por
 * defecto). El archivo efimero se borra en ese caso para no dejar un
 * artefacto obsoleto de un turno anterior.
 *
 * Ejecutado via hook UserPromptSubmit (categoria "intent" de process-guard.js),
 * junto a detect-role.js — mismo timeout de 8s del wrapper.
 */

const fs   = require('node:fs');
const path = require('node:path');

const { leerEventoDeStdin } = require('./lib/hook-stdin');

const REPO        = path.resolve(__dirname, '..', '..');
const MOA_CONTEXT  = path.join(REPO, '.claude', 'moa_context.md');

function loadEnv() {
  const envPath = path.join(REPO, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

function ambasKeysDisponibles() {
  return Boolean(process.env.GEMINI_API_KEY) && Boolean(process.env.DEEPSEEK_API_KEY);
}

async function main() {
  loadEnv();

  if (!ambasKeysDisponibles()) {
    try { fs.unlinkSync(MOA_CONTEXT); } catch { /* no habia archivo previo — nada que limpiar */ }
    return;
  }

  // CLAUDE_USER_PROMPT nunca existio como variable de entorno real -- el
  // prompt llega por JSON en stdin (prompt_text), confirmado contra
  // code.claude.com/docs/en/hooks.
  const userPrompt = process.env.CLAUDE_USER_PROMPT || leerEventoDeStdin().prompt_text || '';
  if (!userPrompt.trim()) return;

  const { executeMoATask } = require(path.join(REPO, 'scripts', 'services', 'ModelDispatcher.js'));

  try {
    const { resultado, fallos } = await executeMoATask(userPrompt);
    const encabezado = fallos.length > 0
      ? `<!-- MoA parcial — fallos: ${fallos.join(' | ')} -->\n`
      : '';
    fs.writeFileSync(MOA_CONTEXT, encabezado + resultado, 'utf8');
  } catch (err) {
    // executeMoATask nunca deberia rechazar (Promise.allSettled interno),
    // pero si el propio dispatcher lanza (ej. tipo de sub-tarea invalido),
    // no dejar un archivo efimero obsoleto de un turno anterior.
    try { fs.unlinkSync(MOA_CONTEXT); } catch { /* nada que limpiar */ }
    process.stderr.write(`[moa-context-gatherer] error inesperado: ${err.message}\n`);
  }
}

// require.main === module: solo ejecuta el flujo completo (con llamadas de
// red reales) cuando corre como script standalone. Al importarse desde un
// test, expone ambasKeysDisponibles() como unidad testeable en memoria sin
// pasar por loadEnv() ni por el proceso completo.
if (require.main === module) {
  main();
}

module.exports = { ambasKeysDisponibles };
