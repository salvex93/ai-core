'use strict';

/**
 * lib/security-scanner-report-format.js — valida el contrato de formato del
 * Paso 5 de .claude/agents/security-scanner.md: estructura fija con
 * conteos por severidad (CRITICOS/ALTOS/MEDIOS) y un campo ESTADO
 * enumerado (SEGURO | VULNERABILIDADES_MENORES | VULNERABILIDADES_CRITICAS).
 *
 * El .md no declara explicitamente el umbral que convierte los conteos en
 * ESTADO (a diferencia de code-reviewer.md, que si lo hace) -- se infiere
 * por analogia directa con la regla YA documentada de code-reviewer.md
 * (0 criticos/0 altos = mejor estado; 1+ criticos/altos = peor estado) y
 * con el propio nombre del enum: VULNERABILIDADES_CRITICAS implica que
 * ALTOS tambien la dispara (un CVE "high" de npm audit es de scope similar
 * a un hallazgo alto de code-reviewer). Esta regla queda documentada aqui
 * de forma explicita porque el .md no la fijaba -- si se decide un umbral
 * distinto, actualizar ESTA funcion y el .md juntos, no por separado.
 */

const SECCIONES = ['CRITICOS', 'ALTOS', 'MEDIOS'];
const ESTADOS_VALIDOS = ['SEGURO', 'VULNERABILIDADES_MENORES', 'VULNERABILIDADES_CRITICAS'];

function calcularEstadoEsperado(conteos) {
  if (conteos.criticos > 0 || conteos.altos > 0) return 'VULNERABILIDADES_CRITICAS';
  if (conteos.medios > 0) return 'VULNERABILIDADES_MENORES';
  return 'SEGURO';
}

/**
 * @param {string} reporte
 * @returns {{valido: boolean, motivo?: string, conteos?: object, estado?: string, estadoEsperado?: string}}
 */
function validarReporte(reporte) {
  if (typeof reporte !== 'string') {
    return { valido: false, motivo: 'reporte debe ser un string' };
  }

  const conteos = {};
  for (const seccion of SECCIONES) {
    const match = reporte.match(new RegExp(`${seccion}\\s*\\((\\d+)\\)`, 'i'));
    if (!match) {
      return { valido: false, motivo: `falta la seccion "${seccion} (N):"` };
    }
    conteos[seccion.toLowerCase()] = parseInt(match[1], 10);
  }

  const estadoMatch = reporte.match(/ESTADO:\s*(\S+)/i);
  if (!estadoMatch) {
    return { valido: false, motivo: 'falta la linea "ESTADO: SEGURO|VULNERABILIDADES_MENORES|VULNERABILIDADES_CRITICAS"' };
  }

  const estado = estadoMatch[1].toUpperCase();
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return { valido: false, motivo: `ESTADO "${estado}" no es uno de los valores validos: ${ESTADOS_VALIDOS.join(' | ')}` };
  }

  const estadoEsperado = calcularEstadoEsperado(conteos);
  if (estado !== estadoEsperado) {
    return {
      valido: false,
      motivo: `ESTADO declarado "${estado}" es inconsistente con los conteos reales (criticos:${conteos.criticos}, altos:${conteos.altos}, medios:${conteos.medios}) -- deberia ser "${estadoEsperado}"`,
      conteos,
      estado,
      estadoEsperado,
    };
  }

  return { valido: true, conteos, estado, estadoEsperado };
}

module.exports = { validarReporte, calcularEstadoEsperado };
