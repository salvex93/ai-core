'use strict';

/**
 * injection-quarantine-guard.js — Bloquea la siguiente accion real del
 * agente padre (Bash/Write/Edit) si injection-guard.js marco una cuarentena
 * de alta confianza en SubagentStop. Corre en PreToolUse.
 *
 * Este es el veto real que injection-guard.js no puede aplicar por si solo
 * (SubagentStop no puede impedir que su output ya generado se integre al
 * contexto del padre -- ver injection-guard.js). La cuarentena se limpia
 * respondiendo "CONFIRMAR-<id>" en el prompt del usuario (mismo mecanismo de
 * jailbreak-guard.js, que corre en UserPromptSubmit y consume el lock antes
 * de que este guard vuelva a evaluarlo).
 *
 * Deliberadamente NO tiene su propio bypass: la confirmacion solo puede
 * llegar via el prompt real del usuario (UserPromptSubmit), nunca desde un
 * tool_input de Bash/Write/Edit -- eso cerraria la puerta que se busca
 * proteger (contenido inyectado no puede "auto-confirmarse" via un comando).
 */

const { cuarentenasActivas } = require('./lib/injection-quarantine');

const activas = cuarentenasActivas();

if (activas.length === 0) process.exit(0);

process.stderr.write(
  `[INJECTION-QUARANTINE-GUARD] BLOQUEADO: ${activas.length} cuarentena(s) activa(s) por prompt injection de alta confianza detectado en output de subagente(s):\n`
);
for (const c of activas) {
  process.stderr.write(`  - id ${c.id} (subagente: ${c.subagentName}): ${c.hallazgos.join(', ')}\n`);
}
process.stderr.write(
  'Revisa el contenido fuente (archivo, web o resultado de Gemini) antes de continuar.\n' +
  'Si el hallazgo es una falsa alarma, confirma explicitamente en tu PROXIMO MENSAJE respondiendo: CONFIRMAR-<id>\n'
);
process.exit(2);
