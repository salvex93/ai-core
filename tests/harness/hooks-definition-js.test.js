'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('hooks-definition.js', () => {
  const { buildHooksSection, nodeConPermiso } = require(path.join(BIN, 'hooks-definition.js'));

  test('produce las 6 categorias de hooks esperadas', () => {
    const hooks = buildHooksSection((s) => `"/fake/${s}"`);
    assert.deepEqual(
      Object.keys(hooks).sort(),
      ['PostToolUse', 'PostToolUseFailure', 'PreToolUse', 'Stop', 'SubagentStop', 'UserPromptSubmit'].sort()
    );
  });

  test('usa la funcion bin() pasada para resolver cada script, no rutas hardcodeadas', () => {
    const hooks = buildHooksSection((s) => `"MARCADOR-${s}"`);
    const str = JSON.stringify(hooks);
    assert.match(str, /MARCADOR-subagent-guard\.js/);
    assert.match(str, /MARCADOR-bash-verbosity-guard\.js/);
    assert.match(str, /MARCADOR-memory-vault-prune-check\.js/);
    assert.match(str, /MARCADOR-destructive-op-guard\.js/);
  });

  test('con tmpDir explicito: usa el valor REAL de os.tmpdir(), no el literal ${TMPDIR:-/tmp}', () => {
    // Bug real de CI (2026-08-14): el literal '"${TMPDIR:-/tmp}/*"' depende
    // de que el shell que invoca el comando expanda esa sintaxis POSIX antes
    // de pasarselo a Node -- en macOS runners de GitHub Actions, $TMPDIR real
    // no es /tmp (suele ser /var/folders/xx/xxxxx/T/, a veces con prefijo
    // /private/ segun si Node resuelve el symlink o no), y el patron
    // declarado en --allow-fs-read/--allow-fs-write podia no coincidir con
    // la ruta real donde Node escribe/lee (os.tmpdir()), causando
    // ERR_ACCESS_DENIED especifico de esa plataforma. Resolver tmpDir en
    // build time (mismo proceso Node que luego ejecuta el guard) elimina la
    // categoria entera del bug -- ya no depende de que un shell externo
    // expanda nada.
    const tmpDirReal = '/var/folders/xx/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/T';
    const hooks = buildHooksSection((s) => `"/repo/.claude/bin/${s}"`, tmpDirReal);
    const str = JSON.stringify(hooks);

    assert.match(str, /var\/folders\/xx/, 'debe usar el tmpDir real pasado, no el literal ${TMPDIR:-/tmp}');
    assert.doesNotMatch(str, /\$\{TMPDIR/, 'no debe quedar ningun literal sin resolver de ${TMPDIR:-/tmp}');
  });

  test('sin tmpDir explicito (retrocompatible): sigue usando el literal ${TMPDIR:-/tmp} como fallback', () => {
    const hooks = buildHooksSection((s) => `"/repo/.claude/bin/${s}"`);
    const str = JSON.stringify(hooks);
    assert.match(str, /\$\{TMPDIR:-\/tmp\}/, 'sin tmpDir explicito, debe conservar el comportamiento anterior');
  });

  test('SubagentStop incluye los 3 guards de validacion de output', () => {
    const hooks = buildHooksSection((s) => `"${s}"`);
    const str = JSON.stringify(hooks.SubagentStop);
    assert.match(str, /subagent-review\.js/);
    assert.match(str, /cross-verify-gate\.js/);
    assert.match(str, /injection-guard\.js/);
  });

  test('SubagentStop incluye subagent-guard-release.js para liberar el lock de paralelismo al terminar el subagente', () => {
    const hooks = buildHooksSection((s) => `"${s}"`);
    const str = JSON.stringify(hooks.SubagentStop);
    assert.match(str, /subagent-guard-release\.js/);
  });

  test('agent-metrics.js registra --status fail en PostToolUseFailure para el mismo grupo generico que --status ok en PostToolUse', () => {
    const hooks = buildHooksSection((s) => `"${s}"`);

    const grupoGenerico = 'Bash|Read|Write|Edit|Agent';

    const entradaOk = (hooks.PostToolUse || []).find(g => g.matcher === grupoGenerico);
    assert.ok(entradaOk, 'PostToolUse debe tener una entrada para el matcher generico Bash|Read|Write|Edit|Agent');
    assert.match(JSON.stringify(entradaOk), /agent-metrics\.js.*record --status ok/);

    const entradaFail = (hooks.PostToolUseFailure || []).find(g => g.matcher === grupoGenerico);
    assert.ok(entradaFail, 'PostToolUseFailure debe tener una entrada espejo para el matcher generico Bash|Read|Write|Edit|Agent');
    assert.match(JSON.stringify(entradaFail), /agent-metrics\.js.*record --status fail/);
  });

  describe('nodeConPermiso', () => {
    test('en POSIX antepone --permission y los flags de fs-read/fs-write', () => {
      const cmd = nodeConPermiso('"/repo/.claude/bin/secrets-guard.js"', {
        fsRead: ['"/repo/.claude/bin/*"'],
        fsWrite: ['"/tmp/*"'],
      }, 'linux');

      assert.equal(
        cmd,
        'node --permission --allow-fs-read="/repo/.claude/bin/*" --allow-fs-write="/tmp/*" "/repo/.claude/bin/secrets-guard.js"'
      );
    });

    test('en darwin (macOS) tambien activa el Permission Model', () => {
      const cmd = nodeConPermiso('"/repo/.claude/bin/code-exec-guard.js"', {
        fsRead: ['"/repo/.claude/bin/*"'],
      }, 'darwin');

      assert.match(cmd, /^node --permission --allow-fs-read="\/repo\/\.claude\/bin\/\*" "\/repo\/\.claude\/bin\/code-exec-guard\.js"$/);
    });

    test('en win32 tambien activa el Permission Model -- confirmado en cmd.exe real (spike de esta sesion)', () => {
      const cmd = nodeConPermiso('"/repo/.claude/bin/destructive-op-guard.js"', {
        fsRead: ['"/repo/.claude/bin/*"'],
      }, 'win32');

      assert.equal(cmd, 'node --permission --allow-fs-read="/repo/.claude/bin/*" "/repo/.claude/bin/destructive-op-guard.js"');
    });

    test('sin permisos declarados, en POSIX solo agrega el flag --permission', () => {
      const cmd = nodeConPermiso('"/repo/.claude/bin/hook.js"', {}, 'linux');
      assert.equal(cmd, 'node --permission "/repo/.claude/bin/hook.js"');
    });
  });

  describe('sandboxing de hooks prioritarios en buildHooksSection', () => {
    test('destructive-op-guard.js, code-exec-guard.js, secrets-guard.js e injection-guard.js usan --permission en POSIX', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
        const hooks = build((s) => `"/repo/.claude/bin/${s}"`);
        const str = JSON.stringify(hooks);

        assert.match(str, /--permission.*destructive-op-guard\.js/);
        assert.match(str, /--permission.*code-exec-guard\.js/);
        assert.match(str, /--permission.*secrets-guard\.js/);
        assert.match(str, /--permission.*injection-guard\.js/);
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
      }
    });

    test('en Windows (win32), los mismos 4 hooks TAMBIEN usan --permission (confirmado en cmd.exe real)', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      try {
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
        const hooks = build((s) => `"/repo/.claude/bin/${s}"`);
        const str = JSON.stringify(hooks);

        assert.match(str, /--permission.*destructive-op-guard\.js/);
        assert.match(str, /--permission.*code-exec-guard\.js/);
        assert.match(str, /--permission.*secrets-guard\.js/);
        assert.match(str, /--permission.*injection-guard\.js/);
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
      }
    });
  });

  describe('sandboxing ampliado: los hooks restantes registrados en buildHooksSection', () => {
    // Los hooks reales registrados en buildHooksSection, menos process-guard.js
    // (wrapper de otros hooks, no se sandboxea a si mismo -- ver mas abajo) y
    // git-queue-advisor.js (necesita red real para gh/git remoto, fuera de
    // alcance de fs-read/fs-write puros de esta ronda).
    const HOOKS_CON_SANDBOX = [
      'destructive-op-guard.js', 'code-exec-guard.js', 'secrets-guard.js', 'injection-guard.js',
      'agent-metrics.js', 'agent-tools-guard.js', 'agent-paths-guard.js', 'mutating-action-guard.js', 'aiops-score.js', 'bash-verbosity-guard.js', 'capture-event.js',
      'circuit-breaker.js', 'cross-verify-gate.js', 'dependency-tracer.js', 'detect-role.js',
      'detox.js', 'diff-map-trigger.js', 'guard-read.js', 'health-check.js', 'issue-reporter.js',
      'memory-index-stop.js', 'memory-vault-prune-check.js', 'moa-context-gatherer.js',
      'ponytail-check.js', 'pre-commit-tdd.js', 'security-check.js', 'session-summary.js',
      'standards-guard.js', 'subagent-grader.js', 'subagent-guard.js', 'subagent-review.js',
      'syntax-check.js', 'validate-map.js',
    ];

    for (const plataforma of ['linux', 'darwin', 'win32']) {
      test(`los ${HOOKS_CON_SANDBOX.length} hooks propios usan --permission en ${plataforma} (confirmado en cmd.exe real para win32)`, () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', { value: plataforma });
        try {
          delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
          const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
          const hooks = build((s) => `"/repo/.claude/bin/${s}"`);
          const str = JSON.stringify(hooks);

          for (const hook of HOOKS_CON_SANDBOX) {
            const escapado = hook.replace(/\./g, '\\.');
            assert.match(str, new RegExp(`--permission[^]*?${escapado}`), `${hook} debe invocarse con --permission en ${plataforma}`);
          }
        } finally {
          Object.defineProperty(process, 'platform', { value: original });
          delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        }
      });
    }

    test('process-guard.js (wrapper) no se sandboxea a si mismo, pero el hook que envuelve si', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
        const hooks = build((s) => `"/repo/.claude/bin/${s}"`);
        const preToolUseStr = JSON.stringify(hooks.PreToolUse);

        // process-guard.js siempre arranca con "node <ruta-process-guard>" plano
        assert.match(preToolUseStr, /"node \\"\/repo\/\.claude\/bin\/process-guard\.js\\" health node --permission/);
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
      }
    });

    test('secrets-guard.js y guard-read.js preservan su exit code de bloqueo (sin || true), igual que los demas guards de bloqueo', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
        const hooks = build((s) => `"/repo/.claude/bin/${s}"`);

        const comandosSecretsGuard = hooks.UserPromptSubmit
          .flatMap((g) => g.hooks)
          .map((h) => h.command)
          .filter((c) => c.includes('secrets-guard.js'));
        assert.ok(comandosSecretsGuard.length >= 1, 'debe encontrar la invocacion de secrets-guard.js');
        for (const cmd of comandosSecretsGuard) {
          assert.doesNotMatch(cmd, /\|\|\s*true/, `secrets-guard.js no debe anular su exit code de bloqueo: "${cmd}"`);
        }

        const comandosGuardRead = hooks.PreToolUse
          .flatMap((g) => g.hooks)
          .map((h) => h.command)
          .filter((c) => c.includes('guard-read.js'));
        assert.ok(comandosGuardRead.length >= 1, 'debe encontrar la invocacion de guard-read.js');
        for (const cmd of comandosGuardRead) {
          assert.doesNotMatch(cmd, /\|\|\s*true/, `guard-read.js no debe anular su exit code de bloqueo: "${cmd}"`);
        }
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
      }
    });

    test('agent-tools-guard.js cubre TODAS las herramientas que un AGENT.md puede declarar en tools: (Bash/Read/Write/Edit/Grep/Glob/WebFetch/Agent), no solo un subconjunto', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
        const hooks = build((s) => `"/repo/.claude/bin/${s}"`);

        const gruposConGuard = hooks.PreToolUse.filter(
          (g) => JSON.stringify(g.hooks).includes('agent-tools-guard.js')
        );
        assert.ok(gruposConGuard.length >= 1, 'debe existir al menos una entrada PreToolUse con agent-tools-guard.js');

        // Herramientas reales declaradas hoy en algun tools: de .claude/agents/*.md
        // (mcp-registry-navigator declara WebFetch; aiops-auditor/code-reviewer/
        // security-scanner declaran Grep y Glob) -- el matcher debe cubrirlas
        // todas, no solo Bash/Read/Write/Edit.
        const matcherCombinado = gruposConGuard.map((g) => g.matcher).join('|');
        for (const herramienta of ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob', 'WebFetch', 'Agent']) {
          assert.match(
            matcherCombinado,
            new RegExp(`\\b${herramienta}\\b`),
            `el matcher de agent-tools-guard.js debe cubrir "${herramienta}"`
          );
        }

        for (const grupo of gruposConGuard) {
          const comando = grupo.hooks.find((h) => h.command.includes('agent-tools-guard.js')).command;
          assert.doesNotMatch(comando, /\|\|\s*true/, `agent-tools-guard.js no debe anular su exit code de bloqueo: "${comando}"`);
        }
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
      }
    });

    test('agent-paths-guard.js se registra en el mismo matcher que agent-tools-guard.js (scope de herramienta y de ruta corren juntos)', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
        const hooks = build((s) => `"/repo/.claude/bin/${s}"`);

        const grupo = hooks.PreToolUse.find(
          (g) => JSON.stringify(g.hooks).includes('agent-tools-guard.js')
        );
        assert.ok(grupo, 'debe existir el grupo PreToolUse de agent-tools-guard.js');
        assert.match(JSON.stringify(grupo.hooks), /agent-paths-guard\.js/, 'agent-paths-guard.js debe estar en el mismo grupo');

        const comando = grupo.hooks.find((h) => h.command.includes('agent-paths-guard.js')).command;
        assert.doesNotMatch(comando, /\|\|\s*true/, `agent-paths-guard.js no debe anular su exit code de bloqueo: "${comando}"`);
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
      }
    });

    test('mutating-action-guard.js se registra tanto para Bash/subagentes como para mcp__.* (accion mutante hacia un tenant puede llegar por cualquiera de las dos vias)', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
        const hooks = build((s) => `"/repo/.claude/bin/${s}"`);

        const grupoAgentes = hooks.PreToolUse.find(
          (g) => JSON.stringify(g.hooks).includes('agent-tools-guard.js')
        );
        assert.match(JSON.stringify(grupoAgentes.hooks), /mutating-action-guard\.js/, 'debe estar junto a agent-tools-guard.js (cubre Bash)');

        const grupoMcp = hooks.PreToolUse.find((g) => g.matcher === 'mcp__.*');
        assert.ok(grupoMcp, 'debe existir el grupo PreToolUse de mcp__.*');
        assert.match(JSON.stringify(grupoMcp.hooks), /mutating-action-guard\.js/, 'debe estar registrado en el matcher mcp__.*');

        const comandoMcp = grupoMcp.hooks.find((h) => h.command.includes('mutating-action-guard.js')).command;
        assert.doesNotMatch(comandoMcp, /\|\|\s*true/, `mutating-action-guard.js no debe anular su exit code de bloqueo en mcp__.*: "${comandoMcp}"`);
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
      }
    });

    test('destructive-op-guard.js tiene --allow-fs-read/--allow-fs-write suficiente para su require de lib/break-glass.js', () => {
      // Bug real detectado en produccion (2026-08-14): el guard se registraba
      // con nodeConPermiso(bin('destructive-op-guard.js')) SIN segundo
      // argumento -- sin ningun --allow-fs-read. Cuando el guard empezo a
      // usar require('./lib/break-glass') (mecanismo de break-glass), el
      // Node Permission Model bloqueaba esa lectura con ERR_ACCESS_DENIED,
      // el guard salia con exit 1 (no 2), y Claude Code trataba cualquier
      // exit distinto de 2 como "no bloqueante" -- un "rm -rf" real paso sin
      // bloquear pese a que el guard "existia" y sus tests unitarios (que
      // corren con spawnSync, sin --permission) pasaban en verde.
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
        const hooks = build((s) => `"/repo/.claude/bin/${s}"`);

        const comando = hooks.PreToolUse
          .flatMap((g) => g.hooks)
          .map((h) => h.command)
          .find((c) => c.includes('destructive-op-guard.js'));

        assert.ok(comando, 'debe encontrar la invocacion de destructive-op-guard.js');
        assert.match(comando, /--allow-fs-read="\/repo\/\.claude\/bin\/\*"/, 'debe poder leer .claude/bin/lib/break-glass.js via require()');
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
      }
    });

    test('todos los guards que usan lib/break-glass.js tienen --allow-fs-read sobre $TMPDIR (no solo --allow-fs-write)', () => {
      // Bug real detectado en produccion (2026-08-14, segunda capa del mismo
      // problema): "$TMPDIR" nunca aparecia en ningun fsRead de
      // hooks-definition.js, solo en fsWrite (readYWrite/repoReadWrite). Un
      // guard podia ESCRIBIR el lock de break-glass en os.tmpdir() pero el
      // Node Permission Model bloqueaba con ERR_ACCESS_DENIED cualquier
      // intento posterior de LEERLO (fs.readFileSync/fs.existsSync) para
      // confirmarlo -- el mecanismo generaba un id real, pero
      // confirmarBreakGlass()/accionAprobada() nunca podian verificarlo, asi
      // que ningun CONFIRMAR-<id> llegaba a autorizar el reintento. El bug
      // paso inadvertido porque el try/catch de lib/break-glass.js absorbe
      // el error silenciosamente (retorna false, no lanza), consistente con
      // el diseño fail-closed -- pero el mecanismo completo quedaba inerte.
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
        const hooks = build((s) => `"/repo/.claude/bin/${s}"`);

        const GUARDS_CON_BREAK_GLASS = [
          'destructive-op-guard.js', 'mutating-action-guard.js',
          'code-exec-guard.js', 'secrets-guard.js', 'jailbreak-guard.js',
        ];

        const todosLosComandos = [
          ...hooks.UserPromptSubmit.flatMap((g) => g.hooks),
          ...hooks.PreToolUse.flatMap((g) => g.hooks),
        ].map((h) => h.command);

        for (const guard of GUARDS_CON_BREAK_GLASS) {
          const comandos = todosLosComandos.filter((c) => c.includes(guard));
          assert.ok(comandos.length >= 1, `debe encontrar al menos una invocacion de ${guard}`);
          for (const comando of comandos) {
            assert.match(
              comando,
              /--allow-fs-read="\$\{TMPDIR:-\/tmp\}\/\*"/,
              `${guard} debe poder LEER \${TMPDIR:-/tmp} para confirmar/consultar sus propios locks de break-glass: "${comando}"`
            );
          }
        }
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
      }
    });

    test('git-queue-advisor.js queda deliberadamente sin --permission (necesita red real hacia el remoto de git)', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
        const { buildHooksSection: build } = require(path.join(BIN, 'hooks-definition.js'));
        const hooks = build((s) => `"/repo/.claude/bin/${s}"`);

        const comandosGitQueue = [
          ...hooks.PreToolUse.flatMap((g) => g.hooks),
          ...hooks.PostToolUse.flatMap((g) => g.hooks),
        ]
          .map((h) => h.command)
          .filter((c) => c.includes('git-queue-advisor.js'));

        assert.ok(comandosGitQueue.length >= 2, 'debe encontrar las invocaciones de git-queue-advisor.js (push y pull)');
        for (const cmd of comandosGitQueue) {
          assert.doesNotMatch(cmd, /--permission/, `git-queue-advisor.js no debe sandboxearse: "${cmd}"`);
        }
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
        delete require.cache[require.resolve(path.join(BIN, 'hooks-definition.js'))];
      }
    });
  });
});
