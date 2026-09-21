'use strict';
/**
 * hooks-definition.js — Fuente unica de verdad para la seccion "hooks" de
 * settings.json, usada tanto por setup-settings.js (ai-core standalone)
 * como por norm-harness.js (ai-core como submodulo en un proyecto anfitrion).
 *
 * Antes de este modulo, ambos scripts mantenian una copia paralela de la
 * misma definicion de hooks -- se desincronizaron: norm-harness.js quedo
 * sin subagent-guard.js, bash-verbosity-guard.js, memory-vault-prune-check.js
 * y sin cross-verify-gate.js/injection-guard.js en SubagentStop, porque cada
 * hook nuevo se agregaba solo en setup-settings.js.
 *
 * Uso: cada caller pasa su propia funcion bin(script) -> string citado con
 * la ruta absoluta correcta para su contexto (ai-core standalone o el
 * submodulo dentro del proyecto anfitrion).
 *
 * @param {(script: string) => string} bin - resuelve un nombre de script en
 *   .claude/bin/ a su ruta absoluta citada (ej. `"${path}"`).
 * @returns {object} seccion "hooks" completa para settings.json
 */
const { nodeConPermiso, buildPermissionProfiles } = require('./lib/hooks-permissions');
const { buildSessionHooks } = require('./lib/hooks-events-session');
const { buildPreToolUseHooks } = require('./lib/hooks-events-pre-tool-use');
const { buildPostToolUseHooks } = require('./lib/hooks-events-post-tool-use');

/**
 * @param {(script: string) => string} bin - ver cabecera del modulo.
 * @param {string} [tmpDirReal] - valor real de os.tmpdir(), resuelto por el
 *   caller (setup-settings.js/norm-harness.js) en el mismo proceso Node que
 *   luego ejecutara los guards -- evita depender de que un shell externo
 *   expanda "${TMPDIR:-/tmp}" con el mismo valor que ve Node internamente.
 *   Sin este argumento, cae al literal POSIX anterior (retrocompatible).
 */
function buildHooksSection(bin, tmpDirReal) {
  const ctx = { bin, nodeConPermiso, ...buildPermissionProfiles(bin, tmpDirReal) };
  const { PreToolUse } = buildPreToolUseHooks(ctx);
  const { PostToolUse } = buildPostToolUseHooks(ctx);
  return { ...buildSessionHooks(ctx), PreToolUse, PostToolUse };
}

module.exports = { buildHooksSection, nodeConPermiso };
