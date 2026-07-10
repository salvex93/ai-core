#!/usr/bin/env node
'use strict';

/**
 * anthropic-bridge.js — Bridge Anthropic SDK con Prompt Caching y Model Router.
 *
 * Activacion: fallback cuando Gemini agota su cuota (Circuit Breaker — Regla 9).
 * Tambien disponible como bridge primario para tareas que requieren Haiku/Sonnet/Opus.
 *
 * Prompt Caching:
 *   El bloque estatico (CLAUDE.md + skills activos + tool definitions) se marca con
 *   cache_control: { type: 'ephemeral' } antes del historial dinamico.
 *   Ahorro esperado: 90% en tokens de input en el segundo turno y posteriores.
 *
 * Ventana deslizante:
 *   El historial se trunca a MAX_TURNS_WINDOW turnos para evitar fugas de tokens.
 */

const fs   = require('fs');
const path = require('path');

const { route, estimarCosto, MODELOS }                   = require('./services/ModelRouter');
const { inferirRol, inferirSkills, systemPromptParaRol }  = require('./services/AgentRoles');
const { resolver: resolverIndice, diagnostico }           = require('./services/ContextIndex');
const { verificar: verificarRootGuard }                   = require('./services/RootGuard');
const { validar: validarRespuesta }                       = require('./services/ResponseValidator');
const StyleProfiler                                        = require('./services/StyleProfiler');
const rateLimiter                                          = require('./services/RateLimiter');
const { estimarTokensMensajes, truncarInputGemini, truncarOutputGemini } = require('./services/TokenManager');

const MAX_TURNS_WINDOW = 6;  // maximo de turnos user/assistant en el historial enviado
const MAX_TOKENS_OUT   = 4096;

// Carga .env desde la raiz del ai-core
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// Lazy-load del SDK de Anthropic
let _anthropic = null;
function getClient() {
  if (_anthropic) return _anthropic;
  const { default: Anthropic } = require('@anthropic-ai/sdk');
  _anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  return _anthropic;
}

/**
 * Lee el contenido de CLAUDE.md del ai-core (reglas globales de comportamiento).
 * Es el candidato principal a cache: ~2.500 tokens, presente en cada turno.
 */
