'use strict';

/**
 * AgentRoles — Perfiles de comportamiento por rol del agente.
 *
 * El CLAUDE.md actual define un solo rol generico "Mentor Senior Backend".
 * Este modulo introduce la distincion tecnica entre tres roles especializados
 * y los conecta con el ModelRouter para asignar el modelo correcto segun
 * la naturaleza de la tarea.
 *
 * MODO NEANDERTHAL (rol CODER):
 *   Cero verbosidad. Solo codigo o comandos de shell. Sin explicaciones,
 *   sin encabezados, sin confirmaciones. Diseñado para ejecuciones de terminal
 *   donde cualquier texto adicional rompe el pipeline de automatizacion.
 */

const fs   = require('node:fs');
const path = require('node:path');
const { MODELOS } = require('./ModelRouter');

// ---------------------------------------------------------------------------
// Definicion de roles
// ---------------------------------------------------------------------------

const ROLES = Object.freeze({
  ARCHITECT: 'architect',
  CODER:     'coder',       // Modo Neanderthal
  AUDITOR:   'auditor',
});

const SKILLS_DIR = path.resolve(__dirname, '..', '..', '.claude', 'skills');

function extraerRolDeclarado(contenidoSkillMd) {
  const m = contenidoSkillMd.match(/^rol:\s*"?([a-z]+)"?\s*$/m);
  return m ? m[1] : null;
}

/**
 * Descubre los skills presentes en .claude/skills/ y los agrupa por rol,
 * leyendo el campo `rol:` declarado en el frontmatter de cada SKILL.md.
 * No hay inferencia aqui — el rol es metadata estatica del skill, asignada
 * por criterio semantico al crearlo. Reemplaza el mapeo estatico
 * SKILLS_POR_ROL — una skill nueva se incorpora sin editar este archivo,
 * siempre que declare su `rol:` en el frontmatter.
 *
 * @returns {Record<string, string[]>} rol -> nombres de skill
 */
