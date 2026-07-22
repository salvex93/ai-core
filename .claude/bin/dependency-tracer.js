#!/usr/bin/env node
'use strict';
/**
 * dependency-tracer.js — Grafo de dependencias inverso del harness.
 *
 * Dado un archivo, lista que otros scripts de scripts/ y .claude/bin/ lo
 * requieren (directa o transitivamente), para forzar la ejecucion de sus
 * tests antes de aceptar un cambio en un modulo compartido ("de plataforma").
 *
 * Extraccion via regex sobre require(...) con string literal — suficiente
 * para CommonJS estatico (sin require dinamico ni bundlers). No usa AST
 * completo: el harness no tiene esa dependencia y el patron es determinista.
 *
 * Uso:
 *   node dependency-tracer.js <ruta-relativa-al-repo>
 *   node dependency-tracer.js --json <ruta-relativa-al-repo>
 *
 * Ejecutado via hook PreToolUse(Write|Edit) en settings.json: si el archivo
 * tocado tiene dependientes, los imprime en stderr como aviso (no bloquea —
 * el hook devuelve la lista para que el modelo decida ejecutar esos tests).
 */

const fs   = require('node:fs');
const path = require('node:path');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const REPO = path.resolve(__dirname, '..', '..');
const ROOTS = [path.join(REPO, 'scripts'), path.join(REPO, '.claude', 'bin')];

const JSON_OUT = process.argv.includes('--json');
// hooks-definition.js invoca este script con "$CLAUDE_TOOL_INPUT_file_path"
// como argumento -- esa variable nunca existio (confirmado contra
// code.claude.com/docs/en/hooks), por lo que argv[2] siempre llegaba vacio
// en el uso real via hook. La ruta real esta en tool_input.file_path del
// JSON de stdin.
const target = process.argv.filter(a => a !== '--json')[2] || leerEventoDeStdin().tool_input?.file_path;

function listarArchivosJs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listarArchivosJs(full);
    return e.name.endsWith('.js') ? [full] : [];
  });
}

// Extrae los require('./x') o require('../x') de un archivo — solo rutas
// relativas: las dependencias del propio harness, no paquetes de node_modules.
function extraerRequiresRelativos(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const re = /require\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;
  const resueltos = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    let resuelto = path.resolve(path.dirname(filePath), m[1]);
    if (!resuelto.endsWith('.js')) resuelto += '.js';
    resueltos.push(resuelto);
  }
  return resueltos;
}

// Construye el grafo directo (archivo -> [dependencias]) sobre todo el harness
function construirGrafo() {
  const archivos = ROOTS.flatMap(listarArchivosJs);
  const grafo = new Map();
  for (const f of archivos) {
    grafo.set(f, extraerRequiresRelativos(f).filter(dep => fs.existsSync(dep)));
  }
  return grafo;
}

// Invierte el grafo: para cada archivo, quien lo require (directa o transitivamente)
function dependientesDe(archivoObjetivo, grafo) {
  const directos = new Map();
  for (const [archivo, deps] of grafo) {
    for (const dep of deps) {
      if (!directos.has(dep)) directos.set(dep, new Set());
      directos.get(dep).add(archivo);
    }
  }

  const visitados = new Set();
  const cola = [archivoObjetivo];
  while (cola.length > 0) {
    const actual = cola.shift();
    const consumidores = directos.get(actual) || new Set();
    for (const c of consumidores) {
      if (!visitados.has(c)) { visitados.add(c); cola.push(c); }
    }
  }
  return [...visitados];
}

if (!target) {
  process.stderr.write('[dependency-tracer] Uso: node dependency-tracer.js [--json] <ruta-relativa-al-repo>\n');
  process.exit(0);
}

function aRutaPosix(f) {
  return path.relative(REPO, f).split(path.sep).join('/');
}

const rutaAbsoluta = path.resolve(REPO, target);
if (!fs.existsSync(rutaAbsoluta)) process.exit(0);

const grafo = construirGrafo();
const dependientes = dependientesDe(rutaAbsoluta, grafo)
  .map(aRutaPosix)
  .sort();

if (JSON_OUT) {
  console.log(JSON.stringify({ archivo: aRutaPosix(rutaAbsoluta), dependientes }, null, 2));
  process.exit(0);
}

if (dependientes.length === 0) {
  console.log(`[dependency-tracer] ${aRutaPosix(rutaAbsoluta)}: sin dependientes conocidos en scripts/ o .claude/bin/`);
  process.exit(0);
}

console.log(`[dependency-tracer] ${aRutaPosix(rutaAbsoluta)} es requerido (directa o transitivamente) por:`);
dependientes.forEach(d => console.log(`  - ${d}`));
console.log(`[dependency-tracer] Ejecutar los tests correspondientes antes de aceptar este cambio.`);
