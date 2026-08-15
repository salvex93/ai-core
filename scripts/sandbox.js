#!/usr/bin/env node
/**
 * sandbox.js — Levanta una sesion de Claude Code aislada en contenedor
 * Docker, montando el proyecto anfitrion como volumen (patron OpenHands:
 * "correr sin Docker otorga acceso completo al sistema de archivos" --
 * hallazgo de auditoria 2026-08-15). Capacidad OPCIONAL: el uso normal sin
 * Docker sigue funcionando exactamente igual, nada cambia por default.
 *
 * Uso: npm run sandbox
 *   AI_CORE_HOST_PATH=/ruta/al/proyecto npm run sandbox   (monta un anfitrion especifico)
 *   npm run sandbox -- --build                            (fuerza rebuild de la imagen)
 *
 * Requiere Docker y docker-compose instalados y corriendo -- si no estan
 * disponibles, sale con mensaje explicativo (no falla silenciosamente ni
 * degrada a modo sin contenedor sin avisar).
 *
 * Cuando usarlo: agentes autonomos sueltos sobre codigo no confiable,
 * pruebas de comandos potencialmente destructivos, o cualquier tarea de
 * mayor riesgo donde se prefiera aislamiento de proceso real ademas de los
 * guards de patron de comando (destructive-op-guard.js, etc., que siguen
 * activos DENTRO del contenedor tambien -- son capas complementarias, no
 * alternativas).
 */

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const DOCKER_DIR = path.join(__dirname, '..', 'docker');

function comandoDisponible(cmd) {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
  return r.status === 0;
}

function main() {
  if (!comandoDisponible('docker')) {
    process.stderr.write(
      '[sandbox] Docker no esta instalado o no esta en PATH.\n' +
      'Esta capacidad es opcional -- el uso normal de ai-core sin Docker sigue funcionando igual.\n' +
      'Instalar Docker Desktop (Windows/Mac) o docker-engine (Linux) para usar el modo sandbox.\n'
    );
    process.exit(1);
  }

  const forzarBuild = process.argv.includes('--build');
  const hostPath = process.env.AI_CORE_HOST_PATH || path.resolve(DOCKER_DIR, '..');

  process.stdout.write(`[sandbox] Montando "${hostPath}" como volumen del contenedor.\n`);

  if (forzarBuild) {
    const build = spawnSync('docker', ['compose', 'build'], {
      cwd: DOCKER_DIR,
      stdio: 'inherit',
      env: { ...process.env, AI_CORE_HOST_PATH: hostPath },
    });
    if (build.status !== 0) process.exit(build.status || 1);
  }

  const run = spawnSync('docker', ['compose', 'run', '--rm', 'ai-core-sandbox'], {
    cwd: DOCKER_DIR,
    stdio: 'inherit',
    env: { ...process.env, AI_CORE_HOST_PATH: hostPath },
  });

  process.exit(run.status || 0);
}

main();
