'use strict';

/**
 * McpServerHandlers — Logica de negocio de las herramientas MCP expuestas
 * por mcp-gemini.js. Extraido por SRP: cada handler orquesta
 * GeminiApiClient + TokenManager para resolver una mision especifica
 * (analizar archivo, contenido, repositorio, backlog, busqueda web) —
 * el protocolo JSON-RPC/stdio no vive aqui, solo en mcp-gemini.js.
 */

const fs   = require('fs');
const path = require('path');

const { GEMINI_DEFAULT, getModel, isRefusal, extractJson, callWithRetry, compactarSiNecesario } = require('./GeminiApiClient');
const { truncarInputGemini, truncarOutputGemini } = require('./TokenManager');

const LINE_THRESHOLD = 500;
const SIZE_THRESHOLD = 50 * 1024; // 50 KB

// --- System instructions estaticas (candidatas a cache en Gemini) ---
const SYSTEM_ANALISIS = `Eres un analizador documental de alta precision. Tu funcion es sintetizar archivos de codigo o documentacion para reducir la carga del context window del agente principal.

Responde UNICAMENTE con JSON valido. Sin markdown fence, sin texto adicional fuera del JSON.

Schema requerido:
{"resumen":"<3-5 oraciones>","hallazgos_clave":["hallazgo 1","hallazgo 2"],"recomendaciones":["accion 1"],"advertencias":["advertencia critica — omitir array si no hay"]}

Reglas de calidad:
- resumen: minimo 3 oraciones con conclusion tecnica accionable.
- hallazgos_clave: al menos 2 items, especificos y con referencia a lineas o secciones del archivo.
- recomendaciones: accionables, con ruta y numero de linea cuando aplica.
- advertencias: solo para riesgos criticos de seguridad, correctitud o produccion.`;

const SYSTEM_REPOSITORIO = `Eres un analizador de repositorios. Tu funcion es extraer el stack tecnico, dependencias de IA y convenciones de un proyecto a partir de sus manifiestos.

Responde UNICAMENTE con JSON valido. Sin markdown fence, sin texto adicional fuera del JSON.

Schema requerido:
{"stack":{"lenguaje":"","framework":"","orm_db":""},"dependencias_ia":["sdk1"],"variables_entorno":["VAR1"],"convenciones":["convencion 1"],"resumen":"<3-5 oraciones sobre el proyecto>"}

Reglas:
- stack: deducir del package.json/requirements.txt/go.mod. Si no hay framework claro, escribir "no detectado".
- dependencias_ia: solo SDKs de LLM/IA (@anthropic-ai/sdk, @google/generative-ai, openai, langchain, etc.).
- variables_entorno: extraer de .env.example o CLAUDE.md. Incluir solo nombres de variables, sin valores.
- convenciones: extraer de CLAUDE.md local. Si no existe, escribir ["no declaradas"].
- resumen: minimo 3 oraciones con el proposito del proyecto y decisiones tecnicas clave.`;

const SYSTEM_BACKLOG = `Eres un parser de BACKLOG.md. Extrae las tareas abiertas (Estatus: Pendiente, En Progreso, Backlog) y devuelve JSON estructurado.

Responde UNICAMENTE con JSON valido. Sin markdown fence, sin texto adicional fuera del JSON.

Schema requerido:
{"tareas_abiertas":[{"id":"T1","tipo":"","descripcion":"","estatus":"","jerarquia":""}],"total_abiertas":0,"resumen":"<N tareas abiertas. Resumen ejecutivo.>"}

Reglas:
- tareas_abiertas: solo filas con Estatus Pendiente, En Progreso o Backlog (case-insensitive).
- id: columna #Tarea tal cual aparece en la tabla.
- descripcion: truncar a 80 caracteres si es mas larga.
- Ignorar filas con Estatus Terminado, Cancelado o Diferido.`;

// --- Herramientas ---

