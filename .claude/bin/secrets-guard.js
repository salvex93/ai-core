'use strict';

/**
 * secrets-guard.js — Detecta credenciales en el prompt del usuario antes de enviarlo.
 * Corre en hook UserPromptSubmit.
 *
 * El prompt llega por JSON en stdin (campo prompt_text) -- CLAUDE_USER_PROMPT
 * nunca existio como variable de entorno real (confirmado contra
 * code.claude.com/docs/en/hooks: UserPromptSubmit expone prompt_text via
 * stdin, no env var). Bug real: este guard nunca vio el prompt real en
 * produccion, `prompt` siempre era '' y el guard quedaba inerte pese a que
 * el bloqueo (exit 2) si funciona para UserPromptSubmit cuando recibe datos.
 *
 * Los patrones de ALTA_CONFIANZA tienen formato inequivoco de credencial real
 * (sin lectura plausible como texto/codigo de ejemplo) y bloquean. El resto
 * (confianza media, riesgo de falso positivo mayor) solo advierte.
 *
 * Bloqueo con excepcion auditable (break-glass): a diferencia de los guards
 * de PreToolUse, aqui no hay una "tool call" que reintentar -- el reintento
 * real es que el usuario reenvie el MISMO prompt exacto en su siguiente
 * mensaje. Confirmar el id via CONFIRMAR-<id> autoriza unicamente ese
 * reenvio exacto (mismo texto), no cualquier prompt futuro con otra
 * credencial.
 */

const { leerEventoDeStdin } = require('./lib/hook-stdin');
const { emitirReporte }     = require('./lib/guard-report');
const { solicitarBreakGlass, accionAprobada } = require('./lib/break-glass');
const { normalizarTexto } = require('./lib/normalizar-texto');
const { ALTA_CONFIANZA } = require('./lib/patrones-secretos');

const GUARD_ID = 'secrets-guard';

const promptOriginal = process.env.CLAUDE_USER_PROMPT || leerEventoDeStdin().prompt_text || '';
if (!promptOriginal) process.exit(0);

// Normalizacion Unicode antes de matchear (hallazgo red-team 2026-08-15):
// zero-width space/homoglifos dentro del prefijo de una credencial real
// (ej. "sk-" con un caracter invisible insertado) rompian el matching sin
// alterar la credencial en si -- el secreto seguia siendo exfiltrable tal
// cual, solo el prefijo quedaba disfrazado. El prompt se usa normalizado
// SOLO para el matching; el reporte al usuario sigue mostrando el original.
const prompt = normalizarTexto(promptOriginal);

// Bloquean (exit 2): formato inequivoco, imposible de confundir con codigo
// de ejemplo o placeholder generico. Prefijo con flag /i (hallazgo
// red-team: "Sk-..." con mayuscula en el prefijo evadia el match) --
// el cuerpo de la credencial real de cada proveedor SI es case-sensitive
// por diseño (un token real nunca cambia su propio case), pero el
// PREFIJO puede escribirse deliberadamente en otro case para evadir sin
// alterar el secreto real que sigue -- normalizar solo el prefijo detecta
// ese intento sin ampliar el patron a texto que no es una credencial real.
// Solo advierten (exit 0): patron generico, riesgo real de falso positivo
// (ej. dos hashes o tokens de ejemplo en documentacion no son necesariamente
// un secreto real).
const CONFIANZA_MEDIA = [
  { re: /[a-zA-Z0-9_-]{40}:[a-zA-Z0-9_-]{40}/, etiqueta: 'Posible par clave:secreto' },
];

const bloqueantes = ALTA_CONFIANZA.filter(({ re }) => re.test(prompt));
const advertencias = CONFIANZA_MEDIA.filter(({ re }) => re.test(prompt));

if (bloqueantes.length > 0) {
  // El hash de break-glass usa promptOriginal (no el normalizado): el
  // reintento exacto que el usuario reenvia es el texto original con sus
  // caracteres tal cual, no la version normalizada usada solo para deteccion.
  if (accionAprobada(GUARD_ID, promptOriginal)) {
    emitirReporte({ guard: 'secrets-guard', verdict: 'ok', severity: 'baja', hallazgos: ['bypass confirmado por humano'] });
    process.exit(0);
  }

  const id = solicitarBreakGlass(GUARD_ID, promptOriginal);
  process.stderr.write('[secrets-guard] BLOQUEADO: credencial de alta confianza detectada en el mensaje:\n');
  bloqueantes.forEach(({ etiqueta }) => process.stderr.write(`  - ${etiqueta}\n`));
  process.stderr.write(
    'Usar variables de entorno en lugar de pegar credenciales directamente. Reescribe el mensaje sin la credencial, ' +
    `o si es intencional confirma explicitamente respondiendo unicamente: CONFIRMAR-${id}\n` +
    '(valido solo por 5 minutos y solo para reenviar este mismo mensaje exacto).\n'
  );
  emitirReporte({ guard: 'secrets-guard', verdict: 'blocked', severity: 'critica', hallazgos: bloqueantes.map(b => b.etiqueta) });
  process.exit(2);
}

if (advertencias.length === 0) {
  emitirReporte({ guard: 'secrets-guard', verdict: 'ok', severity: 'baja' });
  process.exit(0);
}

process.stdout.write('\n[secrets-guard] AVISO: posible credencial detectada en el mensaje:\n');
advertencias.forEach(({ etiqueta }) => {
  process.stdout.write(`  - ${etiqueta}\n`);
});
process.stdout.write('  Usar variables de entorno en lugar de pegar credenciales directamente.\n\n');
// Confianza media — solo advierte, no bloquea el flujo
emitirReporte({ guard: 'secrets-guard', verdict: 'warn', severity: 'media', hallazgos: advertencias.map(a => a.etiqueta) });
