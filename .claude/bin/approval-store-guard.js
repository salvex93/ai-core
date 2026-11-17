#!/usr/bin/env node
'use strict';

/**
 * approval-store-guard.js — PreToolUse (Bash|Write|Edit|NotebookEdit).
 *
 * El almacen de locks (ai-core-locks/: aprobaciones de break-glass, contadores
 * de los guards) vive en el tmpdir, que otros guards eximen. Sin este guard el
 * agente podia escribir a mano un archivo de aprobacion y autoaprobar una
 * accion bloqueada sin pasar por el humano: la aprobacion real solo debe nacer
 * del prompt del usuario (hook UserPromptSubmit). Es una barrera de patrones,
 * no un sandbox: una ruta construida dinamicamente dentro de un script puede
 * eludirla. Para un uso legitimo, el operador usa el prefijo ! en el prompt.
 *
 * Exit 2 = bloquea. Sin break-glass: no se puede aprobar lo que protege la aprobacion.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { tokenizar } = require('./lib/comando-tokens');
const { normalizarTexto } = require('./lib/normalizar-texto');
const { enmascararComando } = require('./lib/enmascarar-comando');

const ALMACEN = /ai-core-locks|AI_CORE_BREAK_GLASS_DIR/i;
const HERRAMIENTAS_ARCHIVO = new Set(['Write', 'Edit', 'NotebookEdit', 'MultiEdit']);

function leerEvento() {
  let crudo = '';
  try { crudo = fs.readFileSync(0, 'utf8'); } catch (e) {
    process.stderr.write(`[APPROVAL-STORE-GUARD] no se pudo leer stdin (${e.message}); no se evalua.\n`);
    return {};
  }
  if (!crudo.trim()) return {};
  try {
    const evento = JSON.parse(crudo);
    return evento && typeof evento === 'object' ? evento : {};
  } catch (e) {
    process.stderr.write(`[APPROVAL-STORE-GUARD] entrada no es JSON valido (${e.message}); no se evalua.\n`);
    return {};
  }
}

// Rutas armadas sin escribir el literal: glob (ai-core-l*, ai-*), expansion (ai-core-$x, ai-core-{locks}),
// escape (ai-core-l\ocks) o concatenacion ('ai-core-'+'locks'). Una barrera de patrones, no un sandbox.
const AMBIGUO = /\bai-(?:core-?)?[\w-]*[*?\[{$\\]|\bai-core-['"]\s*\+/;
const BASES_TMP = ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders', os.tmpdir(), process.env.AI_CORE_BREAK_GLASS_DIR].filter(Boolean);

// El tokenizador resuelve las comillas: ai-core-'locks' queda como ai-core-locks
function comandoToca(comando) {
  const crudo = enmascararComando(comando);
  // normalizarTexto borra los * de los bordes: los patrones con glob se prueban tambien sobre el texto crudo
  const normalizado = normalizarTexto(crudo);
  const palabras = tokenizar(normalizado).filter((t) => t.tipo === 'palabra').map((t) => t.valor).join(' ');
  // ai-core y locks por separado cubre la variable: x=ai-core; ls /tmp/${x}-locks
  const separado = /\bai-core\b/.test(normalizado) && /\blocks\b/.test(normalizado);
  return ALMACEN.test(normalizado) || ALMACEN.test(palabras) || AMBIGUO.test(crudo) || AMBIGUO.test(normalizado) || separado;
}

// Un documento del proyecto llamado ai-core-locks.md no es el almacen: solo cuenta lo que cae bajo el tmpdir
function rutaToca(ruta) {
  const absoluta = path.resolve(ruta);
  if (AMBIGUO.test(absoluta)) return true;
  if (!ALMACEN.test(absoluta)) return false;
  return BASES_TMP.some((b) => absoluta === path.resolve(b) || absoluta.startsWith(path.resolve(b) + path.sep));
}

function tocaAlmacen(evento) {
  const entrada = evento.tool_input || {};
  if (evento.tool_name === 'Bash') return comandoToca(String(entrada.command || ''));
  if (!HERRAMIENTAS_ARCHIVO.has(evento.tool_name)) return false;
  return [entrada.file_path, entrada.notebook_path].filter(Boolean).some((r) => rutaToca(String(r)));
}

if (tocaAlmacen(leerEvento())) {
  process.stderr.write(
    '[APPROVAL-STORE-GUARD] BLOQUEADO: la accion toca el almacen de locks (ai-core-locks), que guarda las aprobaciones de break-glass y los contadores de los guards.\n' +
    'Un agente no puede escribir ahi: la aprobacion solo la otorga el humano con CONFIRMAR-<id> en su prompt.\n' +
    'Si es un uso legitimo, ejecutalo tu con el prefijo ! en el prompt (corre fuera del hook).\n'
  );
  process.exit(2);
}
process.exit(0);
