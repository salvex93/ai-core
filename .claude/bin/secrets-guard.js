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

const GUARD_ID = 'secrets-guard';

const prompt = process.env.CLAUDE_USER_PROMPT || leerEventoDeStdin().prompt_text || '';
if (!prompt) process.exit(0);

// Bloquean (exit 2): formato inequivoco, imposible de confundir con codigo
// de ejemplo o placeholder generico.
const ALTA_CONFIANZA = [
  { re: /sk-[A-Za-z0-9]{20,}/,             etiqueta: 'OpenAI API key' },
  { re: /ghp_[A-Za-z0-9]{36}/,             etiqueta: 'GitHub Personal Access Token' },
  { re: /AKIA[A-Z0-9]{16}/,                etiqueta: 'AWS Access Key ID' },
  { re: /xox[baprs]-[A-Za-z0-9\-]{10,}/,   etiqueta: 'Slack token' },
  { re: /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY/, etiqueta: 'Clave privada' },
  { re: /AIza[A-Za-z0-9_\-]{35}/,          etiqueta: 'Google API key' },
];

// Solo advierten (exit 0): patron generico, riesgo real de falso positivo
// (ej. dos hashes o tokens de ejemplo en documentacion no son necesariamente
// un secreto real).
const CONFIANZA_MEDIA = [
  { re: /[a-zA-Z0-9_-]{40}:[a-zA-Z0-9_-]{40}/, etiqueta: 'Posible par clave:secreto' },
];

const bloqueantes = ALTA_CONFIANZA.filter(({ re }) => re.test(prompt));
const advertencias = CONFIANZA_MEDIA.filter(({ re }) => re.test(prompt));

if (bloqueantes.length > 0) {
  if (accionAprobada(GUARD_ID, prompt)) {
    emitirReporte({ guard: 'secrets-guard', verdict: 'ok', severity: 'baja', hallazgos: ['bypass confirmado por humano'] });
    process.exit(0);
  }

  const id = solicitarBreakGlass(GUARD_ID, prompt);
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
