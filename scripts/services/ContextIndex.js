'use strict';

/**
 * ContextIndex — Capa de acceso al CONTEXT_MAP del repositorio anfitrion.
 *
 * PROBLEMA RESUELTO: los bridges hacian lecturas ciegas de disco (fs.readFileSync)
 * sin consultar el indice. Esto causaba:
 *   1. Rutas que no existian en el repositorio actual eran intentadas y fallaban.
 *   2. El CONTEXT_MAP.json del repo raiz (602 archivos) era ignorado por completo.
 *   3. El CONTEXT_MAP.json del ai-core (44 archivos) era el unico referenciado.
 *
 * SOLUCION: este modulo resuelve rutas consultando el mapa antes de ir al disco.
 * Si el archivo no esta en el indice, devuelve null sin lanzar excepciones.
 */

const fs   = require('fs');
const path = require('path');

// Candidatos de CONTEXT_MAP en orden de prioridad:
// 1. Mapa del repositorio anfitrion (raiz del repo donde esta instalado AI-CORE)
// 2. Mapa del ai-core (submodulo)
const MAP_CANDIDATES = [
  // Subir 4 niveles desde scripts/services/ hasta la raiz del repo anfitrion
  path.resolve(__dirname, '../../../../.claude/CONTEXT_MAP.json'),
  // Mapa local del ai-core
  path.resolve(__dirname, '../../.claude/CONTEXT_MAP.json'),
];

let _mapCache = null;
let _mapRaiz  = null; // ruta absoluta al directorio raiz del mapa cargado

/**
 * Carga y cachea el CONTEXT_MAP. Usa el primer candidato que exista.
 * @returns {{ map: object, raiz: string } | null}
 */
function cargarMapa() {
  if (_mapCache) return { map: _mapCache, raiz: _mapRaiz };

  for (const candidato of MAP_CANDIDATES) {
    if (!fs.existsSync(candidato)) continue;
    try {
      const raw  = fs.readFileSync(candidato, 'utf8');
      const data = JSON.parse(raw);
      _mapCache  = data;
      // La raiz del mapa es el directorio que contiene el .claude/ donde vive el mapa
      _mapRaiz   = path.dirname(path.dirname(candidato));
      return { map: _mapCache, raiz: _mapRaiz };
    } catch (_) {
      // JSON invalido — probar el siguiente candidato
    }
  }
  return null;
}

/**
 * Retorna todos los archivos indexados (lista plana de rutas relativas).
 * @returns {string[]}
 */
function listarArchivos() {
  const cargado = cargarMapa();
  if (!cargado) return [];

  const { map } = cargado;
  const todos = [...(map.map?.root_files ?? [])];
  for (const archivos of Object.values(map.map?.directories ?? {})) {
    todos.push(...archivos);
  }
  return todos;
}

/**
 * Resuelve una ruta relativa o nombre de archivo a su ruta absoluta consultando el indice.
 * Devuelve null si el archivo no esta en el mapa (evita intentos de lectura fallidos).
 *
 * PUNTO DE INJECCION: llamar esto ANTES de cualquier fs.readFileSync en los bridges.
 *
 * @param {string} rutaRelativaONombre - ruta relativa al raiz del repo o nombre de archivo
 * @returns {string | null} ruta absoluta si existe en el indice, null si no
 */
function resolver(rutaRelativaONombre) {
  const cargado = cargarMapa();
  if (!cargado) return null;

  const { raiz } = cargado;
  const archivos  = listarArchivos();
  const objetivo  = rutaRelativaONombre.replace(/\\/g, '/');

  // Busqueda exacta primero
  const exacto = archivos.find(a => a === objetivo || a.endsWith('/' + objetivo));
  if (exacto) return path.resolve(raiz, exacto);

  // Busqueda por nombre de archivo (sin directorio)
  const nombre = path.basename(objetivo);
  const porNombre = archivos.find(a => path.basename(a) === nombre);
  if (porNombre) return path.resolve(raiz, porNombre);

  return null;
}

/**
 * Verifica si una ruta esta en el indice sin resolver su ruta absoluta.
 * Util para guards rapidos en los bridges.
 *
 * @param {string} rutaRelativaONombre
 * @returns {boolean}
 */
function estaIndexado(rutaRelativaONombre) {
  return resolver(rutaRelativaONombre) !== null;
}

/**
 * Lee un archivo solo si esta en el indice. Evita lecturas de disco ciegas.
 * SUSTITUYE el patron: if (fs.existsSync(p)) fs.readFileSync(p)
 *
 * @param {string} rutaRelativaONombre
 * @param {string} [encoding='utf8']
 * @returns {{ contenido: string, rutaAbsoluta: string } | null}
 */
function leerSiIndexado(rutaRelativaONombre, encoding = 'utf8') {
  const rutaAbsoluta = resolver(rutaRelativaONombre);
  if (!rutaAbsoluta) return null;
  if (!fs.existsSync(rutaAbsoluta)) return null;
  return {
    contenido:     fs.readFileSync(rutaAbsoluta, encoding),
    rutaAbsoluta,
  };
}

/**
 * Diagnostico: reporta el estado del indice cargado.
 * @returns {object}
 */
function diagnostico() {
  const cargado = cargarMapa();
  if (!cargado) {
    return { estado: 'sin_mapa', candidatos_probados: MAP_CANDIDATES };
  }
  return {
    estado:          'cargado',
    version:         cargado.map.version,
    branch:          cargado.map.branch,
    last_updated:    cargado.map.last_updated,
    total_archivos:  cargado.map.map?.total_files ?? listarArchivos().length,
    raiz_resuelta:   _mapRaiz,
    mapa_origen:     MAP_CANDIDATES.find(c => fs.existsSync(c)),
  };
}

module.exports = { resolver, estaIndexado, leerSiIndexado, listarArchivos, diagnostico };
