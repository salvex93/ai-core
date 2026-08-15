#!/usr/bin/env node
'use strict';

/**
 * checkpoint-branch.js — Auto-commit de red de seguridad a una rama de
 * respaldo paralela (ai-core/checkpoints), inspirado en el patron
 * git-native de Aider (auto-commit de cada cambio). Corre en PostToolUse
 * tras Write/Edit.
 *
 * Diferencia deliberada con Aider: Aider commitea a la rama de trabajo real
 * del usuario. Eso violaria la regla estricta de CLAUDE.md ("Protocolo de
 * Commits Git" -- nunca commitear sin peticion explicita del usuario, nunca
 * Co-Authored-By ni mencion de IA). Este script en cambio commitea a una
 * rama SEPARADA que el usuario nunca ve activa (nunca hace checkout a
 * ella) -- es una red de seguridad adicional a agent-snapshot.js (backup de
 * archivo individual), esta vez con el historial completo de git como
 * mecanismo de diff/revert.
 *
 * Como evita tocar el index/staging area real del usuario:
 * Usa GIT_INDEX_FILE apuntando a un archivo de index temporal propio para
 * construir el arbol del commit (via `git add` + `git write-tree` con ese
 * index aislado), y `git commit-tree` para crear el commit directamente
 * sobre el ultimo commit de ai-core/checkpoints (o HEAD si la rama no
 * existe aun) -- sin `git checkout`, sin `git commit` normal, por lo que el
 * index real del usuario (y su HEAD real) nunca se mueven.
 *
 * Best-effort: nunca bloquea ni reporta error visible si algo falla (no es
 * un repositorio git, no hay cambios, git no disponible) -- es una red de
 * seguridad silenciosa, no un gate.
 */

const { execFileSync } = require('node:child_process');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

const REPO = process.env.AI_CORE_CHECKPOINT_REPO || process.cwd();
const RAMA_CHECKPOINTS = 'ai-core/checkpoints';

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', ...opts }).trim();
}

function esRepoGit() {
  try { git(['rev-parse', '--is-inside-work-tree']); return true; } catch { return false; }
}

function hayCambiosReales() {
  try { return git(['status', '--porcelain']).length > 0; } catch { return false; }
}

function ultimoCommitDeRama(rama) {
  try { return git(['rev-parse', rama]); } catch { return null; }
}

function headActual() {
  try { return git(['rev-parse', 'HEAD']); } catch { return null; }
}

function main() {
  if (!esRepoGit()) return;
  if (!hayCambiosReales()) return;

  const parentRef = ultimoCommitDeRama(RAMA_CHECKPOINTS) || headActual();
  if (!parentRef) return; // repo sin ningun commit todavia -- nada que anclar

  const indexTemporal = path.join(
    os.tmpdir(),
    `ai-core-checkpoint-index-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  try {
    const envAislado = { ...process.env, GIT_INDEX_FILE: indexTemporal };

    // Poblar el index temporal con el estado del ultimo commit de la rama
    // de checkpoints (o HEAD), para que el arbol nuevo sea un diff
    // incremental real, no "todo el repo como si fuera la primera vez".
    execFileSync('git', ['read-tree', parentRef], { cwd: REPO, env: envAislado });

    // Reflejar el working tree actual sobre ESE index aislado -- el index
    // real del usuario (GIT_INDEX_FILE por defecto) nunca se toca porque
    // esta invocacion usa una variable de entorno distinta.
    execFileSync('git', ['add', '-A'], { cwd: REPO, env: envAislado });

    const arbol = execFileSync('git', ['write-tree'], { cwd: REPO, env: envAislado, encoding: 'utf8' }).trim();

    // Sin cambios reales respecto al ultimo checkpoint (ej. el usuario
    // deshizo su propio cambio) -- write-tree puede devolver el mismo
    // arbol que el commit padre. Evitar un commit vacio.
    const arbolPadre = execFileSync('git', ['rev-parse', `${parentRef}^{tree}`], { cwd: REPO, encoding: 'utf8' }).trim();
    if (arbol === arbolPadre) return;

    // Mensaje neutro y generico -- CLAUDE.md prohibe cualquier mencion de
    // IA/Claude/Anthropic y Co-Authored-By en CUALQUIER commit, y este no
    // es la excepcion solo por vivir en una rama separada.
    const timestamp = new Date().toISOString();
    const mensaje = `checkpoint automatico de respaldo (${timestamp})`;

    const nuevoCommit = execFileSync(
      'git',
      ['commit-tree', arbol, '-p', parentRef, '-m', mensaje],
      { cwd: REPO, encoding: 'utf8' }
    ).trim();

    // Mover la referencia de la rama de checkpoints al nuevo commit, sin
    // tocar HEAD ni la rama en la que el usuario esta parado.
    execFileSync('git', ['update-ref', `refs/heads/${RAMA_CHECKPOINTS}`, nuevoCommit], { cwd: REPO });
  } catch {
    // best-effort -- nunca bloquear ni ensuciar stderr por un fallo de backup
  } finally {
    try { fs.unlinkSync(indexTemporal); } catch { /* no se creo o ya no existe */ }
  }
}

main();
process.exit(0);
