'use strict';

/**
 * jailbreak-guard.js — Deteccion tecnica de intentos de jailbreak/prompt
 * hacking en el prompt del usuario, antes de que llegue al modelo. Corre en
 * hook UserPromptSubmit.
 *
 * Gap que cierra: el "anti-jailbreak" declarado en CLAUDE.md hasta ahora era
 * prosa dentro de los .md de skills/agents -- bypasseable en teoria por un
 * usuario insistente porque ninguna instruccion en texto es un limite
 * tecnico real. Este guard es el limite tecnico: corre fuera del modelo,
 * en UserPromptSubmit (que SI puede bloquear con exit 2 antes de que el
 * prompt se procese -- a diferencia de SubagentStop, ver injection-guard.js).
 *
 * Bypass explicito de dos pasos (no un prefijo fijo adivinable): al
 * bloquear, se genera un id corto aleatorio y se persiste el hash del
 * prompt bloqueado bajo ese id con TTL corto. El bypass solo funciona si el
 * PROXIMO prompt es exactamente "CONFIRMAR-<id>" para ese id exacto -- un id
 * generado en el momento del bloqueo, no conocible de antemano, por lo que
 * contenido externo inyectado no puede incluirlo preventivamente. Vencido
 * el TTL o usado una vez, el id deja de ser valido.
 *
 * Mismo prefijo "CONFIRMAR-<id>" tambien limpia cuarentenas de
 * injection-quarantine-guard.js (PreToolUse) -- ese guard no tiene bypass
 * propio a proposito (un tool_input de Bash/Write/Edit no puede
 * "auto-confirmarse"), asi que este hook, que SI ve el prompt real del
 * usuario, es el unico lugar donde la confirmacion humana puede entrar.
 */

const fs   = require('node:fs');
const path = require('node:path');
const os   = require('node:os');
const crypto = require('node:crypto');
const { leerEventoDeStdin } = require('./lib/hook-stdin');
const { emitirReporte }     = require('./lib/guard-report');
const { confirmarCuarentena } = require('./lib/injection-quarantine');

const TTL_MS = 5 * 60 * 1000; // 5 min -- ventana corta, el bypass no debe quedar valido "para siempre"

// AI_CORE_JAILBREAK_BYPASS_DIR permite aislar en tests -- sin ella, vive en
// os.tmpdir() por sesion, mismo patron que subagent-guard.js.
const sessionId = process.env.CLAUDE_CODE_SESSION_ID || 'unknown';
const BYPASS_DIR = process.env.AI_CORE_JAILBREAK_BYPASS_DIR
  || path.join(os.tmpdir(), 'ai-core-locks', 'jailbreak-bypass');

const prompt = process.env.CLAUDE_USER_PROMPT || leerEventoDeStdin().prompt_text || '';
if (!prompt) process.exit(0);

function ensureDir() {
  try { fs.mkdirSync(BYPASS_DIR, { recursive: true }); } catch { /* ya existe */ }
}

function hashPrompt(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex');
}

/**
 * Confirma un bypass de ESTE guard: "CONFIRMAR-<id>" es valido solo si
 * existe un lock vigente (TTL no vencido) con ese id exacto. Un solo uso --
 * se borra al validarse, vuelve a bloquear si el mismo intento se repite
 * despues.
 */
