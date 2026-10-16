'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, runScript } = require('./_shared');

describe('outside-path-guard.js — escrituras y borrados fuera del proyecto', () => {
  const GUARD = path.join(BIN, 'outside-path-guard.js');
  const JAILBREAK_GUARD = path.join(BIN, 'jailbreak-guard.js');
  const sufijo = `${process.pid}-${Math.random().toString(36).slice(2)}`;
  const base  = path.join(os.tmpdir(), `outside-guard-${sufijo}`).replaceAll('\\', '/');
  const raiz  = `${base}/ws`;
  const fuera = `${base}/fuera`;
  const dirBG = `${base}/bg`;

  before(() => {
    fs.mkdirSync(raiz, { recursive: true });
    fs.mkdirSync(fuera, { recursive: true });
    fs.mkdirSync(dirBG, { recursive: true });
  });
  after(() => fs.rmSync(base, { recursive: true, force: true }));

  function run(cmd, env = {}) {
    return runScript(GUARD, [], {
      CLAUDE_TOOL_INPUT_command: cmd,
      AI_CORE_PROJECT_ROOT: raiz,
      AI_CORE_BREAK_GLASS_DIR: dirBG,
      AI_CORE_BREAK_GLASS_LOG: `${dirBG}/log.jsonl`,
      ...env,
    });
  }

  describe('bloquea destinos fuera del proyecto', () => {
    const casos = [
      ['redireccion a ruta absoluta externa', `echo ok > '${fuera}/CANARY_G02.txt'`],
      ['rm de archivo externo', `rm -f '${fuera}/victima.txt'`],
      ['redireccion a $HOME', 'echo ok > "$HOME/CANARY_G06.txt"'],
      ['redireccion a ~', 'echo ok > ~/CANARY.txt'],
      ['tee a ruta externa', `echo hi | tee ${fuera}/a.txt`],
      ['append externo', `echo hi >> ${fuera}/a.txt`],
      ['cp con destino externo', `cp a.txt ${fuera}/b.txt`],
      ['mv con destino externo', `mv a.txt ${fuera}/b.txt`],
      ['escape relativo con ..', 'echo x > ../escape.txt'],
      ['rm recursivo tras &&', `true && rm -rf ${fuera}/carpeta`],
      ['redireccion junto a stderr', `ls 2>&1 > ${fuera}/salida.txt`],
    ];
    for (const [nombre, cmd] of casos) {
      test(nombre, () => {
        const r = run(cmd);
        assert.equal(r.status, 2, r.stderr);
        assert.match(r.stderr, /OUTSIDE-PATH-GUARD/);
        assert.match(r.stderr, /CONFIRMAR-[a-f0-9]{8}/);
      });
    }
  });

  describe('permite lo legitimo (control y falsos positivos)', () => {
    const casos = [
      ['escritura dentro del proyecto (relativa)', 'echo ok > dentro.txt'],
      ['escritura dentro del proyecto (absoluta)', `echo ok > ${raiz}/sub/x.txt`],
      ['descartar salida en /dev/null', 'ls > /dev/null 2>&1'],
      ['stderr a /dev/null', 'cmd 2>/dev/null'],
      ['duplicar descriptor', 'echo a >&2'],
      ['rm dentro del proyecto', 'rm build/out.js'],
      ['leer desde fuera hacia dentro', `cp ${fuera}/a.txt ./a.txt`],
      ['pipeline sin escritura', 'grep x file | wc -l'],
      ['heredoc con redireccion citada en el cuerpo', "cat <<'EOF' > nota.md\necho hola > /etc/passwd\nEOF"],
      ['mensaje de commit que cita rutas', 'git commit -m "docs: rm -f /x > /y"'],
      ['comparacion con > dentro de comillas', 'echo "a > b"'],
    ];
    for (const [nombre, cmd] of casos) {
      test(nombre, () => {
        const r = run(cmd);
        assert.equal(r.status, 0, r.stderr);
      });
    }

    test('el temporal del sistema se permite cuando el proyecto no vive dentro de el', () => {
      const r = runScript(GUARD, [], {
        CLAUDE_TOOL_INPUT_command: `echo x > ${os.tmpdir().replaceAll('\\', '/')}/salida-guard.txt`,
        AI_CORE_PROJECT_ROOT: REPO,
      });
      assert.equal(r.status, 0, r.stderr);
    });

    test('sin comando en la entrada sale 0', () => {
      assert.equal(runScript(GUARD, [], { AI_CORE_PROJECT_ROOT: raiz }).status, 0);
    });
  });

  describe('break-glass', () => {
    function confirmar(id) {
      return spawnSync('node', [JAILBREAK_GUARD], {
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          CLAUDE_USER_PROMPT: `CONFIRMAR-${id}`,
          AI_CORE_BREAK_GLASS_DIR: dirBG,
          AI_CORE_BREAK_GLASS_LOG: `${dirBG}/log.jsonl`,
          AI_CORE_JAILBREAK_BYPASS_DIR: `${dirBG}/jb`,
        },
      });
    }

    test('confirmar el id autoriza el reintento exacto y no otro destino', () => {
      const cmd = `echo ok > ${fuera}/aprobado.txt`;
      const id = run(cmd).stderr.match(/CONFIRMAR-([a-f0-9]{8})/)[1];
      assert.equal(confirmar(id).status, 0);
      assert.equal(run(cmd).status, 0, 'el reintento exacto debe pasar');
      assert.equal(run(`echo ok > ${fuera}/otro.txt`).status, 2, 'otro destino sigue bloqueado');
    });
  });
});
