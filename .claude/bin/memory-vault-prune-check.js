#!/usr/bin/env node
'use strict';
/**
 * memory-vault-prune-check.js — Aviso automatico de poda pendiente del vault.
 *
 * memory-manager/SKILL.md define la Politica de Poda (>50 archivos en .raw/,
 * archivar en vez de eliminar) pero la poda es responsabilidad del operador
 * -- el skill nunca borra sin confirmacion. Sin este check, nadie se entera
 * de que se cruzo el umbral salvo que el modelo lo recuerde manualmente.
 *
 * Este script SOLO avisa (stdout), nunca mueve ni elimina archivos.
 * Ejecutado via hook Stop, despues de memory-index.js index.
 */

const fs   = require('fs');
const path = require('path');

const UMBRAL = 50; // igual al definido en memory-manager/SKILL.md
const REPO   = path.resolve(__dirname, '..', '..');
const RAW    = path.join(REPO, '.claude', 'memory-vault', '.raw');

function contarMd(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === 'archive') continue; // ya podados, no cuentan de nuevo
      n += contarMd(path.join(dir, e.name));
    } else if (e.name.endsWith('.md')) {
      n++;
    }
  }
  return n;
}

const total = contarMd(RAW);

if (total > UMBRAL) {
  process.stdout.write(
    `[MEMORY-VAULT] Aviso: ${total} archivos en .raw/ (umbral: ${UMBRAL}). ` +
    'Poda recomendada -- ver "Politica de Poda" en memory-manager/SKILL.md ' +
    '(archivar en .raw/archive/, nunca eliminar sin confirmacion).\n'
  );
}

process.exit(0);
