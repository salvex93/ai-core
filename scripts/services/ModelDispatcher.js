'use strict';

/**
 * ModelDispatcher — Esqueleto de enrutamiento Mixture-of-Agents (MoA).
 *
 * Distinto de ModelRouter.js (que enruta DENTRO de la familia Claude segun
 * herramienta MCP): este modulo enruta ENTRE proveedores segun el tipo de
 * sub-tarea de un flujo multi-agente, delegando la llamada real a
 * ModelRegistry.chat(provider, messages, options).
 *
 * Patron Command/Port: cada sub-tarea se modela como un SubTaskCommand con
 * un contrato fijo (execute), permitiendo agregar nuevos tipos de sub-tarea
 * sin modificar el dispatcher (Open/Closed). Solo el esqueleto esta
 * implementado — ninguna sub-tarea ejecuta un flujo MoA real todavia; eso
 * requiere ademas orquestacion de fan-out/fan-in (ver skill
 * workflow-orchestrator) fuera del alcance de esta interfaz base.
 */

const { chat } = require('./ModelRegistry');

// ---------------------------------------------------------------------------
// Tipos de sub-tarea y su proveedor asignado
// ---------------------------------------------------------------------------

const SUBTASK_TYPES = Object.freeze({
  CONTEXT_GATHERING: 'ContextGathering',
  SYNTAX_DRAFTING:   'SyntaxDrafting',
  SURGICAL_EDIT:     'SurgicalEdit',
});

// Un tipo de sub-tarea -> un proveedor de ModelRegistry. Cambiar la asignacion
// es editar esta tabla, no el codigo de despacho (Strategy).
const PROVIDER_POR_SUBTASK = Object.freeze({
  [SUBTASK_TYPES.CONTEXT_GATHERING]: 'gemini',   // manejo masivo de tokens, tier gratuito
  [SUBTASK_TYPES.SYNTAX_DRAFTING]:   'deepseek', // borrador de sintaxis, costo bajo
  [SUBTASK_TYPES.SURGICAL_EDIT]:     'anthropic', // edicion quirurgica, requiere precision
});

// ---------------------------------------------------------------------------
// Command base — contrato que toda sub-tarea debe implementar
// ---------------------------------------------------------------------------

/**
 * SubTaskCommand — clase base abstracta (Port) para una sub-tarea delegable.
 * No instanciar directamente: cada tipo de sub-tarea concreta extiende esta
 * clase y solo necesita proveer `messages` y `options` para su proveedor.
 */
class SubTaskCommand {
  /**
   * @param {string} tipo - uno de SUBTASK_TYPES.*
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options]
   */
  constructor(tipo, messages, options = {}) {
    if (new.target === SubTaskCommand) {
      throw new Error('SubTaskCommand es abstracta — extenderla, no instanciarla directamente');
    }
    if (!Object.values(SUBTASK_TYPES).includes(tipo)) {
      throw new Error(`Tipo de sub-tarea desconocido: "${tipo}"`);
    }
    this.tipo     = tipo;
    this.messages = messages;
    this.options  = options;
  }

  /**
   * Ejecuta la sub-tarea contra el proveedor asignado en PROVIDER_POR_SUBTASK.
   * @returns {Promise<{content: string, provider: string}>}
   */
  async execute() {
    const provider = PROVIDER_POR_SUBTASK[this.tipo];
    return chat(provider, this.messages, this.options);
  }
}

class ContextGatheringTask extends SubTaskCommand {
  constructor(messages, options) { super(SUBTASK_TYPES.CONTEXT_GATHERING, messages, options); }
}

class SyntaxDraftingTask extends SubTaskCommand {
  constructor(messages, options) { super(SUBTASK_TYPES.SYNTAX_DRAFTING, messages, options); }
}

class SurgicalEditTask extends SubTaskCommand {
  constructor(messages, options) { super(SUBTASK_TYPES.SURGICAL_EDIT, messages, options); }
}

// ---------------------------------------------------------------------------
// Factory — construye el Command correcto a partir del tipo de sub-tarea
// ---------------------------------------------------------------------------

const COMMANDS_POR_SUBTASK = Object.freeze({
  [SUBTASK_TYPES.CONTEXT_GATHERING]: ContextGatheringTask,
  [SUBTASK_TYPES.SYNTAX_DRAFTING]:   SyntaxDraftingTask,
  [SUBTASK_TYPES.SURGICAL_EDIT]:     SurgicalEditTask,
});

/**
 * Construye el SubTaskCommand correspondiente al tipo de sub-tarea.
 * @param {string} tipo - uno de SUBTASK_TYPES.*
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} [options]
 * @returns {SubTaskCommand}
 */
function crearSubTarea(tipo, messages, options = {}) {
  const Command = COMMANDS_POR_SUBTASK[tipo];
  if (!Command) throw new Error(`Sin Command registrado para el tipo de sub-tarea: "${tipo}"`);
  return new Command(messages, options);
}

// ---------------------------------------------------------------------------
// Orquestacion MoA — fan-out concurrente con fallback aislado por worker
// ---------------------------------------------------------------------------

const CONTEXTO_VACIO = '(sin contexto disponible — worker de ContextGathering fallo o no configurado)';
const BORRADOR_VACIO  = '(sin borrador disponible — worker de SyntaxDrafting fallo o no configurado)';

/**
 * Ejecuta ContextGathering (Gemini) y SyntaxDrafting (DeepSeek) en paralelo
 * (fan-out) y combina ambos resultados en un unico string (fan-in).
 *
 * Promise.allSettled aisla el fallo de cada worker: un timeout, rate limit
 * o error de red en un proveedor no aborta al otro. Si un worker falla, su
 * seccion se sustituye por un marcador de contexto vacio en vez de propagar
 * la excepcion — el orquestador siempre resuelve, nunca rechaza.
 *
 * @param {string} userPrompt - prompt del usuario que dispara el flujo MoA
 * @returns {Promise<{resultado: string, fallos: string[]}>}
 */
async function executeMoATask(userPrompt) {
  const mensajes = [{ role: 'user', content: userPrompt }];

  const contextTask = crearSubTarea(SUBTASK_TYPES.CONTEXT_GATHERING, mensajes);
  const syntaxTask   = crearSubTarea(SUBTASK_TYPES.SYNTAX_DRAFTING, mensajes);

  const [contextResult, syntaxResult] = await Promise.allSettled([
    contextTask.execute(),
    syntaxTask.execute(),
  ]);

  const fallos = [];

  const contexto = contextResult.status === 'fulfilled'
    ? contextResult.value.content
    : (fallos.push(`ContextGathering: ${contextResult.reason?.message ?? contextResult.reason}`), CONTEXTO_VACIO);

  const borrador = syntaxResult.status === 'fulfilled'
    ? syntaxResult.value.content
    : (fallos.push(`SyntaxDrafting: ${syntaxResult.reason?.message ?? syntaxResult.reason}`), BORRADOR_VACIO);

  const resultado = [
    '# Contexto recopilado (ContextGathering)',
    contexto,
    '',
    '# Borrador de sintaxis (SyntaxDrafting)',
    borrador,
  ].join('\n');

  return { resultado, fallos };
}

module.exports = {
  SUBTASK_TYPES,
  PROVIDER_POR_SUBTASK,
  SubTaskCommand,
  ContextGatheringTask,
  SyntaxDraftingTask,
  SurgicalEditTask,
  crearSubTarea,
  executeMoATask,
};
