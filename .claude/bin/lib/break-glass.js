'use strict';

/**
 * break-glass.js — Mecanismo transversal de excepcion auditable para guards
 * de PreToolUse, generalizado a partir del patron ya probado en
 * jailbreak-guard.js/injection-quarantine.js (id de un solo uso, no
 * adivinable, TTL corto, confirmacion solo via UserPromptSubmit real).
 *
 * Antes de este modulo, cada guard que queria pedir "confirmacion humana"
 * lo hacia en prosa dentro de su propio stderr sin ningun enforcement tecnico
 * (mutating-action-guard.js, destructive-op-guard.js parcialmente) -- el
 * reintento del mismo comando literal volvia a bloquear identico, porque
 * ningun codigo verificaba que la confirmacion realmente ocurrio.
 *
 * A diferencia de injection-quarantine-guard.js (que deliberadamente NO
 * tiene bypass propio, porque el contenido que cuarentena es potencialmente
 * inyectado), este mecanismo SI esta pensado para que un guard emita su
 * propio id y lo resuelva por si mismo dentro del mismo PreToolUse -- el
 * guard candidato es codigo de gobierno propio (comandos del operador
 * humano), no contenido externo no confiable.
 *
 * Cada uso exitoso queda registrado en BREAK_GLASS_LOG.jsonl (append-only,
 * fuera de tmpdir para que sobreviva mas alla de la sesion) -- sin este
 * registro, un "break-glass" no es distinto de un bypass silencioso.
 */

const fs     = require('node:fs');
const path   = require('node:path');
const os     = require('node:os');
const crypto = require('node:crypto');

const { normalizarTexto } = require('./normalizar-texto');

const TTL_MS = 5 * 60 * 1000; // 5 min -- mismo TTL que jailbreak-guard.js

const LOCKS_DIR = process.env.AI_CORE_BREAK_GLASS_DIR
  || path.join(os.tmpdir(), 'ai-core-locks', 'break-glass');

// Aprobaciones ya confirmadas, pendientes de que el guard original detecte
// el reintento exacto -- separado de LOCKS_DIR (solicitudes sin confirmar
// todavia) para que un id vencido/consumido no se confunda con una
// aprobacion ya otorgada.
const APROBACIONES_DIR = path.join(LOCKS_DIR, 'aprobadas');

// issue #256: la clave se calcula sobre el contexto NORMALIZADO (mismo
// pipeline que jailbreak-guard.js -- colapso de espacios, invisibles,
// homoglifos), no el string crudo. Sin esto, cualquier diferencia trivial
// entre el comando bloqueado y el reintento (espacios, reconstruccion del
// shell entre turnos) invalida el hash silenciosamente y el break-glass
// nunca reconoce una confirmacion ya otorgada.
function claveAprobacion(guardId, contexto) {
  return crypto.createHash('sha256').update(`${guardId}:${normalizarTexto(contexto)}`).digest('hex');
}

// Fuera de tmpdir a proposito -- el registro de auditoria debe sobrevivir al
// reinicio de la maquina/sesion, a diferencia de los locks temporales.
const LOG_PATH = process.env.AI_CORE_BREAK_GLASS_LOG
  || path.join(process.cwd(), '.claude', 'BREAK_GLASS_LOG.jsonl');

function ensureDir() {
  try { fs.mkdirSync(LOCKS_DIR, { recursive: true }); } catch { /* ya existe */ }
}

/**
 * Registra un intento de accion bloqueada y devuelve el id de un solo uso
 * que el humano debe confirmar respondiendo "CONFIRMAR-<id>".
 * @param {string} guardId - nombre del guard que solicita la excepcion
 * @param {string} contexto - el comando/tool_input bloqueado, para el registro
 * @returns {string} id de 8 hex chars
 */
function solicitarBreakGlass(guardId, contexto) {
  ensureDir();
  const id = crypto.randomBytes(4).toString('hex');
  const archivo = path.join(LOCKS_DIR, `${id}.json`);
  try {
    fs.writeFileSync(archivo, JSON.stringify({ ts: Date.now(), guardId, contexto }), 'utf8');
  } catch { /* si no se puede persistir, el bypass simplemente no estara disponible */ }
  return id;
}

/**
 * Consume (borra) una solicitud de break-glass por id exacto -- un solo uso.
 * Si es valida (existe y no vencio), registra el uso en BREAK_GLASS_LOG.jsonl
 * antes de confirmar. Retorna false silenciosamente ante cualquier fallo de
 * lectura -- un id inexistente o corrupto nunca debe otorgar la excepcion.
 * @param {string} id
 * @returns {boolean}
 */
function confirmarBreakGlass(id) {
  ensureDir();
  const archivo = path.join(LOCKS_DIR, `${id}.json`);
  let datos;
  try { datos = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { return false; }
  try { fs.unlinkSync(archivo); } catch { /* best-effort */ }

  const vigente = (Date.now() - datos.ts) <= TTL_MS;
  if (vigente) {
    registrarUso({ id, guardId: datos.guardId, contexto: datos.contexto, ts: datos.ts });
    marcarAprobada(datos.guardId, datos.contexto);
  }
  return vigente;
}

/**
 * Marca la accion (identificada por guardId + contexto normalizado) como
 * aprobada para su proximo chequeo via accionAprobada() -- consumible una
 * sola vez, con el mismo TTL que el resto del mecanismo.
 */
function marcarAprobada(guardId, contexto) {
  try {
    fs.mkdirSync(APROBACIONES_DIR, { recursive: true });
    const clave = claveAprobacion(guardId, contexto);
    fs.writeFileSync(path.join(APROBACIONES_DIR, `${clave}.json`), JSON.stringify({ ts: Date.now() }), 'utf8');
  } catch { /* best-effort, no bloquear la excepcion ya otorgada */ }
}

/**
 * Consulta si guardId+contexto ya fue aprobado via confirmarBreakGlass. El
 * contexto se normaliza igual que en claveAprobacion, asi que diferencias
 * triviales (espacios, invisibles) entre el comando original y el reintento
 * siguen reconociendose como la misma accion. Consume la aprobacion al
 * leerla (un solo reintento, no una excepcion permanente).
 * @param {string} guardId
 * @param {string} contexto
 * @returns {boolean}
 */
function accionAprobada(guardId, contexto) {
  const clave = claveAprobacion(guardId, contexto);
  const archivo = path.join(APROBACIONES_DIR, `${clave}.json`);
  let datos;
  try { datos = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { return false; }
  try { fs.unlinkSync(archivo); } catch { /* best-effort */ }
  return (Date.now() - datos.ts) <= TTL_MS;
}

/**
 * Append-only, nunca lanza -- un fallo al escribir el log de auditoria no
 * debe bloquear la excepcion ya otorgada (el break-glass ya se concedio; la
 * perdida del registro es un problema de observabilidad, no de seguridad
 * activa, y no debe convertirse en un segundo punto de fallo bloqueante).
 * @param {{id: string, guardId: string, contexto: string, ts: number}} entrada
 */
function registrarUso(entrada) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    const linea = JSON.stringify({
      confirmadoEn: Date.now(),
      solicitadoEn: entrada.ts,
      id: entrada.id,
      guardId: entrada.guardId,
      contexto: entrada.contexto,
    });
    fs.appendFileSync(LOG_PATH, linea + '\n', 'utf8');
  } catch { /* best-effort, no bloquear la excepcion ya otorgada */ }
}

module.exports = { solicitarBreakGlass, confirmarBreakGlass, accionAprobada, LOCKS_DIR, LOG_PATH };
