#!/usr/bin/env node
'use strict';
/**
 * skill-content-scanner.js — Escaner estatico de contenido de skills/agents
 * al instalarse o modificarse (Gobierno de Agentes, hallazgo G8: "sin
 * escaner de contenido de skills" -- paridad con Hermes Skills Guard segun
 * investigacion de mercado, docs/AUDITORIA-GOBIERNO-2026-09.md).
 *
 * Alcance deliberado: complementa, no reemplaza, skill-vault-write-guard.js
 * (G9). G9 exige aprobacion humana ANTES de escribir en .claude/skills/** o
 * .claude/memory-vault/** -- una compuerta sobre QUIEN escribe. Este guard
 * analiza QUE se escribio: un SKILL.md o AGENT.md es texto en lenguaje
 * natural que Claude carga como contexto de comportamiento en sesiones
 * futuras -- un patron de prompt injection, exfiltracion o instruccion
 * destructiva incrustado ahi es mas peligroso que en codigo fuente, porque
 * el propio harness lo trata como instruccion legitima al cargarlo.
 *
 * Corre en PostToolUse(Write|Edit): el archivo ya se escribio, así que solo
 * puede advertir (exit 0 siempre), igual que injection-guard.js en
 * SubagentStop -- no existe un evento anterior a la escritura que permita
 * inspeccionar el contenido final antes de que exista en disco. Reutiliza
 * los mismos patrones de alta confianza que injection-guard.js (contenido
 * externo no confiable) mas un grupo propio de comandos destructivos
 * incrustados en prosa, no cubierto ahi porque ese guard mira output de
 * subagente, no contenido de skill.
 *
 * Uso: node skill-content-scanner.js (recibe el evento PostToolUse por stdin)
 */

const fs   = require('node:fs');
const path = require('node:path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');
const { emitirReporte }     = require('./lib/guard-report');
const { normalizarTexto }   = require('./lib/normalizar-texto');

const REPO_ROOT = process.env.AI_CORE_SKILL_CONTENT_SCANNER_REPO || path.resolve(__dirname, '..', '..');

const RUTAS_ESCANEADAS = [
  /^\.claude\/skills\//,
  /^\.claude\/agents\//,
];

// Mismo grupo de alta confianza que injection-guard.js (contenido externo
// no confiable que intenta hacerse pasar por instruccion nueva), mas un
// grupo propio de comandos destructivos citados en prosa dentro del skill.
const PATRONES = [
  { re: /ignor[ae]\s+(todas\s+)?(las\s+)?instrucciones\s+(anteriores|previas)/i,
    etiqueta: 'intento de anular instrucciones previas' },
  { re: /ignore\s+(all\s+)?previous\s+instructions/i,
    etiqueta: 'intento de anular instrucciones previas (EN)' },
  { re: /\[?(nuevo\s+system\s+prompt|new\s+system\s+prompt)\]?/i,
    etiqueta: 'intento de inyectar un system prompt nuevo' },
  { re: /revela(r)?\s+(tu|el)\s+system\s+prompt|reveal\s+your\s+system\s+prompt/i,
    etiqueta: 'intento de extraccion de system prompt' },
  { re: /env[ií]a\s+(este|el)\s+contenido\s+a\s+https?:\/\//i,
    etiqueta: 'instruccion de exfiltracion de datos hacia URL externa' },
  { re: /(borra|elimina|delete)\s+(todos\s+los\s+)?(archivos|files)\s+(sin\s+confirmar|without\s+confirmation)/i,
    etiqueta: 'instruccion de accion destructiva sin confirmacion' },
  { re: /`?rm\s+-rf\s+\/[^`\s]*`?\s+sin\s+confirmar/i,
    etiqueta: 'comando destructivo (rm -rf) incrustado sin confirmacion' },
  { re: /`?git\s+push\s+--force[^`\n]*`?\s+sin\s+confirmar/i,
    etiqueta: 'comando destructivo (git push --force) incrustado sin confirmacion' },
];

const evento = leerEventoDeStdin();
const filePath = evento.tool_input?.file_path || '';
if (!filePath) process.exit(0);

const absoluta = path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
const rutaRelativa = path.relative(REPO_ROOT, absoluta).split(path.sep).join('/');
if (!RUTAS_ESCANEADAS.some((re) => re.test(rutaRelativa))) process.exit(0);

// El evento de Write trae tool_input.content; Edit trae new_string (parche
// parcial, no el archivo completo) -- en ambos casos preferimos el archivo
// ya escrito en disco si existe, es la fuente de verdad post-escritura.
let contenido = '';
if (fs.existsSync(absoluta)) {
  contenido = fs.readFileSync(absoluta, 'utf8');
} else {
  contenido = evento.tool_input?.content || evento.tool_input?.new_string || '';
}
if (!contenido) process.exit(0);

const contenidoNormalizado = normalizarTexto(contenido);
const hallazgos = PATRONES.filter(({ re }) => re.test(contenidoNormalizado));

if (hallazgos.length === 0) {
  emitirReporte({ guard: 'skill-content-scanner', verdict: 'ok', severity: 'baja' });
  process.exit(0);
}

console.log(`[skill-content-scanner] ${rutaRelativa} — ${hallazgos.length} patron(es) sospechoso(s):`);
for (const { etiqueta } of hallazgos) {
  console.log(`  [ALERTA] ${etiqueta}`);
}
console.log('[skill-content-scanner] revisar el contenido antes de que este skill/agente se cargue en una sesion futura.');

emitirReporte({ guard: 'skill-content-scanner', verdict: 'warn', severity: 'alta', hallazgos: hallazgos.map((h) => h.etiqueta) });

// Exit 0 siempre -- PostToolUse no puede revertir una escritura ya hecha
// (ver nota de cabecera). skill-vault-write-guard.js (PreToolUse) ya exige
// aprobacion humana previa; este guard solo advierte sobre el contenido.
process.exit(0);
