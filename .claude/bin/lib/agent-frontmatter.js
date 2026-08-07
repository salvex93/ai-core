'use strict';

/**
 * agent-frontmatter.js — Parser compartido del frontmatter de un AGENT.md.
 *
 * Extraido de agent-tools-guard.js (que ya resolvia agentType -> scope de
 * tools:) para reutilizar el mismo parser/validacion de path traversal en
 * agent-paths-guard.js (scope de rutas), sin duplicar la logica de lectura
 * de frontmatter ni la validacion de agentType.
 *
 * @param {string} agentType - valor crudo de evento.agent_type (JSON de
 *   stdin), sin garantia de formato.
 * @param {string} agentsDir - directorio donde viven los AGENT.md reales.
 * @returns {string|null} contenido del bloque frontmatter (sin los ---
 *   delimitadores), o null si agentType es invalido o el archivo no existe.
 */
function leerFrontmatter(agentType, agentsDir) {
  const fs   = require('node:fs');
  const path = require('node:path');

  // agentType viene de evento.agent_type (JSON de stdin) sin garantia de
  // formato -- sin esta validacion, un valor con "../" escapa agentsDir via
  // path.join (que no previene traversal) y permite leer un archivo
  // arbitrario del sistema como si fuera un AGENT.md real.
  if (!/^[a-zA-Z0-9_-]+$/.test(agentType)) return null;

  const agentPath = path.join(agentsDir, `${agentType}.md`);
  if (!fs.existsSync(agentPath)) return null;

  let contenido;
  try {
    contenido = fs.readFileSync(agentPath, 'utf8');
  } catch {
    return null;
  }

  const match = contenido.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : null;
}

/**
 * Extrae una lista declarada en el frontmatter, aceptando tanto sintaxis
 * array inline (`campo: [A, B]`) como lista YAML multilinea
 * (`campo:\n  - A\n  - B`).
 *
 * @param {string} frontmatter - bloque devuelto por leerFrontmatter().
 * @param {string} campo - nombre del campo (ej. 'tools', 'paths_allow').
 * @returns {string[]|null} lista de valores, o null si el campo no esta declarado.
 */
// Despoja comillas simples/dobles envolventes -- paths_allow se declara con
// comillas (globs suelen incluir caracteres YAML-sensibles como * o /),
// tools: se declara sin ellas; ambos formatos deben resolver al valor real.
function despojarComillas(valor) {
  return valor.replace(/^(["'])(.*)\1$/, '$2');
}

function leerListaDeclarada(frontmatter, campo) {
  const inlineMatch = frontmatter.match(new RegExp(`^${campo}:\\s*\\[([^\\]]*)\\]`, 'm'));
  if (inlineMatch) {
    return inlineMatch[1].split(',').map((t) => despojarComillas(t.trim())).filter(Boolean);
  }

  const multilineaMatch = frontmatter.match(
    new RegExp(`^${campo}:\\s*\\r?\\n((?:^[ \\t]*-[ \\t].*\\r?\\n?)+)`, 'm')
  );
  if (multilineaMatch) {
    return multilineaMatch[1]
      .split(/\r?\n/)
      .map((linea) => despojarComillas(linea.replace(/^[ \t]*-[ \t]*/, '').trim()))
      .filter(Boolean);
  }

  return null;
}

module.exports = { leerFrontmatter, leerListaDeclarada };