function descubrirSkillsPorRol() {
  const resultado = {
    [ROLES.ARCHITECT]: [],
    [ROLES.CODER]:     [],
    [ROLES.AUDITOR]:   [],
  };

  if (!fs.existsSync(SKILLS_DIR)) return resultado;

  const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  for (const nombre of dirs) {
    const skillFile = path.join(SKILLS_DIR, nombre, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const contenido = fs.readFileSync(skillFile, 'utf8');
    const rolDeclarado = extraerRolDeclarado(contenido);
    const rol = Object.values(ROLES).includes(rolDeclarado) ? rolDeclarado : ROLES.CODER;
    resultado[rol].push(nombre);
  }

  return resultado;
}

// System prompts por rol — se inyectan en el bloque final (sin cache) de buildSystemBlocks
const SYSTEM_PROMPTS = {
  [ROLES.ARCHITECT]: `Eres el Architect de AI-CORE (salvex93).
Tu funcion: disenar soluciones, evaluar trade-offs y producir especificaciones tecnicas accionables.
Formato: responde con analisis estructurado, rutas de archivo con numeros de linea, y decisiones justificadas.
Idioma: Espanol estricto. Sin emojis ni adornos.`,

  [ROLES.CODER]: `MODO NEANDERTHAL ACTIVO.
Responde UNICAMENTE con codigo o comandos de shell ejecutables.
PROHIBIDO: explicaciones, encabezados, confirmaciones, comentarios de cortesia, texto fuera del bloque de codigo.
Si la respuesta es un comando de shell: solo el comando, sin markdown fence.
Si la respuesta es codigo: solo el bloque de codigo con el lenguaje correcto, nada mas.
Idioma de los comentarios en el codigo: Espanol. Nombres de variables: ingles.

EDICION DE CODIGO EXISTENTE — formato obligatorio SEARCH/REPLACE (estilo Aider):
<<<<<<< SEARCH
(fragmento exacto y minimo del archivo actual, tal como existe hoy)
=======
(fragmento reemplazado)
>>>>>>> REPLACE
PROHIBIDO reescribir un archivo completo cuando el cambio es una edicion localizada.
Cada bloque SEARCH debe ser el fragmento mas pequeno que identifica unicamente el
punto de cambio. Un archivo nuevo (que no existe aun) se entrega completo, sin
bloques SEARCH/REPLACE — la restriccion aplica solo a modificar codigo existente.`,

  [ROLES.AUDITOR]: `Eres el Auditor de seguridad y calidad de AI-CORE (salvex93).
Tu funcion: detectar vulnerabilidades, analizar stderr/errores de ejecucion, y generar ordenes de reparacion.
Formato: reporta hallazgos con severidad (CRITICO/ALTO/MEDIO/BAJO), archivo exacto, linea, y accion correctiva.
Idioma: Espanol estricto. Sin emojis ni adornos.`,
};

// Modelos recomendados por rol
// IMPORTANTE: Gemini es el tier 0 para lecturas/resumenes — estos valores
// son el fallback cuando Gemini no aplica (tareas de razonamiento puro).
const MODELO_POR_ROL = {
  [ROLES.ARCHITECT]: MODELOS.SONNET,  // Sonnet por defecto — Opus solo via route() si la herramienta lo requiere
  [ROLES.CODER]:     MODELOS.HAIKU,   // Baja entropia, alta velocidad — Haiku
  [ROLES.AUDITOR]:   MODELOS.SONNET,  // Balance diagnostico/costo — Sonnet
};

// Cache del descubrimiento — se invalida solo si cambia el mtime de SKILLS_DIR,
// para no releer el filesystem en cada llamada dentro del mismo proceso.
let _cacheSkillsPorRol = null;
let _cacheMtime = -1;

function obtenerSkillsPorRol() {
  let mtime = -1;
  try { mtime = fs.statSync(SKILLS_DIR).mtimeMs; } catch { /* SKILLS_DIR ausente */ }

  if (_cacheSkillsPorRol && mtime === _cacheMtime) return _cacheSkillsPorRol;

  _cacheSkillsPorRol = descubrirSkillsPorRol();
  _cacheMtime = mtime;
  return _cacheSkillsPorRol;
}

/**
 * Retorna los skills recomendados para una herramienta dada.
 * Usado por anthropic-bridge cuando skills=[] para evitar inyeccion manual.
 *
 * @param {string} nombreHerramienta
 * @returns {string[]}
 */
function inferirSkills(nombreHerramienta) {
  const rol = HERRAMIENTA_A_ROL[nombreHerramienta] ?? ROLES.CODER;
  return obtenerSkillsPorRol()[rol] ?? [];
}

// Herramientas MCP → rol inferido automaticamente
// Las herramientas de lectura/resumen usan Gemini (tier 0) — su rol es CODER
// porque no requieren razonamiento profundo, solo procesamiento de contenido.
const HERRAMIENTA_A_ROL = {
  // Tier Gemini (free) — procesamiento de contenido extenso + busqueda web
  resumir_backlog:           ROLES.CODER,
  analizar_contenido:        ROLES.CODER,
  analizar_archivo:          ROLES.CODER,     // Gemini lee el archivo, no Sonnet
  analizar_repositorio:      ROLES.CODER,     // Gemini analiza el repo completo
  buscar_web:                ROLES.CODER,     // Gemini hace busqueda gratis — era Sonnet antes

  // Tier Haiku — transformaciones simples + prosa corta conversacional
  reparar_error:             ROLES.CODER,
  parsear_schema:            ROLES.CODER,
  responder_pregunta:        ROLES.CODER,    // conversacion corta — Haiku suficiente
  explicar_concepto:         ROLES.CODER,    // explicacion tecnica sin diseño de sistema
  generar_haiku:             ROLES.CODER,    // prosa corta de proposito general

  // Tier Sonnet — analisis y refactorizacion (buscar_web migrado a Gemini tier 0)
  refactorizar_archivo:      ROLES.AUDITOR,
  diagnosticar_error:        ROLES.AUDITOR,
  auditar_calidad:           ROLES.AUDITOR,

  // Tier Opus — arquitectura critica (uso excepcional)
  refactorizar_arquitectura: ROLES.ARCHITECT,
  disenar_sistema:           ROLES.ARCHITECT,
  auditar_seguridad_critica: ROLES.AUDITOR,
};

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/**
 * Retorna el perfil completo para un rol dado.
 *
 * @param {string} rol - uno de ROLES.*
 * @returns {{ rol: string, systemPrompt: string, modelo: string, esNeanderthal: boolean }}
 */
function obtenerPerfil(rol) {
  const rolNormalizado = Object.values(ROLES).includes(rol) ? rol : ROLES.CODER;
  return {
    rol:          rolNormalizado,
    systemPrompt: SYSTEM_PROMPTS[rolNormalizado],
    modelo:       MODELO_POR_ROL[rolNormalizado],
    esNeanderthal: rolNormalizado === ROLES.CODER,
  };
}

/**
 * Infiere el rol apropiado a partir del nombre de la herramienta MCP.
 *
 * @param {string} nombreHerramienta
 * @returns {string} uno de ROLES.*
 */
function inferirRol(nombreHerramienta) {
  return HERRAMIENTA_A_ROL[nombreHerramienta] ?? ROLES.CODER;
}

/**
 * Retorna el system prompt para inyectar en el bloque no-cacheado de la peticion.
 * Se usa en buildSystemBlocks() de anthropic-bridge.js como ultimo bloque.
 *
 * @param {string} [rol] - si se omite, se usa CODER (Modo Neanderthal por defecto)
 * @returns {string}
 */
function systemPromptParaRol(rol) {
  return SYSTEM_PROMPTS[rol] ?? SYSTEM_PROMPTS[ROLES.CODER];
}

module.exports = { ROLES, obtenerPerfil, inferirRol, inferirSkills, systemPromptParaRol, MODELO_POR_ROL, obtenerSkillsPorRol };