async function analizarArchivo({ ruta, mision }) {
  const filePath = path.resolve(ruta);

  // Esta tool esta declarada para "archivos del proyecto anfitrion" pero no
  // hay enforcement tecnico real: el proceso MCP (mcp-gemini.js) corre sin
  // --permission (ver .claude/settings.json, mcpServers.gemini-bridge), a
  // diferencia de los hooks propios que si usan el Node.js Permission Model
  // (hooks-definition.js). No se bloquea (romperia el caso legitimo de
  // analizar archivos en os.tmpdir() u otras rutas absolutas fuera del
  // repo), pero se deja evidencia en stderr para poder auditar despues si
  // una sesion leyo contenido fuera del directorio esperado.
  if (!filePath.startsWith(path.resolve(process.cwd()) + path.sep) && filePath !== path.resolve(process.cwd())) {
    process.stderr.write(`[analizarArchivo] Advertencia: ruta fuera del directorio del proyecto (${filePath}) -- sin restriccion tecnica, solo auditoria.\n`);
  }

  if (!fs.existsSync(filePath)) {
    return { error: `Archivo no encontrado: ${filePath}` };
  }

  const contenido = fs.readFileSync(filePath, 'utf8');
  const lineas    = contenido.split('\n').length;
  const bytes     = Buffer.byteLength(contenido, 'utf8');

  if (lineas <= LINE_THRESHOLD && bytes <= SIZE_THRESHOLD) {
    return {
      delegado: false,
      motivo: `Archivo pequeno (${lineas} lineas, ${(bytes / 1024).toFixed(1)} KB). Contenido incluido para maxima precision.`,
      contenido,
    };
  }

  try {
    const model = getModel({ systemInstruction: SYSTEM_ANALISIS });
    const contenidoFiltrado = truncarInputGemini(contenido);
    const userMessage = `Orden de Mision: ${mision}\n\nArchivo: ${path.basename(filePath)} (${lineas} lineas)\n\nContenido:\n---\n${contenidoFiltrado}\n---`;
    const { parsed, warnings } = await callWithRetry(model, userMessage);
    const compacted = await compactarSiNecesario(parsed, GEMINI_DEFAULT);
    const result = {
      delegado: true,
      metadatos: {
        archivo_analizado: path.basename(filePath),
        modelo: GEMINI_DEFAULT,
        timestamp: new Date().toISOString(),
        lineas,
      },
      ...compacted,
    };
    if (warnings.length > 0) result.calidad_warnings = warnings;
    if (result.resumen) result.resumen = truncarOutputGemini(result.resumen);
    return result;
  } catch (err) {
    return { error: `Gemini error: ${err.message}` };
  }
}

async function analizarContenido({ contenido, mision }) {
  try {
    const model = getModel({ systemInstruction: SYSTEM_ANALISIS });
    const contenidoFiltrado = truncarInputGemini(contenido);
    const userMessage = `Orden de Mision: ${mision}\n\nContenido:\n---\n${contenidoFiltrado}\n---`;
    const { parsed, warnings } = await callWithRetry(model, userMessage);
    const compacted = await compactarSiNecesario(parsed, GEMINI_DEFAULT);
    const result = {
      delegado: true,
      metadatos: {
        modelo: GEMINI_DEFAULT,
        timestamp: new Date().toISOString(),
      },
      ...compacted,
    };
    if (warnings.length > 0) result.calidad_warnings = warnings;
    if (result.resumen) result.resumen = truncarOutputGemini(result.resumen);
    return result;
  } catch (err) {
    return { error: `Gemini error: ${err.message}` };
  }
}

