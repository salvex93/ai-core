'use strict';

/**
 * secrets-guard.js — Detecta credenciales en el prompt del usuario antes de enviarlo.
 * Corre en hook UserPromptSubmit via $CLAUDE_USER_PROMPT. Solo advierte, no bloquea.
 * Inspirado en ECC before-submit-prompt.js hook.
 */

const prompt = process.env.CLAUDE_USER_PROMPT || '';
if (!prompt) process.exit(0);

const PATRONES = [
  { re: /sk-[A-Za-z0-9]{20,}/,             etiqueta: 'OpenAI API key' },
  { re: /ghp_[A-Za-z0-9]{36}/,             etiqueta: 'GitHub Personal Access Token' },
  { re: /AKIA[A-Z0-9]{16}/,                etiqueta: 'AWS Access Key ID' },
  { re: /xox[baprs]-[A-Za-z0-9\-]{10,}/,   etiqueta: 'Slack token' },
  { re: /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY/, etiqueta: 'Clave privada' },
  { re: /AIza[A-Za-z0-9_\-]{35}/,          etiqueta: 'Google API key' },
  { re: /[a-zA-Z0-9_-]{40}:[a-zA-Z0-9_-]{40}/, etiqueta: 'Posible par clave:secreto' },
];

const detectados = PATRONES.filter(({ re }) => re.test(prompt));
if (detectados.length === 0) process.exit(0);

process.stdout.write('\n[secrets-guard] AVISO: posible credencial detectada en el mensaje:\n');
detectados.forEach(({ etiqueta }) => {
  process.stdout.write(`  - ${etiqueta}\n`);
});
process.stdout.write('  Usar variables de entorno en lugar de pegar credenciales directamente.\n\n');
// Salir 0 — solo advierte, no bloquea el flujo
