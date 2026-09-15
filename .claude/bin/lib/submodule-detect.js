'use strict';
/**
 * submodule-detect.js
 * Fuente unica de verdad para "es ai-core un submodulo de un proyecto anfitrion".
 * Unifica dos chequeos que antes vivian duplicados e inconsistentes:
 * norm-harness.js miraba .gitmodules del padre, scripts/update.js miraba
 * ausencia de package.json del padre. Ambas senales son validas por separado
 * pero ninguna sola es concluyente (un padre puede tener package.json propio
 * y seguir usando ai-core como submodulo real) -- esta funcion exige AMBAS:
 * .gitmodules del padre declara "ai-core", y el padre tiene su propio
 * CLAUDE.md (senal de que es un proyecto real, no solo un checkout suelto).
 *
 * Dos puntos de entrada porque los dos callers conocen rutas distintas:
 * scripts/update.js conoce la ruta de ai-core (REPO) y necesita resolver el
 * padre; norm-harness.js, al correr con cwd en el propio proyecto anfitrion,
 * ya conoce hostDir de forma directa -- forzarlo a pasar por corePath
 * (resolve(corePath, '..', '..')) requeriria reconstruir una ruta sintetica,
 * fragil en tests donde hostDir es un tmpdir sin relacion posicional real
 * con ningun corePath.
 */
const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} hostDir - ruta absoluta al proyecto anfitrion (padre)
 * @returns {{ esSubmodulo: boolean, hostDir: string|null, razon: string }}
 */
function esSubmoduloDeHost(hostDir) {
  const gitmodulesPath = path.join(hostDir, '.gitmodules');
  const hostClaudePath = path.join(hostDir, 'CLAUDE.md');

  if (!fs.existsSync(gitmodulesPath)) {
    return { esSubmodulo: false, hostDir: null, razon: 'no existe .gitmodules en el directorio padre' };
  }

  const gitmodulesContent = fs.readFileSync(gitmodulesPath, 'utf8');
  const declaraAiCore = /\[submodule\s+"ai-core"\]/.test(gitmodulesContent);
  if (!declaraAiCore) {
    return { esSubmodulo: false, hostDir: null, razon: '.gitmodules existe pero no declara "ai-core"' };
  }

  if (!fs.existsSync(hostClaudePath)) {
    return { esSubmodulo: false, hostDir: null, razon: 'el padre no tiene CLAUDE.md propio' };
  }

  return { esSubmodulo: true, hostDir, razon: '.gitmodules declara ai-core y el padre tiene CLAUDE.md' };
}

/**
 * @param {string} corePath - ruta absoluta a la raiz de ai-core
 * @returns {{ esSubmodulo: boolean, hostDir: string|null, razon: string }}
 */
function detectarSubmodulo(corePath) {
  return esSubmoduloDeHost(path.resolve(corePath, '..', '..'));
}

module.exports = { detectarSubmodulo, esSubmoduloDeHost };
