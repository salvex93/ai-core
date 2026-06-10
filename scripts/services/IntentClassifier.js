'use strict';

/**
 * IntentClassifier — Arbol de decision para clasificacion de intent del usuario.
 *
 * Recibe el mensaje crudo del usuario y retorna el rol, la herramienta MCP
 * mas apropiada y un nivel de confianza. Es el componente que faltaba para
 * cerrar el ciclo de routing automatico: sin este modulo, AgentRoles solo
 * funcionaba cuando el bridge ya sabia que herramienta invocar.
 *
 * Flujo de decision:
 *   1. Senales de AUDITOR  (errores, seguridad, diagnostico)
 *   2. Senales de ARCHITECT (diseno, arquitectura, busqueda, planificacion)
 *   3. Senales de CODER    (parseo, resumen, codigo directo, comandos shell)
 *   4. Fallback conservador: ARCHITECT con confianza baja
 */

const { ROLES } = require('./AgentRoles');

// ---------------------------------------------------------------------------
// Tablas de senales por rol
// ---------------------------------------------------------------------------

const SENALES_AUDITOR = [
  /error|exception|fallo|crash|stacktrace|stderr|traceback/i,
  /seguridad|vulnerabilidad|CVE|OWASP|inyeccion|injection|XSS|SSRF/i,
  /permiso|permission|EACCES|401|403|unauthorized/i,
  /audita|revisa.*codigo|analiza.*dependencia|npm audit/i,
  /diagnostica|debug|por que falla|que esta mal/i,
];

const SENALES_ARCHITECT = [
  /diseña|disenar|arquitectura|scaffolding|scaffold/i,
  /como.*implementar|como.*construir|como.*organizar/i,
  /busca|investiga|que es|explica|diferencia entre|comparar/i,
  /planifica|roadmap|plan|estrategia|decision tecnica/i,
  /refactoriza.*arquitectura|refactor.*sistema|reestructura.*modulo/i,  // solo refactor de arquitectura → Opus
  /sistema|servicio|microservicio/i,
];

const SENALES_CODER = [
  /escribe.*codigo|genera.*codigo|crea.*funcion|implementa.*funcion/i,
  /crea.*componente|crea.*archivo|crea.*clase|crea.*modulo|genera.*componente/i,
  /parsea|resume|extrae|convierte|transforma/i,
  /comando|shell|bash|script|npm\b|node\b/i,   // npm test, npm install, node script, etc.
  /arregla|fix|corrige|parchea|patch/i,
  /agrega.*linea|modifica.*linea|cambia.*en.*archivo/i,
  /refactoriza\b|refactor\b/i,
  /que es|como funciona|explica.*brevemente|en que consiste/i,
  /responde|dime|cual.*es|cuanto.*cuesta/i,
  /arranca.*esto|ejecuta|corre\b|lanza\b|aplica\b/i,           // "arrancamos con esto", "ejecutalo"
  /si por favor|hazlo|perfecto.*ahora|listo.*con/i,             // confirmaciones de tarea Coder
  /mejora\b|actualiza\b|potencia\b|optimiza\b|sube.*version/i, // "mejora los skills", "optimiza"
];

