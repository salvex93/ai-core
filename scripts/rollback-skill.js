#!/usr/bin/env node
'use strict';

/**
 * rollback-skill.js — Revierte un skill especifico a una version anterior
 * sin afectar el resto del repositorio.
 *
 * Gap real: los SKILL.md dependen solo de git para su historial, sin
 * metadata de version navegable ni forma de revertir uno solo sin tocar el
 * resto del repo (un `git checkout <hash>` global arriesga revertir otros
 * archivos commiteados en el mismo hash). Este script busca en el historial
 * de git del archivo el commit donde `version: X.Y.Z` coincide exactamente,
 * y aplica `git checkout <hash> -- <archivo>` acotado solo a ese path.
 *
 * Uso:
 *   node scripts/rollback-skill.js <nombre-skill> <version>
 *
 * Ejemplo:
 *   node scripts/rollback-skill.js backend-architect 1.4.0
 *
 * No hace commit del rollback -- deja el archivo modificado en el working
 * tree para que el operador revise el diff antes de confirmar.
 */

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();

function uso() {
  process.stdout.write(
    'Uso: node scripts/rollback-skill.js <nombre-skill> <version>\n' +
    'Ejemplo: node scripts/rollback-skill.js backend-architect 1.4.0\n'
  );
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function buscarCommitConVersion(rutaRelativa, versionObjetivo) {
  const log = git(['log', '--follow', '--format=%H', '--', rutaRelativa]);
  const hashes = log.split('\n').filter(Boolean);

  for (const hash of hashes) {
    let contenido;
    try {
      contenido = git(['show', `${hash}:${rutaRelativa}`]);
    } catch {
      continue; // el archivo no existia en ese hash (rename/creacion posterior)
    }
    const match = contenido.match(/^version:\s*(.+)$/m);
    if (match && match[1].trim() === versionObjetivo) {
      return hash;
    }
  }
  return null;
}

function main() {
  const [nombreSkill, version] = process.argv.slice(2);

  if (!nombreSkill || !version) {
    uso();
    process.exit(1);
  }

  const rutaAbsoluta = path.join(ROOT, '.claude', 'skills', nombreSkill, 'SKILL.md');
  const rutaRelativa = path.relative(ROOT, rutaAbsoluta).split(path.sep).join('/');

  if (!fs.existsSync(rutaAbsoluta)) {
    process.stdout.write(`[rollback-skill] Skill "${nombreSkill}" no existe en ${rutaRelativa} — no encontrado.\n`);
    process.exit(1);
  }

  const hash = buscarCommitConVersion(rutaRelativa, version);
  if (!hash) {
    process.stdout.write(`[rollback-skill] No se encontro ningun commit historico donde "${nombreSkill}" tuviera version: ${version}.\n`);
    process.exit(1);
  }

  git(['checkout', hash, '--', rutaRelativa]);
  process.stdout.write(
    `[rollback-skill] "${nombreSkill}" revertido a version ${version} (commit ${hash.slice(0, 8)}).\n` +
    `Archivo modificado en el working tree, sin commitear -- revisa el diff y corre npm run validate-globals antes de confirmar.\n`
  );
}

main();
