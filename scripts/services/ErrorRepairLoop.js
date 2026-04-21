'use strict';

/**
 * ErrorRepairLoop — Ciclo automatico de deteccion, diagnostico y reparacion de errores.
 *
 * Flujo:
 *   1. DETECCION  (este modulo): captura stderr + codigo de salida del shell
 *   2. DIAGNOSTICO (rol AUDITOR via Sonnet): analiza el error y produce un informe
 *   3. REPARACION  (rol ARCHITECT via Opus): genera la orden de correccion exacta
 *
 * Punto de inyeccion en el loop existente:
 *   mcp-gemini.js linea 444 — bloque catch del dispatcher tools/call
 *   Actualmente: send({ jsonrpc: '2.0', id, error: { code: -32603, message: err.message } })
 *   Con este modulo: llamar reparar(err, contexto) antes del send de error.
 *
 * IMPORTANTE: este modulo NO hace llamadas a la API por si solo.
 * Exporta la logica de construccion de prompts y la interfaz estandar.
 * El bridge (anthropic-bridge.js) es quien ejecuta las llamadas reales.
 */

const { ROLES } = require('./AgentRoles');

// Severidad de errores por patron
const PATRONES_SEVERIDAD = [
  { patron: /ENOENT|no such file/i,       severidad: 'ALTO',    categoria: 'sistema_de_archivos' },
  { patron: /ECONNREFUSED|ETIMEDOUT/i,    severidad: 'CRITICO', categoria: 'red_conectividad'    },
  { patron: /SyntaxError|JSON\.parse/i,   severidad: 'MEDIO',   categoria: 'parseo_json'         },
  { patron: /TypeError|undefined.*null/i, severidad: 'ALTO',    categoria: 'tipo_datos'          },
  { patron: /ReferenceError/i,            severidad: 'ALTO',    categoria: 'referencia'          },
  { patron: /EACCES|permission denied/i,  severidad: 'CRITICO', categoria: 'permisos'            },
  { patron: /quota|rate.?limit|429/i,     severidad: 'MEDIO',   categoria: 'api_quota'           },
  { patron: /401|403|Unauthorized/i,      severidad: 'CRITICO', categoria: 'autenticacion'       },
  { patron: /500|Internal Server/i,       severidad: 'ALTO',    categoria: 'servidor_remoto'     },
];

/**
 * Clasifica un error por severidad y categoria.
 *
 * @param {Error|string} error
 * @returns {{ severidad: string, categoria: string }}
 */
function clasificarError(error) {
  const mensaje = error instanceof Error ? error.message : String(error);
  for (const { patron, severidad, categoria } of PATRONES_SEVERIDAD) {
    if (patron.test(mensaje)) return { severidad, categoria };
  }
  return { severidad: 'BAJO', categoria: 'desconocido' };
}

/**
 * Construye el prompt de DIAGNOSTICO para el rol AUDITOR.
 * Este prompt se pasa a anthropic-bridge.completar() con herramienta='diagnosticar_error'.
 *
 * @param {object} params
 * @param {Error|string}  params.error         - error capturado
 * @param {number}        [params.exitCode]    - codigo de salida del proceso (si aplica)
 * @param {string}        [params.stderr]      - salida stderr del comando
 * @param {string}        [params.herramienta] - nombre de la tool MCP que fallo
 * @param {string}        [params.contexto]    - contexto adicional de la operacion
 * @returns {string} prompt listo para enviar al AUDITOR
 */
function buildPromptDiagnostico({ error, exitCode, stderr, herramienta, contexto }) {
  const mensaje   = error instanceof Error ? error.message : String(error);
  const stack     = error instanceof Error ? (error.stack ?? '') : '';
  const { severidad, categoria } = clasificarError(error);

  return `DIAGNOSTICO DE ERROR — Severidad: ${severidad} | Categoria: ${categoria}

Herramienta que fallo: ${herramienta ?? 'desconocida'}
Codigo de salida: ${exitCode ?? 'N/A'}

Mensaje de error:
${mensaje}

${stderr ? `stderr:\n${stderr}\n` : ''}
${stack ? `Stack trace:\n${stack.slice(0, 800)}\n` : ''}
${contexto ? `Contexto de la operacion:\n${contexto}` : ''}

Produce un informe JSON con este schema exacto:
{
  "causa_raiz": "<descripcion tecnica precisa>",
  "archivos_afectados": ["ruta/al/archivo.js:linea"],
  "accion_correctiva": "<instruccion exacta para resolver>",
  "prevencion": "<cambio estructural para evitar recurrencia>",
  "severidad": "${severidad}",
  "categoria": "${categoria}"
}`;
}

