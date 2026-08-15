'use strict';

/**
 * lib/self-healing-agent-report-format.js — valida el contrato de formato
 * del Paso 4 de .claude/agents/self-healing-agent.md: campo ESTADO
 * enumerado y, cuando hay secciones ERROR listadas, que cada propuesta
 * declare su clasificacion de riesgo (BAJO_RIESGO|ALTO_RIESGO, Paso 3).
 */

const ESTADOS_VALIDOS = ['PROPUESTAS_PENDIENTES_DE_APROBACION', 'SIN_ERRORES_NUEVOS', 'BRIDGE_NO_DISPONIBLE'];

/**
 * @param {string} reporte
 * @returns {{valido: boolean, motivo?: string, estado?: string, numeroErrores?: number}}
 */
function validarReporte(reporte) {
  if (typeof reporte !== 'string') {
    return { valido: false, motivo: 'reporte debe ser un string' };
  }

  const estadoMatch = reporte.match(/ESTADO:\s*(\S+)/i);
  if (!estadoMatch) {
    return { valido: false, motivo: 'falta la linea "ESTADO: PROPUESTAS_PENDIENTES_DE_APROBACION|SIN_ERRORES_NUEVOS|BRIDGE_NO_DISPONIBLE"' };
  }

  const estado = estadoMatch[1].toUpperCase();
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return { valido: false, motivo: `ESTADO "${estado}" no es uno de los valores validos: ${ESTADOS_VALIDOS.join(' | ')}` };
  }

  const seccionesError = [...reporte.matchAll(/^ERROR:.*$/gim)];
  const numeroErrores = seccionesError.length;

  if (estado === 'SIN_ERRORES_NUEVOS' && numeroErrores > 0) {
    return {
      valido: false,
      motivo: `ESTADO "SIN_ERRORES_NUEVOS" es inconsistente con ${numeroErrores} seccion(es) ERROR listada(s) en el reporte`,
    };
  }

  if (numeroErrores > 0) {
    // Cada seccion ERROR debe traer su propuesta clasificada por riesgo
    // (Paso 3: BAJO_RIESGO o ALTO_RIESGO) -- una propuesta sin clasificar
    // rompe el contrato de "clasificacion informativa" que el Paso 3 exige.
    const propuestasSinClasificar = !/Propuesta\s*\((BAJO_RIESGO|ALTO_RIESGO)\)/i.test(reporte);
    if (propuestasSinClasificar) {
      return {
        valido: false,
        motivo: 'hay seccion(es) ERROR sin la propuesta clasificada por riesgo "Propuesta (BAJO_RIESGO|ALTO_RIESGO):" del Paso 3',
      };
    }
  }

  return { valido: true, estado, numeroErrores };
}

module.exports = { validarReporte };