// Analiza manifiestos del repositorio anfitrion para deducir stack y convenciones.
// Reemplaza el protocolo "Primera Accion al Activar" de todos los skills.
async function analizarRepositorio({ ruta_raiz, mision }) {
  const rootPath = path.resolve(ruta_raiz || '.');
  const manifests = [
    'package.json', 'pubspec.yaml', 'requirements.txt', 'pyproject.toml',
    'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle',
    'docker-compose.yml', '.env.example', 'CLAUDE.md',
  ];

  const found = [];
  for (const name of manifests) {
    const filePath = path.join(rootPath, name);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      found.push({ name, content: raw.slice(0, 3000) });
    }
  }

  if (found.length === 0) {
    return { error: `No se encontraron manifiestos en: ${rootPath}` };
  }

  const concatenado = truncarInputGemini(found.map(f => `### ${f.name}\n${f.content}`).join('\n\n'));

  try {
    const model = getModel({ systemInstruction: SYSTEM_REPOSITORIO });
    const userMessage = `Orden de Mision: ${mision}\n\nRepositorio: ${path.basename(rootPath)}\n\nManifiestos:\n---\n${concatenado}\n---`;
    const { parsed, warnings } = await callWithRetry(model, userMessage);
    const result = {
      delegado: true,
      _ia_activa: GEMINI_DEFAULT,
      metadatos: {
        repositorio: path.basename(rootPath),
        manifiestos_analizados: found.map(f => f.name),
        modelo: GEMINI_DEFAULT,
        timestamp: new Date().toISOString(),
      },
      ...parsed,
    };
    if (warnings.length > 0) result.calidad_warnings = warnings;
    if (result.resumen) result.resumen = truncarOutputGemini(result.resumen);
    return result;
  } catch (err) {
    return { error: `Gemini error: ${err.message}` };
  }
}

// Parsea BACKLOG.md y devuelve tareas abiertas estructuradas.
// Reemplaza el parser fragil de session-close.js y evita que Claude lea el BACKLOG completo.
async function resumirBacklog({ ruta_backlog }) {
  const filePath = path.resolve(ruta_backlog || 'BACKLOG.md');
  if (!fs.existsSync(filePath)) {
    return { error: `Archivo no encontrado: ${filePath}` };
  }

  const contenido = truncarInputGemini(fs.readFileSync(filePath, 'utf8'));

  try {
    const model = getModel({ systemInstruction: SYSTEM_BACKLOG });
    const geminiResult = await model.generateContent(contenido);
    const raw          = geminiResult.response.text().trim();
    if (isRefusal(raw)) return { error: `Gemini rechazo el backlog: ${raw.slice(0, 120)}` };
    const parsed = extractJson(raw);
    const result = {
      delegado: true,
      _ia_activa: GEMINI_DEFAULT,
      metadatos: { modelo: GEMINI_DEFAULT, timestamp: new Date().toISOString() },
      ...parsed,
    };
    if (result.resumen) result.resumen = truncarOutputGemini(result.resumen);
    return result;
  } catch (err) {
    return { error: `Gemini error: ${err.message}` };
  }
}

// Busqueda web en tiempo real via Gemini con Google Search grounding.
// Uso: verificar actualizaciones de Anthropic/Google, changelog de modelos,
// cambios en APIs de MCP, nuevas capacidades de Claude.
async function buscarWeb({ consulta, mision }) {
  try {
    const model  = getModel({ tools: [{ googleSearch: {} }] });
    const prompt = `Mision: ${mision}\n\nConsulta: ${consulta}\n\nBusca informacion actualizada y sintetiza los hallazgos mas relevantes. Incluye URLs de las fuentes principales.`;
    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim();

    if (isRefusal(text)) {
      return { error: `Gemini rechazo la busqueda: ${text.slice(0, 200)}` };
    }

    const candidate = result.response.candidates?.[0];
    const grounding = candidate?.groundingMetadata;
    const fuentes   = (grounding?.groundingChunks || [])
      .map(c => c.web?.uri)
      .filter(Boolean);
    const queries   = grounding?.webSearchQueries || [];

    return {
      delegado: true,
      _ia_activa: GEMINI_DEFAULT,
      respuesta: truncarOutputGemini(text),
      fuentes,
      queries_ejecutadas: queries,
      metadatos: {
        consulta,
        modelo: GEMINI_DEFAULT,
        timestamp: new Date().toISOString(),
        grounding_activado: !!grounding,
      },
    };
  } catch (err) {
    return { error: `Gemini web search error: ${err.message}` };
  }
}

module.exports = {
  analizarArchivo,
  analizarContenido,
  analizarRepositorio,
  resumirBacklog,
  buscarWeb,
};