/**
 * Construye el prompt de REPARACION para el rol ARCHITECT.
 * Se invoca con el resultado del diagnostico previo.
 *
 * @param {object} informe - objeto JSON resultado del diagnostico del AUDITOR
 * @returns {string} prompt listo para enviar al ARCHITECT
 */
function buildPromptReparacion(informe) {
  return `ORDEN DE REPARACION

Causa raiz identificada: ${informe.causa_raiz ?? 'ver informe'}
Archivos afectados: ${(informe.archivos_afectados ?? []).join(', ')}

Accion correctiva requerida:
${informe.accion_correctiva ?? 'No especificada'}

Medida de prevencion estructural:
${informe.prevencion ?? 'No especificada'}

Genera UNICAMENTE el codigo o comando de reparacion. Sin explicaciones adicionales.
Si es un bloque de codigo: incluye ruta del archivo y numeros de linea afectados como comentario inicial.
Si es un comando de shell: solo el comando.`;
}

/**
 * Middleware de captura de error para el dispatcher MCP.
 *
 * PUNTO DE INYECCION en mcp-gemini.js:
 *   Linea 445 — actualmente: send({ jsonrpc: '2.0', id, error: { code: -32603, message: err.message } })
 *
 *   Reemplazar por:
 *     const meta = capturarError(err, { herramienta: name, exitCode: err.exitCode });
 *     send({ jsonrpc: '2.0', id, error: { code: -32603, message: err.message, data: meta } });
 *
 * @param {Error} error
 * @param {{ herramienta?: string, exitCode?: number, stderr?: string, contexto?: string }} opciones
 * @returns {{ clasificacion: object, prompts: { diagnostico: string, reparacion_pendiente: boolean } }}
 */
function capturarError(error, opciones = {}) {
  const clasificacion = clasificarError(error);
  const promDiagnostico = buildPromptDiagnostico({
    error,
    exitCode:    opciones.exitCode,
    stderr:      opciones.stderr,
    herramienta: opciones.herramienta,
    contexto:    opciones.contexto,
  });

  return {
    clasificacion,
    prompts: {
      diagnostico:          promDiagnostico,
      reparacion_pendiente: true,
    },
    rol_diagnostico:  ROLES.AUDITOR,
    rol_reparacion:   ROLES.ARCHITECT,
  };
}

/**
 * Ejecuta el ciclo completo de reparacion usando el bridge de Anthropic.
 * Requiere que anthropic-bridge.js este disponible.
 *
 * Flujo:
 *   1. AUDITOR diagnostica el error → JSON con causa_raiz y accion_correctiva
 *   2. ARCHITECT genera la orden de reparacion → codigo/comando ejecutable
 *
 * @param {object} params
 * @param {Error}    params.error
 * @param {string}   [params.herramienta]
 * @param {number}   [params.exitCode]
 * @param {string}   [params.stderr]
 * @param {string}   [params.sessionId]
 * @returns {Promise<{ diagnostico: object, reparacion: string, modelo_usado: object }>}
 */
async function ejecutarCicloReparacion({ error, herramienta, exitCode, stderr, sessionId }) {
  const { completar } = require('../anthropic-bridge');

  // Paso 1: DIAGNOSTICO por el AUDITOR (Sonnet)
  const promptDiag = buildPromptDiagnostico({ error, exitCode, stderr, herramienta });
  const resultDiag = await completar({
    herramienta: 'diagnosticar_error',
    mensajeUsuario: promptDiag,
    historial: [],
    skills: [],
    sessionId,
  });

  let informeDiag = {};
  try {
    // El AUDITOR debe responder JSON — extraer si viene en fence
    const raw   = resultDiag.respuesta;
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    informeDiag = JSON.parse(fence ? fence[1].trim() : raw);
  } catch (_) {
    informeDiag = { causa_raiz: resultDiag.respuesta, accion_correctiva: 'ver respuesta del auditor' };
  }

  // Paso 2: REPARACION por el ARCHITECT (Opus)
  const promptRep = buildPromptReparacion(informeDiag);
  const resultRep = await completar({
    herramienta: 'refactorizar_arquitectura',
    mensajeUsuario: promptRep,
    historial: [],
    skills: [],
    sessionId,
  });

  return {
    diagnostico:    informeDiag,
    reparacion:     resultRep.respuesta,
    modelo_usado: {
      diagnostico: resultDiag.modelo,
      reparacion:  resultRep.modelo,
    },
  };
}

module.exports = {
  clasificarError,
  buildPromptDiagnostico,
  buildPromptReparacion,
  capturarError,
  ejecutarCicloReparacion,
};
