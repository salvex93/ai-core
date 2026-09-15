'use strict';
/**
 * wizard-integrity.js
 * Chequeo de integridad del harness para el wizard: corre detox (codigo
 * legacy), validate-globals (conformidad de skills), audit-market
 * --only-stale (vigencia de modelos), confirma la instalacion como
 * submodulo cuando aplica, y valida que package.json y CHANGELOG.md
 * declaren la misma version -- ver "Bump de version -> regenerar
 * CONTEXT_MAP" en memoria: un desface de version es sintoma real de un
 * paso de cierre de sesion olvidado, no un falso positivo.
 *
 * Cada chequeo llega inyectado en `deps` para poder testear sin spawnear
 * procesos reales ni leer filesystem real.
 */

function verificarIntegridad(deps) {
  const {
    runDetox,
    runValidateGlobals,
    runAuditMarketStale,
    esSubmoduloDeHostImpl,
    leerVersionPkg,
    leerUltimaVersionChangelog,
    hostDir,
  } = deps;

  const hallazgos = [];

  const detox = runDetox();
  if (detox.salida && /purgad/i.test(detox.salida)) {
    hallazgos.push({ bloqueante: false, detalle: detox.salida.trim() });
  }

  const globals = runValidateGlobals();
  if (!globals.ok) {
    hallazgos.push({ bloqueante: true, detalle: globals.salida.trim() });
  }

  const market = runAuditMarketStale();
  if (!market.ok) {
    hallazgos.push({ bloqueante: true, detalle: market.salida.trim() });
  }

  const submodulo = esSubmoduloDeHostImpl(hostDir);

  const versionPkg = leerVersionPkg();
  const versionChangelog = leerUltimaVersionChangelog();
  if (versionPkg !== versionChangelog) {
    hallazgos.push({
      bloqueante: true,
      detalle: `package.json declara ${versionPkg} pero CHANGELOG.md registra ${versionChangelog} como ultima version -- falta documentar el bump`,
    });
  }

  return {
    conforme: hallazgos.every((h) => !h.bloqueante),
    hallazgos,
    submodulo,
  };
}

module.exports = { verificarIntegridad };
