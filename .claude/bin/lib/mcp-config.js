'use strict';

/**
 * mcp-config.js — Fuente unica de verdad del bloque mcpServers para ai-core.
 *
 * Verificado contra code.claude.com/docs/en/mcp (2026-09-22): la clave
 * mcpServers dentro de settings.json NO tiene efecto -- Claude Code solo
 * carga servidores MCP desde .mcp.json (project scope, raiz del proyecto)
 * o ~/.claude.json (local/user scope). settings.json/setup-settings.js y
 * host-settings.js escribian mcpServers ahi por una suposicion nunca
 * verificada (hallazgo de gobierno G12) -- contenido muerto que
 * health-check.js tambien leia para detectar path drift, sin efecto real.
 * Este modulo centraliza la construccion de .mcp.json real, con merge no
 * destructivo para preservar servidores propios que el anfitrion agregue.
 */

const fs = require('fs');
const path = require('path');

function buildMcpServersBlock(repoPath) {
  const fwd = (p) => p.split(path.sep).join('/');
  return {
    'gemini-bridge': {
      command: 'node',
      args: ['scripts/mcp-gemini.js'],
      cwd: fwd(repoPath),
    },
    'anthropic-router': {
      command: 'node',
      args: ['scripts/mcp-anthropic.js'],
      cwd: fwd(repoPath),
    },
  };
}

/**
 * Combina mcpServers generado por ai-core con lo que ya exista en .mcp.json
 * (propio del anfitrion o del checkout standalone) -- el generado solo
 * agrega/actualiza sus propias claves, nunca reemplaza el objeto completo.
 */
function mergeMcpServers(existing = {}, generado = {}) {
  return { ...existing, ...generado };
}

/**
 * Escribe/actualiza .mcp.json en targetDir con los servidores de ai-core,
 * preservando cualquier servidor custom ya presente. Idempotente: si el
 * contenido resultante es identico al existente, no reescribe el archivo.
 *
 * @param {string} targetDir - directorio donde vive (o vivira) .mcp.json
 * @param {string} repoPath - ruta del repo ai-core, para cwd de los servidores
 * @returns {{written: boolean, mcpServers: object}}
 */
function writeMcpJson(targetDir, repoPath) {
  const mcpJsonPath = path.join(targetDir, '.mcp.json');
  let existing = {};
  if (fs.existsSync(mcpJsonPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
    } catch {
      existing = {};
    }
  }

  const generado = buildMcpServersBlock(repoPath);
  const mcpServers = mergeMcpServers(existing.mcpServers, generado);
  const resultado = { ...existing, mcpServers };

  const nuevoContenido = JSON.stringify(resultado, null, 2) + '\n';
  const contenidoActual = fs.existsSync(mcpJsonPath) ? fs.readFileSync(mcpJsonPath, 'utf8') : null;

  if (contenidoActual === nuevoContenido) {
    return { written: false, mcpServers };
  }

  fs.writeFileSync(mcpJsonPath, nuevoContenido, 'utf8');
  return { written: true, mcpServers };
}

/**
 * Lee el cwd de gemini-bridge desde .mcp.json en targetDir, o null si no
 * existe / esta mal formado. Usado por health-check.js para detectar path
 * drift sin depender de settings.json (que ya no lleva mcpServers).
 */
function readGeminiBridgeCwd(targetDir) {
  const mcpJsonPath = path.join(targetDir, '.mcp.json');
  if (!fs.existsSync(mcpJsonPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
    return parsed?.mcpServers?.['gemini-bridge']?.cwd ?? null;
  } catch {
    return null;
  }
}

module.exports = { buildMcpServersBlock, mergeMcpServers, writeMcpJson, readGeminiBridgeCwd };
