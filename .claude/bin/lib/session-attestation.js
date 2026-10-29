'use strict';

/**
 * lib/session-attestation.js — informe de sesion firmado y encadenado.
 *
 * Convierte los registros que el arnes ya produce (reportes de guards de
 * guard-report.js y aprobaciones de break-glass) en un sobre verificable:
 * informe canonico + hash SHA-256 + firma Ed25519. Cada informe incluye el
 * hash del anterior, de modo que alterar o eliminar un informe intermedio rompe
 * la cadena en un indice localizable. Un tercero verifica con la clave publica,
 * sin acceso a la privada.
 *
 * Alcance honesto: la cadena detecta alteracion y borrado intermedio, pero no
 * el truncado del final ni que el dueno de la clave fabrique una cadena
 * completa nueva. Para eso el hash de la cabeza debe anclarse fuera del equipo
 * (por ejemplo, en un commit o tag publicado). Este modulo es puro: no lee ni
 * escribe disco, no toca claves del sistema y no se registra en ningun hook.
 *
 * Privacidad: el contexto de break-glass guarda el comando crudo (puede incluir
 * rutas o datos sensibles); el informe conserva solo `id` y `guardId`.
 */

const crypto = require('node:crypto');

const ESQUEMA = 'ai-core.session-attestation/1';
const GENESIS = '0'.repeat(64);
const PATRON_HASH = /^[0-9a-f]{64}$/;
const VEREDICTOS = ['ok', 'warn', 'blocked'];

/**
 * Serializacion JSON determinista: claves de objeto ordenadas en todos los
 * niveles, arrays en su orden, valores undefined omitidos.
 * @param {*} valor
 * @returns {string}
 */
function canonicalizar(valor) {
  if (Array.isArray(valor)) return `[${valor.map(canonicalizar).join(',')}]`;
  if (valor && typeof valor === 'object') {
    const partes = Object.keys(valor)
      .filter(k => valor[k] !== undefined)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonicalizar(valor[k])}`);
    return `{${partes.join(',')}}`;
  }
  return JSON.stringify(valor);
}

function hashDe(informe) {
  return crypto.createHash('sha256').update(canonicalizar(informe), 'utf8').digest('hex');
}

function resumirGuards(reportes) {
  const total = { ok: 0, warn: 0, blocked: 0 };
  const porGuard = {};
  let descartados = 0;
  for (const r of reportes || []) {
    if (!r || !r.guard || !VEREDICTOS.includes(r.verdict)) { descartados++; continue; }
    total[r.verdict]++;
    porGuard[r.guard] = porGuard[r.guard] || { ok: 0, warn: 0, blocked: 0 };
    porGuard[r.guard][r.verdict]++;
  }
  return { total, porGuard, descartados };
}

/**
 * @param {object} datos
 * @param {string} datos.sessionId
 * @param {string} datos.version - version del arnes (package.json)
 * @param {string} [datos.gitHead] - commit corto al cerrar la sesion
 * @param {string} [datos.emitidoEn] - ISO 8601; por defecto, ahora
 * @param {object[]} [datos.guardReportes] - lineas de guard-report.js ya parseadas
 * @param {object[]} [datos.breakGlass] - registros de break-glass; solo se conserva id y guardId
 * @param {string} [datos.prevHash] - hash del informe anterior; GENESIS si es el primero
 * @returns {object} informe sin firmar
 */
function construirInforme(datos) {
  return {
    esquema: ESQUEMA,
    sessionId: datos.sessionId,
    version: datos.version,
    gitHead: datos.gitHead || null,
    emitidoEn: datos.emitidoEn || new Date().toISOString(),
    guards: resumirGuards(datos.guardReportes),
    breakGlass: (datos.breakGlass || []).map(b => ({ id: b.id, guardId: b.guardId })),
    prevHash: datos.prevHash || GENESIS,
  };
}

/**
 * @param {object} informe - salida de construirInforme()
 * @param {string} clavePrivadaPem - Ed25519, PKCS8 PEM
 * @returns {{informe: object, hash: string, firma: string}}
 */
function firmarInforme(informe, clavePrivadaPem) {
  if (!informe || !PATRON_HASH.test(informe.prevHash || '')) {
    throw new Error('session-attestation: el informe requiere un prevHash valido (64 hex)');
  }
  const hash = hashDe(informe);
  const firma = crypto.sign(null, Buffer.from(hash, 'utf8'), clavePrivadaPem).toString('base64');
  return { informe, hash, firma };
}

/**
 * @param {{informe: object, hash: string, firma: string}} sobre
 * @param {string} clavePublicaPem - Ed25519, SPKI PEM
 * @returns {boolean}
 */
function verificarSobre(sobre, clavePublicaPem) {
  try {
    if (!sobre || !sobre.informe || hashDe(sobre.informe) !== sobre.hash) return false;
    return crypto.verify(null, Buffer.from(sobre.hash, 'utf8'), clavePublicaPem, Buffer.from(sobre.firma, 'base64'));
  } catch {
    return false;
  }
}

/**
 * Verifica firma, hash y encadenamiento de una lista ordenada de sobres.
 * @param {object[]} sobres
 * @param {string} clavePublicaPem
 * @returns {{ok: boolean, indiceRoto: number|null, motivo: string|null}}
 */
function verificarCadena(sobres, clavePublicaPem) {
  let esperado = GENESIS;
  for (let i = 0; i < sobres.length; i++) {
    if (!verificarSobre(sobres[i], clavePublicaPem)) {
      return { ok: false, indiceRoto: i, motivo: 'firma u hash invalido' };
    }
    if (sobres[i].informe.prevHash !== esperado) {
      return { ok: false, indiceRoto: i, motivo: 'cadena rota: prevHash no coincide con el sobre anterior' };
    }
    esperado = sobres[i].hash;
  }
  return { ok: true, indiceRoto: null, motivo: null };
}

/** @returns {{publica: string, privada: string}} par Ed25519 en PEM */
function generarParDeClaves() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publica: publicKey.export({ type: 'spki', format: 'pem' }),
    privada: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

module.exports = {
  ESQUEMA, GENESIS, canonicalizar, construirInforme, firmarInforme,
  verificarSobre, verificarCadena, generarParDeClaves,
};