function intentarBypassLocal(texto) {
  const match = texto.trim().match(/^CONFIRMAR-([a-f0-9]{8})$/i);
  if (!match) return false;

  ensureDir();
  const lockFile = path.join(BYPASS_DIR, `${match[1].toLowerCase()}.json`);
  let lock;
  try { lock = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch { return false; }

  try { fs.unlinkSync(lockFile); } catch { /* best-effort */ }

  return (Date.now() - lock.ts) <= TTL_MS;
}

/**
 * Intenta el bypass local (bloqueo de este mismo guard) y, si no aplica, el
 * de una cuarentena de injection-quarantine-guard.js -- mismo formato de id,
 * espacios de almacenamiento distintos.
 */
function intentarBypass(texto) {
  if (intentarBypassLocal(texto)) return true;

  const match = texto.trim().match(/^CONFIRMAR-([a-f0-9]{8})$/i);
  if (!match) return false;
  return confirmarCuarentena(match[1].toLowerCase());
}

if (intentarBypass(prompt)) {
  emitirReporte({ guard: 'jailbreak-guard', verdict: 'ok', severity: 'baja', hallazgos: ['bypass confirmado por humano'] });
  process.exit(0);
}

// Patrones tecnicos de jailbreak/prompt hacking dirigidos a romper reglas
// del propio arnes (CLAUDE.md, hooks, permisos) -- distinto de
// injection-guard.js (contenido externo en output de subagentes) y de
// secrets-guard.js (credenciales). Este guard cubre el prompt DIRECTO del
// usuario al modelo.
const PATRONES = [
  { re: /ignor[ae]\s+(todas\s+)?(las\s+)?(instrucciones|reglas)\s+(anteriores|previas|del\s+sistema)/i,
    etiqueta: 'intento de anular instrucciones/reglas previas (ES)' },
  { re: /ignore\s+(all\s+)?(previous|prior|system)\s+(instructions|rules|prompts?)/i,
    etiqueta: 'intento de anular instrucciones/reglas previas (EN)' },
  { re: /act[uú]a?s?\s+como\s+(DAN\b|un\s+modelo\s+sin\s+restricciones|un\s+AI\s+sin\s+filtros)/i,
    etiqueta: 'intento de roleplay de jailbreak conocido (DAN/sin restricciones)' },
  { re: /\b(DAN|developer\s+mode|modo\s+desarrollador)\b.*\b(activ|enable|habilit)/i,
    etiqueta: 'intento de activar "modo desarrollador"/DAN' },
  { re: /revela(r)?\s+(tu|el)\s+(system\s+prompt|prompt\s+de\s+sistema|claude\.md)|reveal\s+your\s+system\s+prompt/i,
    etiqueta: 'intento de extraccion del system prompt/CLAUDE.md' },
  { re: /(desactiva|deshabilita|salta|bypass|omite)\s+(los\s+)?(hooks?|guards?|reglas?|validaciones?|permisos?)/i,
    etiqueta: 'intento de desactivar hooks/guards/reglas del arnes' },
  { re: /finge\s+que\s+(no\s+hay|no\s+existen)\s+(reglas|restricciones|hooks)/i,
    etiqueta: 'intento de simular ausencia de reglas' },
  { re: /(esto\s+es\s+)?(solo\s+)?(un\s+)?(test|prueba|ejercicio)\s*,?\s*(ignora|olvida|descarta)\s+(tus\s+)?(reglas|instrucciones|restricciones)/i,
    etiqueta: 'intento de justificar bypass como "solo una prueba"' },
];

const hallazgos = PATRONES.filter(({ re }) => re.test(prompt));

if (hallazgos.length === 0) {
  emitirReporte({ guard: 'jailbreak-guard', verdict: 'ok', severity: 'baja' });
  process.exit(0);
}

ensureDir();
const id = crypto.randomBytes(4).toString('hex');
const lockFile = path.join(BYPASS_DIR, `${id}.json`);
try {
  fs.writeFileSync(lockFile, JSON.stringify({ ts: Date.now(), hash: hashPrompt(prompt) }), 'utf8');
} catch { /* si no se puede persistir, el bypass simplemente no estara disponible */ }

process.stderr.write(
  `[JAILBREAK-GUARD] BLOQUEADO: ${hallazgos.length} patron(es) de intento de jailbreak/prompt hacking detectado(s):\n` +
  hallazgos.map(h => `  - ${h.etiqueta}`).join('\n') + '\n' +
  'Si esto es una tarea legitima (ej. auditoria de seguridad, investigacion de jailbreaks), ' +
  `confirma explicitamente respondiendo unicamente: CONFIRMAR-${id}\n` +
  `(valido solo por ${TTL_MS / 60000} minutos y solo para este intento exacto).\n`
);
emitirReporte({ guard: 'jailbreak-guard', verdict: 'blocked', severity: 'critica', hallazgos: hallazgos.map(h => h.etiqueta) });
process.exit(2);
