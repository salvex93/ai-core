'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, runScript } = require('./_shared');

describe('destructive-op-guard.js — infraestructura y ofuscacion', () => {
  const GUARD = path.join(BIN, 'destructive-op-guard.js');
  const JAILBREAK_GUARD = path.join(BIN, 'jailbreak-guard.js');

  function run(cmd, env = {}) {
    return runScript(GUARD, [], { CLAUDE_TOOL_INPUT_command: cmd, ...env });
  }

  describe('patrones de infraestructura (verificados contra kubernetes.io, developer.hashicorp.com, docs.docker.com, git-scm.com)', () => {
    test('bloquea "kubectl delete --all" y "--all-namespaces" sin --dry-run', () => {
      assert.equal(run('kubectl delete pods --all -n produccion').status, 2);
      assert.equal(run('kubectl delete deployment --all-namespaces').status, 2);
    });

    test('permite "kubectl delete --all" cuando incluye --dry-run', () => {
      assert.equal(run('kubectl delete pods --all --dry-run=server').status, 0);
    });

    test('permite "kubectl delete" de un recurso especifico por nombre', () => {
      assert.equal(run('kubectl delete pod mi-pod-123').status, 0);
    });

    test('bloquea "terraform destroy" y "terraform apply -destroy" sin -target', () => {
      assert.equal(run('terraform destroy').status, 2);
      assert.equal(run('terraform apply -destroy').status, 2);
    });

    test('permite "terraform destroy -target" (alcance acotado a un recurso)', () => {
      assert.equal(run('terraform destroy -target aws_instance.example').status, 0);
    });

    test('bloquea "terraform apply -auto-approve" (sin revision humana del plan)', () => {
      assert.equal(run('terraform apply -auto-approve').status, 2);
    });

    test('permite "terraform plan -destroy" (solo genera el plan, no lo aplica)', () => {
      assert.equal(run('terraform plan -destroy').status, 0);
    });

    test('bloquea "docker system prune -a --volumes"', () => {
      assert.equal(run('docker system prune -a --volumes').status, 2);
    });

    test('permite "docker system prune" sin --volumes (nunca borra volumenes por defecto)', () => {
      assert.equal(run('docker system prune -a').status, 0);
      assert.equal(run('docker system prune').status, 0);
    });

    test('bloquea "docker volume rm"', () => {
      assert.equal(run('docker volume rm mi_volumen_datos').status, 2);
    });

    test('bloquea "git push --delete"/"-d" de una rama remota y la sintaxis antigua ":rama"', () => {
      assert.equal(run('git push origin --delete feature-vieja').status, 2);
      assert.equal(run('git push origin -d feature-vieja').status, 2);
      assert.equal(run('git push origin :feature-vieja').status, 2);
    });

    test('permite "git push origin HEAD:main" (push normal con refspec, no borrado)', () => {
      // El lado izquierdo del ":" tiene contenido (HEAD) -- no es un borrado
      // de rama remota, es la sintaxis normal de refspec origen:destino.
      assert.equal(run('git push origin HEAD:main').status, 0);
    });

    test('bloquea "DELETE FROM" y "UPDATE ... SET" sin WHERE', () => {
      assert.equal(run('psql -c "DELETE FROM usuarios"').status, 2);
      assert.equal(run('psql -c "UPDATE usuarios SET activo = false"').status, 2);
    });

    test('permite "DELETE FROM"/"UPDATE" con WHERE (uso rutinario)', () => {
      assert.equal(run('psql -c "DELETE FROM usuarios WHERE id = 1"').status, 0);
      assert.equal(run('psql -c "UPDATE usuarios SET activo = false WHERE id = 1"').status, 0);
    });

    test('permite un SELECT (nunca debe activar una regla de verbo DML destructivo)', () => {
      assert.equal(run('psql -c "SELECT COUNT(*) FROM usuarios"').status, 0);
    });
  });

  describe('DROP DATABASE, equivalentes Windows de rm -rf, y ofuscacion (hallazgos de auditoria 2026-08-07)', () => {
    test('bloquea "DROP DATABASE"', () => {
      assert.equal(run('psql -c "DROP DATABASE produccion"').status, 2);
    });

    test('bloquea "rm --recursive --force" (formas largas equivalentes a -rf, hallazgo auditoria 2026-08-14)', () => {
      assert.equal(run('rm --recursive --force /tmp/x').status, 2);
      assert.equal(run('rm --force --recursive /tmp/x').status, 2);
      assert.equal(run('rm -r --force /tmp/x').status, 2);
      assert.equal(run('rm --recursive -f /tmp/x').status, 2);
    });

    test('permite "DROP DATABASE IF EXISTS ... -- confirmado" documentado como intencional', () => {
      assert.equal(run('psql -c "DROP DATABASE IF EXISTS staging -- confirmado"').status, 0);
    });

    test('bloquea "del /f /s /q" (cmd.exe, equivalente Windows de rm -rf)', () => {
      assert.equal(run('del /f /s /q build').status, 2);
      assert.equal(run('del /s /f /q build').status, 2);
    });

    test('permite "del archivo.txt" sin /f /s (borrado simple de un archivo)', () => {
      assert.equal(run('del archivo.txt').status, 0);
    });

    test('bloquea "Remove-Item -Recurse -Force" (PowerShell, equivalente Windows de rm -rf)', () => {
      assert.equal(run('Remove-Item -Recurse -Force build').status, 2);
      assert.equal(run('Remove-Item -Force -Recurse build').status, 2);
    });

    test('bloquea alias reales de Remove-Item verificados contra learn.microsoft.com (hallazgo red-team 2026-08-15: "ri" evadia el guard)', () => {
      assert.equal(run('ri -Recurse -Force build').status, 2);
      assert.equal(run('rd -Recurse -Force build').status, 2);
      assert.equal(run('erase -Recurse -Force build').status, 2);
    });

    test('permite "Remove-Item archivo.txt" sin -Recurse -Force', () => {
      assert.equal(run('Remove-Item archivo.txt').status, 0);
    });
  });

  describe('normalizacion Unicode y case-insensitivity (hallazgos red-team 2026-08-15)', () => {
    test('bloquea "RM -rf" en mayusculas (nombre de comando, no distingue seguridad por case)', () => {
      assert.equal(run('RM -rf /datos-importantes').status, 2);
    });

    test('bloquea "DRОP TABLE" con homoglifo cirilico О (U+041E) en vez de O latina', () => {
      const payload = `psql -c "DR${'О'}P TABLE usuarios"`;
      assert.equal(run(payload).status, 2);
    });

    test('bloquea "GIT RESET --hard" y "GIT CLEAN -f" en mayusculas', () => {
      assert.equal(run('GIT RESET --hard').status, 2);
      assert.equal(run('GIT CLEAN -f').status, 2);
    });

    test('"git branch -D" mayuscula sigue distinguiendose de "-d" minuscula (case intencional, NO normalizado a insensitive)', () => {
      assert.equal(run('git branch -D rama-vieja').status, 2, '-D mayuscula debe seguir bloqueando');
      assert.equal(run('git branch -d rama-vieja').status, 0, '-d minuscula (alternativa segura documentada) debe seguir permitida');
    });
  });

  describe('resolucion previa: decodificacion y fragmentacion antes de ejecutar (causa raiz 2, red-team 2026-08-15)', () => {
    test('bloquea "rm -rf" codificado en base64 y decodificado via pipe a bash', () => {
      const r = run('echo cm0gLXJmIC9pbXBvcnRhbnQtZGF0YQ== | base64 -d | bash');
      assert.equal(r.status, 2);
    });

    test('bloquea "rm -rf" fragmentado en 2 variables de shell reconstruidas en bash -c', () => {
      const r = run('A="rm -"; B="rf /datos-importantes"; bash -c "$A$B"');
      assert.equal(r.status, 2);
    });

    test('permite un uso normal de variables de shell sin fragmentacion de comando destructivo', () => {
      const r = run('A="hola mundo"; echo "$A"');
      assert.equal(r.status, 0);
    });

    test('permite mencionar "base64" en un comando sin decode + ejecucion (no es un intento real de resolucion previa)', () => {
      const r = run('echo "este script codifica el payload en base64 antes de subirlo"');
      assert.equal(r.status, 0);
    });

    test('bloquea comando destructivo evaluado dinamicamente via eval/Invoke-Expression/iex sobre una variable', () => {
      assert.equal(run('eval $CMD_PELIGROSO').status, 2);
      assert.equal(run('Invoke-Expression $cmdPeligroso').status, 2);
      assert.equal(run('iex ${cmd}').status, 2);
      assert.equal(run('eval $(echo cm -rf construido en runtime)').status, 2);
    });

    test('permite eval/Invoke-Expression sobre un literal (no hay ofuscacion real que evadir)', () => {
      assert.equal(run('eval "echo hola"').status, 0);
    });
  });
});
