#!/usr/bin/env node
'use strict';

/**
 * rollback-agent.js — Restaura el ultimo snapshot registrado por
 * agent-snapshot.js para un archivo especifico, o lista los snapshots
 * recientes si se llama sin argumentos.
 *
 * Complementa rollback-skill.js (que solo revierte SKILL.md por version) --
 * este cubre cualquier archivo que un agente autonomo (aiops-auditor,
 * self-healing-agent, map-updater, security-scanner, issue-tracker,
 * mcp-registry-navigator) haya escrito via Write/Edit.
 *
 * Uso:
 *   node scripts/rollback-agent.js                 (lista snapshots recientes)
 *   node scripts/rollback-agent.js <ruta-archivo>   (revierte al ultimo snapshot de esa ruta)
 *   node scripts/rollback-agent.js --id <id>        (revierte un snapshot especifico por id)
 *
 * Si el snapshot indica que el archivo no existia antes de la escritura del
 * agente (existiaAntes: false), el rollback BORRA el archivo -- ese es el
 * estado correcto "antes" para un archivo que el agente creo de la nada.
 *
 * No hace commit del rollback -- deja el archivo modificado en el working
 * tree para que el operador revise el diff antes de confirmar.
 */

const fs   = require('fs');
const path = require('path');

const ROOT = process.env.AI_CORE_AGENT_SNAPSHOTS_REPO || process.cwd();
const SNAPSHOTS_DIR = process.env.AI_CORE_AGENT_SNAPSHOTS_DIR
  || path.join(ROOT, '.claude', 'AGENT_SNAPSHOTS');
const INDEX_FILE = path.join(SNAPSHOTS_DIR, 'index.json');

function leerIndice() {
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); } catch { return []; }
}

function formatoFecha(ts) {
  return new Date(ts).toISOString();
}

function listar(indice) {
  if (indice.length === 0) {
    process.stdout.write('[rollback-agent] no hay snapshots registrados.\n');
    return;
  }
  process.stdout.write('[rollback-agent] snapshots recientes (mas nuevo al final):\n');
  for (const s of indice.slice(-30)) {
    const estado = s.existiaAntes ? 'modificacion' : 'archivo nuevo';
    process.stdout.write(`  ${s.id}  ${formatoFecha(s.ts)}  ${s.agentType.padEnd(24)}  ${estado.padEnd(14)}  ${s.filePath}\n`);
  }
  process.stdout.write('\nUso: node scripts/rollback-agent.js <ruta-archivo>   (revierte al ultimo snapshot de esa ruta)\n');
  process.stdout.write('     node scripts/rollback-agent.js --id <id>        (revierte un snapshot especifico)\n');
}

function restaurar(snapshot) {
  const rutaAbsoluta = path.resolve(snapshot.filePath);

  if (!snapshot.existiaAntes) {
    if (fs.existsSync(rutaAbsoluta)) fs.unlinkSync(rutaAbsoluta);
    process.stdout.write(
      `[rollback-agent] "${rutaAbsoluta}" no existia antes de que "${snapshot.agentType}" lo escribiera -- borrado.\n`
    );
    return;
  }

  if (!snapshot.snapshotPath || !fs.existsSync(snapshot.snapshotPath)) {
    process.stdout.write(`[rollback-agent] el archivo de snapshot "${snapshot.snapshotPath}" ya no existe -- no se puede restaurar.\n`);
    process.exitCode = 1;
    return;
  }

  fs.copyFileSync(snapshot.snapshotPath, rutaAbsoluta);
  process.stdout.write(
    `[rollback-agent] "${rutaAbsoluta}" restaurado al estado previo a la escritura de "${snapshot.agentType}" (snapshot ${snapshot.id}, ${formatoFecha(snapshot.ts)}).\n` +
    `Archivo modificado en el working tree, sin commitear -- revisa el diff antes de confirmar.\n`
  );
}

function main() {
  const args = process.argv.slice(2);
  const indice = leerIndice();

  if (args.length === 0) {
    listar(indice);
    return;
  }

  if (args[0] === '--id') {
    const id = args[1];
    const snapshot = indice.find(s => s.id === id);
    if (!snapshot) {
      process.stdout.write(`[rollback-agent] no se encontro ningun snapshot con id "${id}".\n`);
      process.exitCode = 1;
      return;
    }
    restaurar(snapshot);
    return;
  }

  const rutaBuscada = path.resolve(args[0]);
  const candidatos = indice.filter(s => path.resolve(s.filePath) === rutaBuscada);
  if (candidatos.length === 0) {
    process.stdout.write(`[rollback-agent] no hay snapshots registrados para "${rutaBuscada}".\n`);
    process.exitCode = 1;
    return;
  }

  restaurar(candidatos[candidatos.length - 1]);
}

main();
