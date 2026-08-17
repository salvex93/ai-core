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

let _mapasCache = null; // array de { map, raiz } de TODOS los candidatos existentes

/**
 * Carga y cachea TODOS los CONTEXT_MAP candidatos que existan (no solo el
 * primero). Necesario para instalaciones anidadas: el mapa del anfitrion
 * indexa los archivos DEL ANFITRION y el mapa de ai-core indexa los suyos
 * -- un archivo real (ej. CLAUDE.md de ai-core) puede faltar en el primero
 * y estar en el segundo.
 * @returns {Array<{ map: object, raiz: string }>}
 */
function cargarMapas() {
  if (_mapasCache) return _mapasCache;

  const cargados = [];
  for (const candidato of MAP_CANDIDATES) {
    if (!fs.existsSync(candidato)) continue;
    try {
      const raw = fs.readFileSync(candidato, 'utf8');
      const map = JSON.parse(raw);
      // La raiz del mapa es el directorio que contiene el .claude/ donde vive el mapa
      const raiz = path.dirname(path.dirname(candidato));
      cargados.push({ map, raiz });
    } catch (_) {
      // JSON invalido — probar el siguiente candidato
    }
  }
  _mapasCache = cargados;
  return _mapasCache;
}

/**
 * Retorna todos los archivos indexados (lista plana de rutas relativas),
 * combinando TODOS los mapas candidatos existentes. Esquema real de
 * CONTEXT_MAP.json: { host: { root_files, directories, total_files },
 * core: {...} | null } -- "host" es el proyecto anfitrion (o el propio
 * ai-core si standalone), no una clave "map" (esquema legacy que ya no
 * existe, causaba que este modulo nunca encontrara nada).
 * @returns {string[]}
 */
function listarArchivos() {
  const todos = [];
  for (const { map } of cargarMapas()) {
    todos.push(...(map.host?.root_files ?? []));
    for (const archivos of Object.values(map.host?.directories ?? {})) {
      todos.push(...archivos);
    }
  }
  return todos;
}

/**
 * Resuelve una ruta relativa o nombre de archivo a su ruta absoluta consultando el indice.
 * Prueba cada mapa candidato en orden de prioridad hasta encontrar el archivo.
 * Devuelve null si el archivo no esta en ningun mapa (evita intentos de lectura fallidos).
 *
 * PUNTO DE INJECCION: llamar esto ANTES de cualquier fs.readFileSync en los bridges.
 *
 * @param {string} rutaRelativaONombre - ruta relativa al raiz del repo o nombre de archivo
 * @returns {string | null} ruta absoluta si existe en el indice, null si no
 */
function resolver(rutaRelativaONombre) {
  const objetivo = rutaRelativaONombre.replace(/\\/g, '/');
  const nombre   = path.basename(objetivo);

  for (const { map, raiz } of cargarMapas()) {
    const archivos = [
      ...(map.host?.root_files ?? []),
      ...Object.values(map.host?.directories ?? {}).flat(),
    ];

    const exacto = archivos.find(a => a === objetivo || a.endsWith('/' + objetivo));
    if (exacto) return path.resolve(raiz, exacto);

    const porNombre = archivos.find(a => path.basename(a) === nombre);
    if (porNombre) return path.resolve(raiz, porNombre);
  }

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
  const cargados = cargarMapas();
  if (cargados.length === 0) {
    return { estado: 'sin_mapa', candidatos_probados: MAP_CANDIDATES };
  }
  const principal = cargados[0].map;
  return {
    estado:          'cargado',
    version:         principal.version,
    branch:          principal.branch,
    last_updated:    principal.last_updated,
    total_archivos:  listarArchivos().length,
    raiz_resuelta:   cargados[0].raiz,
    mapas_cargados:  cargados.length,
    mapa_origen:     MAP_CANDIDATES.find(c => fs.existsSync(c)),
  };
}

module.exports = { resolver, estaIndexado, leerSiIndexado, listarArchivos, diagnostico };