function leerClaudeMd() {
  const p = path.resolve(__dirname, '../CLAUDE.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

/**
 * Lee los SKILL.md activos consultando el ContextIndex antes de ir al disco.
 * Resuelve rutas via el indice del repositorio anfitrion cuando esta disponible.
 *
 * @param {string[]} skillsActivos - nombres de carpetas en .claude/skills/
 * @returns {string}
 */
function leerSkillsActivos(skillsActivos = []) {
  if (skillsActivos.length === 0) return '';

  const skillsDir = path.resolve(__dirname, '../.claude/skills');

  return skillsActivos
    .map(nombre => {
      // Primero intentar resolver via el indice (evita lecturas ciegas)
      const rutaIndexada = resolverIndice(`.claude/skills/${nombre}/SKILL.md`);
      const rutaDirecta  = path.join(skillsDir, nombre, 'SKILL.md');
      const ruta         = rutaIndexada ?? (fs.existsSync(rutaDirecta) ? rutaDirecta : null);

      if (!ruta) return '';
      const contenido = fs.readFileSync(ruta, 'utf8');
      return `\n\n## SKILL ACTIVO: ${nombre}\n${contenido}`;
    })
    .filter(Boolean)
    .join('');
}

/**
 * Construye el array de bloques del system prompt con cache_control inyectado.
 *
 * Estructura del cache:
 *   [0] CLAUDE.md completo         → cache_control: ephemeral  (PUNTO DE CACHE A)
 *   [1] Skills activos              → cache_control: ephemeral  (PUNTO DE CACHE B)
 *   [2] Definicion de herramientas  → cache_control: ephemeral  (PUNTO DE CACHE C)
 *
 * El historial dinamico (messages[]) comienza DESPUES del ultimo punto de cache,
 * lo que maximiza el hit-rate porque el prefijo cacheado nunca cambia entre turnos.
 *
 * @param {string[]} skillsActivos
 * @returns {Array<object>} bloques de system para la API de Anthropic
 */
function buildSystemBlocks(skillsActivos = [], opcionesRol = null) {
  const claudeMd = leerClaudeMd();
  const skills   = leerSkillsActivos(skillsActivos);

  const bloques = [];

  if (claudeMd) {
    bloques.push({
      type: 'text',
      text: `<static_context>\n# REGLAS GLOBALES DE COMPORTAMIENTO\n\n${claudeMd}`,
      cache_control: { type: 'ephemeral' }, // PUNTO DE CACHE A
    });
  }

  if (skills) {
    bloques.push({
      type: 'text',
      text: `# SKILLS ACTIVOS\n${skills}`,
      cache_control: { type: 'ephemeral' }, // PUNTO DE CACHE B
    });
  }

  // Catalogo de herramientas del bridge — estatico por sesion, candidato a cache
  const catalogoHerramientas = [
    'Herramientas disponibles via ModelRouter:',
    '  GEMINI (free): analizar_archivo, analizar_repositorio, resumir_backlog, analizar_contenido, buscar_web',
    '  HAIKU:  reparar_error, parsear_schema, responder_pregunta, explicar_concepto, generar_haiku',
    '  SONNET: refactorizar_archivo, diagnosticar_error, auditar_calidad',
    '  OPUS:   disenar_sistema, refactorizar_arquitectura, auditar_seguridad_critica',
    'Jerarquia: Gemini (gratis) → Haiku → Sonnet → Opus (excepcional)',
  ].join('\n');

  bloques.push({
    type: 'text',
    text: `${catalogoHerramientas}\n</static_context>`,
    cache_control: { type: 'ephemeral' }, // PUNTO DE CACHE C
  });

  // Bloque de instruccion de rol (sin cache — varia segun la herramienta activa)
  // Fuera de <static_context>: el input dinamico y el estado por turno van
  // despues del ultimo punto de cache para maximizar el hit-rate del prefijo.
  bloques.push({
    type: 'text',
    text: systemPromptParaRol(opcionesRol),
  });

  return bloques;
}

/**
 * Aplica la ventana deslizante al historial de mensajes.
 * Mantiene los ultimos MAX_TURNS_WINDOW pares user/assistant.
 *
 * @param {Array<{role: string, content: string}>} historial
 * @returns {Array<{role: string, content: string}>}
 */
function aplicarVentanaDeslizante(historial) {
  const pares = [];
  for (let i = 0; i < historial.length - 1; i += 2) {
    if (historial[i]?.role === 'user' && historial[i + 1]?.role === 'assistant') {
      pares.push([historial[i], historial[i + 1]]);
    }
  }
  // Conservar ultimo mensaje si es user sin respuesta aun
  const ultimo = historial[historial.length - 1];
  const sobrantes = pares.slice(-MAX_TURNS_WINDOW);
  const mensajes  = sobrantes.flat();
  if (ultimo?.role === 'user' && !mensajes.includes(ultimo)) {
    mensajes.push(ultimo);
  }
  return mensajes;
}

/**
 * Envia una solicitud al API de Anthropic usando el Model Router y Prompt Caching.
 *
 * @param {object} opciones
 * @param {string}   opciones.herramienta     - nombre de la tool MCP (para routing)
 * @param {string}   opciones.mensajeUsuario  - mensaje del turno actual
 * @param {Array}    [opciones.historial=[]]  - historial previo {role, content}[]
 * @param {string[]} [opciones.skills=[]]     - nombres de skills a inyectar en el system
 * @param {string}   [opciones.sessionId]     - ID de sesion para trazabilidad
 * @returns {Promise<{respuesta: string, uso: object, modelo: string, razonRouting: string}>}
 */
async function completar({ herramienta, mensajeUsuario, historial = [], skills = [], sessionId }) {
  loadEnv();
  verificarRootGuard();

  // Registrar mensaje del usuario para ajuste de estilo de sesion
  StyleProfiler.registrar(mensajeUsuario);

  // Validacion temprana — falla antes de construir contexto o abrir conexiones
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.trim() === '') {
    throw new Error(
      '[anthropic-bridge] ANTHROPIC_API_KEY no esta configurada. ' +
      'Copie .env.example a .env y complete el valor antes de invocar el bridge.'
    );
  }

  const historialTruncado = aplicarVentanaDeslizante(historial);
  const tokensContexto    = estimarTokensMensajes(historialTruncado) + Math.ceil(mensajeUsuario.length / 4);
  const { modelo, tier, razon } = route(herramienta, tokensContexto);
  const rol                     = inferirRol(herramienta);

  // Si el router recomienda Gemini, retornar recomendacion sin gastar tokens Claude
  if (tier === 'gemini') {
    return {
      respuesta:         null,
      recomendacionGemini: true,
      herramienta,
      razonRouting:      razon,
      mensaje:           `[GEMINI RECOMENDADO] Usa el MCP gemini-bridge → herramienta: ${herramienta}. Razon: ${razon}`,
    };
  }

  // Auto-seleccion de skills si el llamador no los especifica
  const skillsResueltos = skills.length > 0 ? skills : inferirSkills(herramienta);

  // Bloque de estilo de sesion (no va al cache — varia por sesion)
  const systemBlocks  = buildSystemBlocks(skillsResueltos, rol);
  const bloqueEstilo  = StyleProfiler.generarBloqueEstilo();
  if (bloqueEstilo) {
    systemBlocks.push({ type: 'text', text: bloqueEstilo });
  }

  const messages = [
    ...historialTruncado,
    { role: 'user', content: mensajeUsuario },
  ];

  // Verificar rate limits antes de llamar a la API
  const tokensEstimados = estimarTokensMensajes(messages);
  rateLimiter.verificar({
    tokensInput:  tokensEstimados,
    tokensOutput: MAX_TOKENS_OUT,
  });

  const client = getClient();

  const response = await client.messages.create({
    model:      modelo,
    max_tokens: MAX_TOKENS_OUT,
    system:     systemBlocks,
    messages,
    ...(sessionId && {
      metadata: { user_id: sessionId },
    }),
  });

  const respuesta = response.content[0]?.text ?? '';
  const uso       = response.usage ?? {};

  // Validar output antes de entregarlo — log de violaciones sin bloquear
  const informe = validarRespuesta(respuesta);
  if (!informe.valido) {
    process.stderr.write(`[ResponseValidator] ${informe.resumen}\n`);
  }

  // Registrar uso real para contabilidad de rate limit
  rateLimiter.registrar(uso);

  return {
    respuesta,
    uso,
    modelo,
    razonRouting:      razon,
    turnosEnHistorial: historialTruncado.length,
    validacion:        informe.resumen,
    cuota_restante:    rateLimiter.estado(),
  };
}

module.exports = { completar, buildSystemBlocks, aplicarVentanaDeslizante, estimarTokensMensajes, truncarInputGemini, truncarOutputGemini };
