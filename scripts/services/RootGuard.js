'use strict';

const fs   = require('fs');
const path = require('path');

const MAP_CANDIDATES = [
  path.resolve(__dirname, '../../../../.claude/CONTEXT_MAP.json'),
  path.resolve(__dirname, '../../.claude/CONTEXT_MAP.json'),
];

let _guardActivado = false;
let _raizMapa      = null;

/**
 * Carga el primer CONTEXT_MAP disponible y extrae la raiz del proyecto anfitrion.
 * Usa fs.readdir local — costo de tokens: 0.
 */
function _cargarRaizMapa() {
  for (const candidato of MAP_CANDIDATES) {
    if (!fs.existsSync(candidato)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(candidato, 'utf8'));
      return path.dirname(path.dirname(candidato));
    } catch (_) {}
  }
  return null;
}

/**
 * Escanea el directorio raiz actual usando fs.readdir (sin LLM, sin tokens).
 * @param {string} dir
 * @returns {string[]} lista de entradas en el directorio
 */
function escanearRaizLocal(dir) {
  try {
    return fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
}

/**
 * Verifica si el cwd actual coincide con la raiz del mapa cargado.
 * Si divergen, emite la advertencia y bloquea lecturas masivas.
 *
 * @returns {{ bloqueado: boolean, raizMapa: string|null, cwdActual: string }}
 */
function verificar() {
  const cwdActual = process.cwd();
  _raizMapa = _cargarRaizMapa();

  if (!_raizMapa) {
    console.warn('[RootGuard] ADVERTENCIA: No se encontro CONTEXT_MAP.json. Ejecute npm run map.');
    _guardActivado = true;
    return { bloqueado: true, raizMapa: null, cwdActual };
  }

  const raizNormalizada = path.normalize(_raizMapa);
  const cwdNormalizado  = path.normalize(cwdActual);

  // Coincidencia exacta o el cwd esta dentro de la raiz del mapa
  const dentroDelMapa = cwdNormalizado === raizNormalizada ||
                        cwdNormalizado.startsWith(raizNormalizada + path.sep);

  if (!dentroDelMapa) {
    const entradas = escanearRaizLocal(cwdActual);
    console.warn(
      '\n[RootGuard] NUEVA RAIZ DETECTADA.\n' +
      `  CWD actual : ${cwdActual}\n` +
      `  Raiz del mapa : ${_raizMapa}\n` +
      `  Entradas en CWD (${entradas.length}): ${entradas.slice(0, 10).join(', ')}${entradas.length > 10 ? '...' : ''}\n` +
      '  Ejecute npm run map para evitar consumo excesivo de tokens.\n'
    );
    _guardActivado = true;
    return { bloqueado: true, raizMapa: _raizMapa, cwdActual };
  }

  _guardActivado = false;
  return { bloqueado: false, raizMapa: _raizMapa, cwdActual };
}

/**
 * Guard de lectura masiva. Lanzar antes de cualquier operacion que itere el filesystem.
 * @param {string} [contexto] - nombre del modulo que intenta la lectura
 * @throws {Error} si el guard esta activado
 */
function assertNoMasivaSinMapa(contexto = 'desconocido') {
  if (_guardActivado) {
    throw new Error(
      `[RootGuard] Lectura masiva bloqueada en modulo "${contexto}". ` +
      'NUEVA RAIZ DETECTADA. Ejecute npm run map para evitar consumo excesivo de tokens.'
    );
  }
}

/**
 * @returns {boolean} true si el guard esta activo (raiz divergente o sin mapa)
 */
function estaBloqueado() {
  return _guardActivado;
}

module.exports = { verificar, assertNoMasivaSinMapa, estaBloqueado, escanearRaizLocal };
