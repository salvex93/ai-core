'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, runScript } = require('./_shared');

describe('destructive-op-guard.js', () => {
  const GUARD = path.join(BIN, 'destructive-op-guard.js');
  const JAILBREAK_GUARD = path.join(BIN, 'jailbreak-guard.js');

  function run(cmd, env = {}) {
    return runScript(GUARD, [], { CLAUDE_TOOL_INPUT_command: cmd, ...env });
  }

  test('sale con codigo 0 si no hay comando', () => {
    const r = runScript(GUARD, []);
    assert.equal(r.status, 0, 'debe permitir cuando no hay comando en el env');
  });

  test('bloquea "rm -rf" sobre una ruta real', () => {
    const r = run('rm -rf node_modules');
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('DESTRUCTIVE-OP-GUARD'));
  });

  test('bloquea "rm -rf /" y variantes con raiz', () => {
    assert.equal(run('rm -rf /').status, 2);
    assert.equal(run('rm -rf ~').status, 2);
  });

  test('permite "rm" sin -rf sobre un archivo especifico', () => {
    assert.equal(run('rm archivo-temporal.txt').status, 0);
  });

  test('bloquea "git push --force" y "-f"', () => {
    assert.equal(run('git push --force origin main').status, 2);
    assert.equal(run('git push -f origin main').status, 2);
  });

  test('permite "git push --force-with-lease"', () => {
    // Mas seguro que --force a secas -- falla si el remoto tiene commits que
    // el operador no vio, en vez de sobreescribir ciegamente.
    assert.equal(run('git push --force-with-lease origin main').status, 0);
  });

  test('permite "git push" normal', () => {
    assert.equal(run('git push origin main').status, 0);
  });

  test('bloquea "git reset --hard"', () => {
    assert.equal(run('git reset --hard HEAD~1').status, 2);
  });

  test('permite "git reset" sin --hard', () => {
    assert.equal(run('git reset HEAD~1').status, 0);
  });

  test('bloquea "git clean -f" y "-fd"', () => {
    assert.equal(run('git clean -f').status, 2);
    assert.equal(run('git clean -fd').status, 2);
  });

  test('bloquea "git branch -D"', () => {
    assert.equal(run('git branch -D feature-vieja').status, 2);
  });

  test('permite "git branch -d" (delete seguro, solo si ya esta mergeado)', () => {
    assert.equal(run('git branch -d feature-vieja').status, 0);
  });

  test('bloquea DROP TABLE / TRUNCATE en comandos de base de datos', () => {
    assert.equal(run('psql -c "DROP TABLE usuarios"').status, 2);
    assert.equal(run('psql -c "TRUNCATE TABLE pedidos"').status, 2);
  });

  test('permite un SELECT o un DROP TABLE IF EXISTS documentado como intencional en un comentario del propio comando', () => {
    assert.equal(run('psql -c "SELECT * FROM usuarios"').status, 0);
  });

  test('permite "grep TRUNCATE"/"DROP TABLE" como busqueda de texto, no ejecuta nada contra una BD', () => {
    // Falso positivo real: la palabra aparece dentro del PATRON de busqueda,
    // no como DDL real enviado a una base de datos.
    assert.equal(run('grep TRUNCATE migraciones.sql').status, 0);
    assert.equal(run('grep -e "DROP TABLE" schema.sql').status, 0);
    assert.equal(run('rg "TRUNCATE TABLE" src/').status, 0);
  });

  test('SI bloquea TRUNCATE/DROP TABLE real aunque aparezca junto a un grep encadenado', () => {
    assert.equal(run('grep -c usuarios log.txt; psql -c "TRUNCATE TABLE usuarios"').status, 2);
  });

  test('permite comandos no destructivos (npm test, git status, ls)', () => {
    assert.equal(run('npm test').status, 0);
    assert.equal(run('git status --short').status, 0);
    assert.equal(run('ls -la').status, 0);
  });

  test('no bloquea un git commit cuyo MENSAJE menciona un patron destructivo como texto descriptivo', () => {
    // Falso positivo real detectado en produccion: un commit real que
    // documentaba este mismo guard (mensaje mencionando "rm -rf",
    // "git push --force", "DROP TABLE" como texto explicativo) se bloqueaba
    // a si mismo -- el patron no distinguia el comando real de shell del
    // contenido citado dentro del mensaje de -m/-F.
    const msg = 'fix: nunca usar rm -rf en produccion, revisar antes de git push --force';
    assert.equal(run(`git commit -m "${msg}"`).status, 0);
    assert.equal(run(`git commit -F commit-msg.txt`).status, 0);
  });

  test('SI bloquea un rm -rf real aunque el comando incluya un git commit encadenado', () => {
    // El commit no es lo que se bloquea -- el rm -rf real fuera de las
    // comillas del mensaje si debe seguir bloqueado.
    assert.equal(run('rm -rf build/ && git commit -m "limpiar build"').status, 2);
  });

  test('sin CLAUDE_TOOL_INPUT_command, lee tool_input.command del JSON de stdin (contrato real de hooks Claude Code)', () => {
    const evento = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/algo' } });
    const r = spawnSync('node', [GUARD], { encoding: 'utf8', cwd: REPO, input: evento });
    assert.equal(r.status, 2, 'debe bloquear leyendo el comando real desde stdin');
    assert.ok(r.stderr.includes('DESTRUCTIVE-OP-GUARD'));
  });

  test('sin CLAUDE_TOOL_INPUT_command y sin stdin con datos, no bloquea y no lanza excepcion', () => {
    const r = spawnSync('node', [GUARD], { encoding: 'utf8', cwd: REPO, input: '' });
    assert.equal(r.status, 0);
  });

  describe('mensaje real de git commit -- Co-Authored-By y menciones de IA', () => {
    test('bloquea "git commit -m" cuyo mensaje real incluye Co-Authored-By', () => {
      const r = run('git commit -m "fix: ajuste de config\n\nCo-Authored-By: Claude <noreply@anthropic.com>"');
      assert.equal(r.status, 2);
      assert.ok(r.stderr.includes('DESTRUCTIVE-OP-GUARD'));
    });

    test('bloquea "git commit -m" cuyo mensaje real menciona una herramienta de IA como autor', () => {
      assert.equal(run('git commit -m "Generated with Claude Code"').status, 2);
      assert.equal(run('git commit -m "cambios sugeridos por ChatGPT"').status, 2);
    });

    test('permite "git commit -m" cuyo mensaje real es normal, sin mencion de IA', () => {
      assert.equal(run('git commit -m "fix: corrige el timeout del cliente HTTP"').status, 0);
    });

    test('NO bloquea "git commit -m" cuyo mensaje describe la regla como texto (no es autoria real)', () => {
      // Mismo principio que el test de "texto descriptivo" de arriba, pero
      // aplicado especificamente a Co-Authored-By/menciones de IA: un commit
      // que documenta esta propia regla no debe autobloquearse.
      const msg = 'docs: prohibir Co-Authored-By y menciones a Claude en mensajes de commit';
      assert.equal(run(`git commit -m "${msg}"`).status, 0);
    });

    test('bloquea "git commit -F archivo.txt" si el ARCHIVO real referenciado contiene Co-Authored-By', () => {
      const fs = require('node:fs');
      const os = require('node:os');
      const archivo = path.join(os.tmpdir(), `commit-msg-test-${process.pid}.txt`);
      fs.writeFileSync(archivo, 'feat: nueva funcionalidad\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n', 'utf8');
      try {
        assert.equal(run(`git commit -F ${archivo}`).status, 2);
      } finally {
        fs.rmSync(archivo, { force: true });
      }
    });

    test('permite "git commit -F archivo.txt" si el archivo real no menciona IA', () => {
      const fs = require('node:fs');
      const os = require('node:os');
      const archivo = path.join(os.tmpdir(), `commit-msg-test-ok-${process.pid}.txt`);
      fs.writeFileSync(archivo, 'feat: nueva funcionalidad sin rastro de IA\n', 'utf8');
      try {
        assert.equal(run(`git commit -F ${archivo}`).status, 0);
      } finally {
        fs.rmSync(archivo, { force: true });
      }
    });
  });

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

    test('permite "Remove-Item archivo.txt" sin -Recurse -Force', () => {
      assert.equal(run('Remove-Item archivo.txt').status, 0);
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

  describe('break-glass: excepcion auditable para reglas sin alternativa segura', () => {
    function nuevoDirBreakGlass() {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'destructive-op-breakglass-'));
    }

    function confirmar(dir, id) {
      return spawnSync('node', [JAILBREAK_GUARD], {
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          CLAUDE_USER_PROMPT: `CONFIRMAR-${id}`,
          AI_CORE_BREAK_GLASS_DIR: dir,
          AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl'),
          AI_CORE_JAILBREAK_BYPASS_DIR: path.join(dir, 'jb'),
        },
      });
    }

    test('"rm -rf" bloqueado genera un id CONFIRMAR-<id> real en stderr', () => {
      const dir = nuevoDirBreakGlass();
      const r = run('rm -rf build/', { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') });
      assert.equal(r.status, 2);
      assert.match(r.stderr, /CONFIRMAR-[a-f0-9]{8}/);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('confirmar el id permite el REINTENTO EXACTO de "rm -rf build/"', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const cmd = 'rm -rf build/';

      const bloqueo = run(cmd, env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      const confirmacion = confirmar(dir, id);
      assert.equal(confirmacion.status, 0);

      const reintento = run(cmd, env);
      assert.equal(reintento.status, 0, 'el reintento exacto del comando ya confirmado debe pasar');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('confirmar el id NO autoriza un "rm -rf" DISTINTO (no es excepcion general)', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };

      const bloqueo = run('rm -rf build/', env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      confirmar(dir, id);

      const otroComando = run('rm -rf dist/', env);
      assert.equal(otroComando.status, 2, 'un comando destructivo distinto al aprobado debe seguir bloqueado');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('reintentar la misma accion una SEGUNDA vez tras confirmar vuelve a bloquear (un solo uso)', () => {
      const dir = nuevoDirBreakGlass();
      const env = { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') };
      const cmd = 'git reset --hard HEAD~1';

      const bloqueo = run(cmd, env);
      const id = bloqueo.stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      confirmar(dir, id);

      run(cmd, env); // consume la aprobacion de un solo uso
      const segundoIntento = run(cmd, env);
      assert.equal(segundoIntento.status, 2, 'la aprobacion de un solo uso no debe cubrir un segundo reintento');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('DROP DATABASE con "-- confirmado" literal sigue funcionando sin necesitar break-glass (retrocompatible)', () => {
      // La excepcion de comentario literal ya existente NO se retira -- sigue
      // siendo una via valida, break-glass es una alternativa adicional para
      // cuando no se quiere/puede anotar el comentario en el propio comando.
      assert.equal(run('psql -c "DROP DATABASE IF EXISTS staging -- confirmado"').status, 0);
    });

    test('ofuscacion (eval sobre variable) NUNCA genera break-glass -- hard-stop absoluto', () => {
      const dir = nuevoDirBreakGlass();
      const r = run('eval $CMD_PELIGROSO', { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') });
      assert.equal(r.status, 2);
      assert.ok(!/CONFIRMAR-/.test(r.stderr), 'ofuscacion no debe ofrecer ninguna via de excepcion');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('Co-Authored-By en commit NUNCA genera break-glass -- hard-stop absoluto', () => {
      const dir = nuevoDirBreakGlass();
      const r = run('git commit -m "fix: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"', { AI_CORE_BREAK_GLASS_DIR: dir, AI_CORE_BREAK_GLASS_LOG: path.join(dir, 'log.jsonl') });
      assert.equal(r.status, 2);
      assert.ok(!/CONFIRMAR-/.test(r.stderr), 'atribucion de IA en commit no debe ofrecer ninguna via de excepcion');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('git push --force-with-lease sigue sin bloquear -- alternativa segura, no pasa por break-glass', () => {
      assert.equal(run('git push --force-with-lease origin main').status, 0);
    });
  });
});