// Herramienta MCP recomendada por combinacion de rol + tipo de tarea
// REGLA: refactor simple → refactorizar_archivo (Sonnet)
//        refactor de arquitectura → refactorizar_arquitectura (Opus, solo si es multi-modulo)
const HERRAMIENTA_POR_INTENT = {
  [`${ROLES.AUDITOR}_error`]:           'diagnosticar_error',
  [`${ROLES.AUDITOR}_seguridad`]:       'auditar_seguridad_critica',
  [`${ROLES.AUDITOR}_archivo`]:         'analizar_archivo',       // Gemini lee, no Sonnet
  [`${ROLES.ARCHITECT}_diseno`]:        'disenar_sistema',
  [`${ROLES.ARCHITECT}_busqueda`]:      'buscar_web',
  [`${ROLES.ARCHITECT}_repositorio`]:   'analizar_repositorio',   // Gemini analiza el repo
  [`${ROLES.ARCHITECT}_refactor`]:      'refactorizar_arquitectura',  // solo arquitectura multi-modulo
  [`${ROLES.CODER}_resumen`]:           'resumir_backlog',         // Gemini
  [`${ROLES.CODER}_contenido`]:         'analizar_contenido',      // Gemini
  [`${ROLES.CODER}_reparacion`]:        'reparar_error',           // Haiku
  [`${ROLES.CODER}_refactor`]:          'refactorizar_archivo',    // Sonnet — refactor simple
  [`${ROLES.CODER}_pregunta`]:          'responder_pregunta',      // Haiku — conversacion corta
  [`${ROLES.CODER}_concepto`]:          'explicar_concepto',       // Haiku — explicacion tecnica
  [`${ROLES.CODER}_prosa`]:             'generar_haiku',           // Haiku — prosa general corta
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Cuenta cuantas senales de una tabla hacen match con el texto.
 * @param {string} texto
 * @param {RegExp[]} senales
 * @returns {number}
 */
function contarMatches(texto, senales) {
  return senales.reduce((acc, re) => acc + (re.test(texto) ? 1 : 0), 0);
}

/**
 * Infiere el subtipo de herramienta dentro del rol AUDITOR.
 * @param {string} texto
 * @returns {string}
 */
function inferirSubtipoAuditor(texto) {
  if (/error|exception|fallo|crash|stderr/i.test(texto)) return 'error';
  if (/seguridad|CVE|OWASP|XSS|inyeccion/i.test(texto))  return 'seguridad';
  return 'archivo';
}

/**
 * Infiere el subtipo de herramienta dentro del rol ARCHITECT.
 * @param {string} texto
 * @returns {string}
 */
function inferirSubtipoArchitect(texto) {
  if (/busca|investiga|que es|explica/i.test(texto))          return 'busqueda';
  if (/refactoriza|refactor|migracion/i.test(texto))          return 'refactor';
  if (/repositorio|analiza.*repo|estructura del proyecto/i.test(texto)) return 'repositorio';
  return 'diseno';
}

/**
 * Infiere el subtipo de herramienta dentro del rol CODER.
 * @param {string} texto
 * @returns {string}
 */
function inferirSubtipoCoder(texto) {
  if (/resume|backlog|lista|pendiente/i.test(texto))                   return 'resumen';
  if (/arregla|fix|corrige|parchea/i.test(texto))                     return 'reparacion';
  if (/refactoriza\b|refactor\b/i.test(texto))                        return 'refactor';  // → refactorizar_archivo (Sonnet)
  if (/que es|como funciona|explica.*brevemente|en que consiste/i.test(texto)) return 'concepto'; // → explicar_concepto (Haiku)
  if (/responde|dime|cual.*es|cuanto.*cuesta/i.test(texto))           return 'pregunta'; // → responder_pregunta (Haiku)
  if (texto.length < 200)                                              return 'prosa';    // mensaje corto → generar_haiku (Haiku)
  return 'contenido';
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/**
 * Clasifica el intent del mensaje del usuario.
 *
 * @param {string} mensajeUsuario - texto crudo del mensaje
 * @returns {{
 *   rol: string,
 *   herramienta: string,
 *   confianza: number,   // 0.0 – 1.0
 *   razon: string
 * }}
 */
function clasificar(mensajeUsuario) {
  if (!mensajeUsuario || typeof mensajeUsuario !== 'string') {
    return {
      rol:        ROLES.ARCHITECT,
      herramienta: 'disenar_sistema',
      confianza:  0.3,
      razon:      'Mensaje vacio o invalido — fallback a ARCHITECT',
    };
  }

  const texto = mensajeUsuario.trim();

  const puntosAuditor   = contarMatches(texto, SENALES_AUDITOR);
  const puntosArchitect = contarMatches(texto, SENALES_ARCHITECT);
  const puntosCoder     = contarMatches(texto, SENALES_CODER);
  const total           = puntosAuditor + puntosArchitect + puntosCoder || 1;

  // AUDITOR tiene prioridad maxima cuando hay senales de error o seguridad
  if (puntosAuditor > 0 && puntosAuditor >= puntosArchitect && puntosAuditor >= puntosCoder) {
    const subtipo    = inferirSubtipoAuditor(texto);
    const herramienta = HERRAMIENTA_POR_INTENT[`${ROLES.AUDITOR}_${subtipo}`];
    return {
      rol:        ROLES.AUDITOR,
      herramienta,
      confianza:  parseFloat((puntosAuditor / total).toFixed(2)),
      razon:      `Senales de auditoria detectadas (${puntosAuditor} matches) — subtipo: ${subtipo}`,
    };
  }

  // Empate Architect/Coder: Coder gana si la confianza es baja (preguntas cortas conversacionales)
  if (puntosArchitect > puntosCoder && puntosArchitect > 0) {
    const subtipo    = inferirSubtipoArchitect(texto);
    const herramienta = HERRAMIENTA_POR_INTENT[`${ROLES.ARCHITECT}_${subtipo}`];
    return {
      rol:        ROLES.ARCHITECT,
      herramienta,
      confianza:  parseFloat((puntosArchitect / total).toFixed(2)),
      razon:      `Senales de arquitectura detectadas (${puntosArchitect} matches) — subtipo: ${subtipo}`,
    };
  }

  if (puntosCoder > 0) {
    const subtipo    = inferirSubtipoCoder(texto);
    const herramienta = HERRAMIENTA_POR_INTENT[`${ROLES.CODER}_${subtipo}`];
    return {
      rol:        ROLES.CODER,
      herramienta,
      confianza:  parseFloat((puntosCoder / total).toFixed(2)),
      razon:      `Senales de codificacion detectadas (${puntosCoder} matches) — subtipo: ${subtipo}`,
    };
  }

  // Fallback — sin senales claras
  return {
    rol:        ROLES.ARCHITECT,
    herramienta: 'disenar_sistema',
    confianza:  0.3,
    razon:      'Sin senales claras — fallback conservador a ARCHITECT',
  };
}

/**
 * Combina la clasificacion de intent con el routing de modelo.
 * Retorna todo lo necesario para construir la llamada al bridge.
 *
 * @param {string} mensajeUsuario
 * @param {number} [tokensContexto=0]
 * @returns {{
 *   rol: string,
 *   herramienta: string,
 *   modelo: string,
 *   confianza: number,
 *   razonIntent: string,
 *   razonModelo: string
 * }}
 */
function clasificarConModelo(mensajeUsuario, tokensContexto = 0) {
  const { route }   = require('./ModelRouter');
  const intent      = clasificar(mensajeUsuario);
  const { modelo, razon: razonModelo } = route(intent.herramienta, tokensContexto);

  return {
    rol:          intent.rol,
    herramienta:  intent.herramienta,
    modelo,
    confianza:    intent.confianza,
    razonIntent:  intent.razon,
    razonModelo,
  };
}

module.exports = { clasificar, clasificarConModelo };
